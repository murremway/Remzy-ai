import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type MotionStyle = 'kenburns' | 'zoom-in' | 'pan-left' | 'pan-right'
export type AspectRatio = '16:9' | '9:16'

export type RenderSceneInput = {
  text: string
  duration: number
  imageBase64?: string
  mimeType?: string
  captionBase64?: string
}

export type RenderJob = {
  title: string
  aspect: AspectRatio
  captions: boolean
  motion: MotionStyle
  fps?: number
  scenes: RenderSceneInput[]
  audioBase64: string
  audioMimeType?: string
  theme: {
    colors: [string, string, string]
    captionColor: string
    captionBg: string
  }
}

export type AspectSize = { width: number; height: number }

const ASPECT_SIZE: Record<AspectRatio, AspectSize> = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next
      next += 1
      if (index >= items.length) return
      out[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return out
}

export function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.slice(-2000) || `${cmd} exited ${code}`))
        return
      }
      resolve()
    })
  })
}

export function runOut(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.slice(-800) || `${cmd} exited ${code}`))
        return
      }
      resolve(stdout.trim())
    })
  })
}

async function findOnPath(name: string): Promise<string | null> {
  const candidates = [name, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`]
  for (const bin of candidates) {
    try {
      await run(bin, ['-version'])
      return bin
    } catch {
      /* try next */
    }
  }
  return null
}

export async function findFfmpeg(): Promise<string | null> {
  return findOnPath('ffmpeg')
}

export async function findFfprobe(): Promise<string | null> {
  return findOnPath('ffprobe')
}

function solidColorPngArgs(
  width: number,
  height: number,
  color: string,
  outPath: string,
): string[] {
  const hex = color.replace('#', '0x')
  return [
    '-f',
    'lavfi',
    '-i',
    `color=c=${hex}:s=${width}x${height}:d=1`,
    '-frames:v',
    '1',
    '-y',
    outPath,
  ]
}

/** Modest overscan — 8000px scale was the main render bottleneck. */
function zoompanExpr(
  motion: MotionStyle,
  frames: number,
  width: number,
  height: number,
  fps: number,
): string {
  const d = Math.max(frames, 1)
  const size = `${width}x${height}`
  const overscan = Math.round(Math.max(width, height) * 1.35)
  const scale = `scale=${overscan}:-2`
  switch (motion) {
    case 'zoom-in':
      return `${scale},zoompan=z='min(1.0+0.16*on/${d},1.16)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=${size}:fps=${fps}`
    case 'pan-left':
      return `${scale},zoompan=z='1.1':x='(iw-iw/zoom)*on/${d}':y='ih/2-(ih/zoom/2)':d=${d}:s=${size}:fps=${fps}`
    case 'pan-right':
      return `${scale},zoompan=z='1.1':x='(iw-iw/zoom)*(1-on/${d})':y='ih/2-(ih/zoom/2)':d=${d}:s=${size}:fps=${fps}`
    case 'kenburns':
    default:
      return `${scale},zoompan=z='min(1.04+0.1*on/${d},1.14)':x='iw/2-(iw/zoom/2)+24*sin(on/${d}*3.14)':y='ih/2-(ih/zoom/2)':d=${d}:s=${size}:fps=${fps}`
  }
}

async function writeBase64File(base64: string, outPath: string) {
  await fs.writeFile(outPath, Buffer.from(base64, 'base64'))
}

async function encodeScene(
  job: RenderJob,
  scene: RenderSceneInput,
  index: number,
  dir: string,
  ffmpegBin: string,
  width: number,
  height: number,
  fps: number,
): Promise<{ outPath: string; duration: number }> {
  const duration = Math.max(Number(scene.duration) || 2, 1.2)
  const frames = Math.max(Math.round(duration * fps), fps)
  const imgPath = path.join(dir, `scene-${index}.jpg`)
  const outPath = path.join(dir, `clip-${index}.mp4`)

  if (scene.imageBase64) {
    const isPng = (scene.mimeType || '').includes('png')
    if (isPng) {
      const rawPath = path.join(dir, `raw-${index}.png`)
      await writeBase64File(scene.imageBase64, rawPath)
      await run(ffmpegBin, ['-y', '-i', rawPath, '-q:v', '5', imgPath])
    } else {
      await writeBase64File(scene.imageBase64, imgPath)
    }
  } else {
    const color = job.theme.colors[index % job.theme.colors.length]
    await run(ffmpegBin, solidColorPngArgs(width, height, color, imgPath))
  }

  const zp = zoompanExpr(job.motion, frames, width, height, fps)
  const args = ['-y', '-loop', '1', '-i', imgPath]
  let vf = zp

  if (job.captions && scene.captionBase64) {
    const capPath = path.join(dir, `cap-${index}.png`)
    await writeBase64File(scene.captionBase64, capPath)
    args.push('-i', capPath)
    vf = `[0:v]${zp}[v];[v][1:v]overlay=0:0:format=auto`
    args.push('-filter_complex', vf)
  } else {
    args.push('-vf', vf)
  }

  args.push(
    '-t',
    duration.toFixed(3),
    '-r',
    String(fps),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'ultrafast',
    '-crf',
    '26',
    '-an',
    outPath,
  )
  await run(ffmpegBin, args)
  return { outPath, duration }
}

export async function renderVideoWithFfmpeg(
  job: RenderJob,
  workDir: string,
  ffmpegBin: string,
): Promise<{ outputPath: string; duration: number }> {
  const { width, height } = ASPECT_SIZE[job.aspect]
  const fps = job.fps ?? 24
  const id = randomUUID()
  const dir = path.join(workDir, `job-${id}`)
  await fs.mkdir(dir, { recursive: true })

  const audioExt = (job.audioMimeType || '').includes('wav') ? 'wav' : 'mp3'
  const audioPath = path.join(dir, `voice.${audioExt}`)
  await writeBase64File(job.audioBase64, audioPath)

  const encoded = await mapLimit(job.scenes, 3, (scene, i) =>
    encodeScene(job, scene, i, dir, ffmpegBin, width, height, fps),
  )

  const totalDuration = encoded.reduce((sum, s) => sum + s.duration, 0)
  const listPath = path.join(dir, 'concat.txt')
  await fs.writeFile(
    listPath,
    encoded.map((s) => `file '${s.outPath.replace(/'/g, "'\\''")}'`).join('\n'),
  )

  const outputPath = path.join(dir, 'output.mp4')
  await run(ffmpegBin, [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-i',
    audioPath,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    '-movflags',
    '+faststart',
    outputPath,
  ])

  return { outputPath, duration: totalDuration }
}
