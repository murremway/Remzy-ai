import type { VisualTheme } from './themes'
import type { MotionStyle } from './aspect'

export type RenderScene = {
  text: string
  duration: number
  image?: HTMLImageElement | null
}

export type RenderOptions = {
  scenes: RenderScene[]
  theme: VisualTheme
  audioUrl: string
  width?: number
  height?: number
  fps?: number
  title?: string
  captions?: boolean
  motion?: MotionStyle
  onProgress?: (ratio: number) => void
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 5)
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  theme: VisualTheme,
  w: number,
  h: number,
  t: number,
  sceneIndex: number,
) {
  const [c1, c2, c3] = theme.colors
  const g = ctx.createLinearGradient(0, 0, w, h)
  const shift = (Math.sin(t * 0.35 + sceneIndex) + 1) / 2
  g.addColorStop(0, c1)
  g.addColorStop(0.45 + shift * 0.2, c2)
  g.addColorStop(1, c3)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.globalAlpha = 0.12
  for (let i = 0; i < 8; i++) {
    const x = ((i * 211 + t * 40) % (w + 200)) - 100
    const y = (i * 97) % h
    ctx.beginPath()
    ctx.arc(x, y, 80 + (i % 3) * 40, 0, Math.PI * 2)
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : c3
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = 0.08
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  for (let i = 0; i < 12; i++) {
    const y = ((i / 12) * h + t * 18) % h
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y + 40)
    ctx.stroke()
  }
  ctx.restore()
}

function drawImageMotion(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
  progress: number,
  motion: MotionStyle,
) {
  let scale = 1.1
  let panX = 0
  let panY = 0

  switch (motion) {
    case 'zoom-in':
      scale = 1.05 + progress * 0.18
      break
    case 'pan-left':
      scale = 1.15
      panX = (progress - 0.5) * 80
      break
    case 'pan-right':
      scale = 1.15
      panX = (0.5 - progress) * 80
      break
    case 'kenburns':
    default:
      scale = 1.08 + progress * 0.12
      panX = (progress - 0.5) * 40
      panY = Math.sin(progress * Math.PI) * 12
      break
  }

  const imgRatio = image.width / image.height
  const canvasRatio = w / h
  let dw = w * scale
  let dh = h * scale
  if (imgRatio > canvasRatio) {
    dw = h * scale * imgRatio
    dh = h * scale
  } else {
    dw = w * scale
    dh = (w * scale) / imgRatio
  }
  const dx = (w - dw) / 2 + panX
  const dy = (h - dh) / 2 + panY
  ctx.drawImage(image, dx, dy, dw, dh)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(0, 0, w, h)
}

function drawCaptions(
  ctx: CanvasRenderingContext2D,
  text: string,
  theme: VisualTheme,
  w: number,
  h: number,
  appear: number,
) {
  const vertical = h > w
  ctx.save()
  const fontSize = Math.round(w * (vertical ? 0.048 : 0.035))
  ctx.font = `700 ${fontSize}px "Syne", system-ui, sans-serif`
  const lines = wrapText(ctx, text, w * (vertical ? 0.84 : 0.78))
  const lineHeight = Math.round(fontSize * 1.35)
  const blockHeight = lines.length * lineHeight + 36
  const blockWidth = Math.min(
    w * 0.9,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + 64,
  )
  const x = (w - blockWidth) / 2
  const y = h * (vertical ? 0.7 : 0.72) - blockHeight / 2
  const alpha = Math.min(1, Math.max(0, appear))

  ctx.globalAlpha = alpha
  ctx.fillStyle = theme.captionBg
  roundRect(ctx, x, y, blockWidth, blockHeight, 18)
  ctx.fill()

  ctx.fillStyle = theme.captionColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, y + 28 + i * lineHeight + lineHeight / 2)
  })
  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawBrand(ctx: CanvasRenderingContext2D, w: number, h: number, title: string) {
  const vertical = h > w
  ctx.save()
  ctx.font = `800 ${Math.round(w * (vertical ? 0.055 : 0.028))}px "Syne", system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.textAlign = 'left'
  ctx.fillText('REELFORGE', vertical ? 28 : 48, vertical ? 48 : 56)
  if (title) {
    ctx.font = `500 ${Math.round(w * (vertical ? 0.032 : 0.018))}px "Outfit", system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.fillText(title.slice(0, vertical ? 28 : 48), vertical ? 28 : 48, vertical ? 82 : 92)
  }
  ctx.restore()
}

export async function renderVideo(options: RenderOptions): Promise<Blob> {
  const width = options.width ?? 1280
  const height = options.height ?? 720
  const fps = options.fps ?? 24
  const captions = options.captions !== false
  const motion = options.motion ?? 'kenburns'
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  const audio = new Audio(options.audioUrl)
  audio.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    audio.oncanplaythrough = () => resolve()
    audio.onerror = () => reject(new Error('Could not load voiceover audio'))
    audio.load()
  })

  const stream = canvas.captureStream(fps)
  const audioCtx = new AudioContext()
  const source = audioCtx.createMediaElementSource(audio)
  const dest = audioCtx.createMediaStreamDestination()
  source.connect(dest)
  source.connect(audioCtx.destination)

  for (const track of dest.stream.getAudioTracks()) {
    stream.addTrack(track)
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm'

  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: height > width ? 6_000_000 : 5_000_000,
  })

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onerror = () => reject(new Error('Recording failed'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  const totalDuration = options.scenes.reduce((s, scene) => s + scene.duration, 0)
  const ends: number[] = []
  let acc = 0
  for (const scene of options.scenes) {
    acc += scene.duration
    ends.push(acc)
  }

  recorder.start(200)
  if (audioCtx.state === 'suspended') await audioCtx.resume()
  await audio.play()

  const started = performance.now()
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000
      if (elapsed >= totalDuration + 0.15) {
        resolve()
        return
      }

      let sceneIndex = ends.findIndex((end) => elapsed <= end)
      if (sceneIndex < 0) sceneIndex = options.scenes.length - 1
      const scene = options.scenes[sceneIndex]
      const start = sceneIndex === 0 ? 0 : ends[sceneIndex - 1]
      const local = elapsed - start
      const progress = scene.duration > 0 ? Math.min(1, local / scene.duration) : 1

      if (scene.image) {
        drawImageMotion(ctx, scene.image, width, height, progress, motion)
      } else {
        drawBackground(ctx, options.theme, width, height, elapsed, sceneIndex)
      }

      drawBrand(ctx, width, height, options.title || '')
      if (captions) {
        drawCaptions(ctx, scene.text, options.theme, width, height, Math.min(1, local / 0.35))
      }

      options.onProgress?.(Math.min(1, elapsed / totalDuration))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  audio.pause()
  recorder.stop()
  stream.getTracks().forEach((t) => t.stop())
  await audioCtx.close()
  return done
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image'))
    }
    img.src = url
  })
}
