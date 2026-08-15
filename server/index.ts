import cors from 'cors'
import express from 'express'
import { spawn } from 'node:child_process'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import {
  findFfmpeg,
  findFfprobe,
  mapLimit,
  renderVideoWithFfmpeg,
  run,
  runOut,
  type AspectRatio,
  type MotionStyle,
  type RenderJob,
} from './render.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const VENV_EDGE = path.join(ROOT, '.venv', 'bin', 'edge-tts')
const TMP = path.join(ROOT, '.tmp')

const app = express()
const PORT = Number(process.env.PORT) || 8787

app.use(cors())
app.use(express.json({ limit: '80mb' }))

type VoiceRow = {
  name: string
  shortName: string
  gender: string
  locale: string
}

let voiceCache: VoiceRow[] | null = null

function runEdge(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(VENV_EDGE, args, { cwd: ROOT })
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
        reject(new Error(stderr || `edge-tts exited with code ${code}`))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

async function ensureTmp() {
  await fs.mkdir(TMP, { recursive: true })
}

async function loadVoices(): Promise<VoiceRow[]> {
  if (voiceCache) return voiceCache
  const { stdout } = await runEdge(['--list-voices'])
  const lines = stdout.split('\n').slice(2)
  const voices: VoiceRow[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('-')) continue
    const parts = trimmed.split(/\s{2,}/)
    if (parts.length < 2) continue
    const shortName = parts[0]
    const gender = parts[1] || 'Unknown'
    const locale = shortName.split('-').slice(0, 2).join('-')
    voices.push({
      name: shortName.replace(/Neural$/, '').replace(/-/g, ' '),
      shortName,
      gender,
      locale,
    })
  }
  voiceCache = voices
  return voices
}

app.get('/api/health', async (_req, res) => {
  const ffmpeg = await findFfmpeg()
  res.json({
    ok: true,
    ffmpeg: Boolean(ffmpeg),
    ffmpegPath: ffmpeg,
    longForm: Boolean(ffmpeg),
  })
})

app.get('/api/voices', async (_req, res) => {
  try {
    const voices = await loadVoices()
    const popular = [
      'en-US-JennyNeural',
      'en-US-GuyNeural',
      'en-US-AriaNeural',
      'en-US-ChristopherNeural',
      'en-GB-SoniaNeural',
      'en-GB-RyanNeural',
      'en-AU-NatashaNeural',
      'en-AU-WilliamNeural',
      'en-IN-NeerjaNeural',
      'en-IN-PrabhatNeural',
    ]
    const featured = popular
      .map((id) => voices.find((v) => v.shortName === id))
      .filter(Boolean)
    res.json({ featured, voices })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list voices' })
  }
})

app.post('/api/tts', async (req, res) => {
  try {
    const text = String(req.body?.text ?? '').trim()
    const voice = String(req.body?.voice ?? 'en-US-JennyNeural')
    const rate = String(req.body?.rate ?? '+0%')
    const pitch = String(req.body?.pitch ?? '+0Hz')

    if (!text) {
      res.status(400).json({ error: 'Text is required' })
      return
    }
    if (text.length > 5000) {
      res.status(400).json({ error: 'Text must be 5000 characters or fewer per request' })
      return
    }

    await ensureTmp()
    const id = randomUUID()
    const audioPath = path.join(TMP, `${id}.mp3`)
    const subPath = path.join(TMP, `${id}.vtt`)

    const writeSubs = req.body?.subtitles === true
    const args = [
      '--voice',
      voice,
      '--rate',
      rate,
      '--pitch',
      pitch,
      '--text',
      text,
      '--write-media',
      audioPath,
    ]
    if (writeSubs) args.push('--write-subtitles', subPath)

    await runEdge(args)

    const audio = await fs.readFile(audioPath)
    let vtt = ''
    if (writeSubs) {
      try {
        vtt = await fs.readFile(subPath, 'utf8')
      } catch {
        vtt = ''
      }
    }

    await Promise.allSettled([fs.unlink(audioPath), fs.unlink(subPath)])

    res.json({
      audioBase64: audio.toString('base64'),
      mimeType: 'audio/mpeg',
      vtt,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'TTS failed' })
  }
})

app.post('/api/tts/batch', async (req, res) => {
  try {
    const texts = Array.isArray(req.body?.texts)
      ? (req.body.texts as unknown[]).map((t) => String(t ?? '').trim()).filter(Boolean)
      : []
    const voice = String(req.body?.voice ?? 'en-US-JennyNeural')
    if (!texts.length) {
      res.status(400).json({ error: 'texts[] is required' })
      return
    }
    if (texts.length > 40) {
      res.status(400).json({ error: 'Maximum 40 scenes per voice batch' })
      return
    }
    if (texts.some((t) => t.length > 5000)) {
      res.status(400).json({ error: 'Each scene must be 5000 characters or fewer' })
      return
    }

    await ensureTmp()
    const batchId = randomUUID()
    const dir = path.join(TMP, `tts-${batchId}`)
    await fs.mkdir(dir, { recursive: true })

    const parts = await mapLimit(texts, 4, async (text, i) => {
      const audioPath = path.join(dir, `s-${i}.mp3`)
      await runEdge(['--voice', voice, '--text', text, '--write-media', audioPath])
      return audioPath
    })

    const ffmpeg = await findFfmpeg()
    const ffprobe = await findFfprobe()
    const durations: number[] = []
    if (ffprobe) {
      for (const file of parts) {
        const raw = await runOut(ffprobe, [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=nw=1:nk=1',
          file,
        ])
        durations.push(Math.max(Number(raw) || 1.2, 1.2))
      }
    } else {
      for (const _ of parts) durations.push(2)
    }

    let audio: Buffer
    let mimeType = 'audio/mpeg'
    if (parts.length === 1) {
      audio = await fs.readFile(parts[0])
    } else if (ffmpeg) {
      const listPath = path.join(dir, 'concat.txt')
      await fs.writeFile(
        listPath,
        parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
      )
      const outPath = path.join(dir, 'merged.mp3')
      try {
        await run(ffmpeg, [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-c',
          'copy',
          outPath,
        ])
      } catch {
        await run(ffmpeg, [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-c:a',
          'libmp3lame',
          '-q:a',
          '4',
          outPath,
        ])
      }
      audio = await fs.readFile(outPath)
    } else {
      audio = await fs.readFile(parts[0])
      mimeType = 'audio/mpeg'
    }

    void fs.rm(dir, { recursive: true, force: true })
    res.json({
      audioBase64: audio.toString('base64'),
      mimeType,
      durations,
      duration: durations.reduce((a, b) => a + b, 0),
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Batch TTS failed' })
  }
})

app.post('/api/tts/file', async (req, res) => {
  try {
    const text = String(req.body?.text ?? '').trim()
    const voice = String(req.body?.voice ?? 'en-US-JennyNeural')
    if (!text) {
      res.status(400).json({ error: 'Text is required' })
      return
    }
    await ensureTmp()
    const id = randomUUID()
    const audioPath = path.join(TMP, `${id}.mp3`)
    await runEdge([
      '--voice',
      voice,
      '--text',
      text,
      '--write-media',
      audioPath,
    ])
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Disposition', 'attachment; filename="voiceover.mp3"')
    createReadStream(audioPath)
      .on('close', () => {
        void fs.unlink(audioPath)
      })
      .pipe(res)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'TTS failed' })
  }
})

function fallbackScript(
  topic: string,
  sceneCount: number,
  targetWords = 140,
): { title: string; script: string } {
  const title = topic.length > 60 ? `${topic.slice(0, 57)}…` : topic
  const templates = [
    `Today we explore ${topic}.`,
    `First, understand why this matters and what most people get wrong.`,
    `Here is the key insight that changes how you see ${topic}.`,
    `Let's break it down into clear, practical steps you can use right away.`,
    `Watch for this common mistake — avoiding it saves time and frustration.`,
    `Put it together: a simple approach that actually works with ${topic}.`,
    `Another angle: think about the small habits that compound over time.`,
    `Here is a concrete example you can picture immediately.`,
    `When things get hard, return to the basics and stay consistent.`,
    `Compare the old way with a smarter way of handling ${topic}.`,
    `Remember the big takeaway about ${topic}, and use it in your next project.`,
    `Before you go, lock in one action you will take in the next twenty-four hours.`,
    `If this helped, save it and share it with someone who needs to hear this.`,
    `Zoom out for a second — the bigger pattern behind ${topic} is what really matters.`,
    `Stay curious, keep testing, and refine your approach as you learn.`,
    `That is the whole playbook for ${topic}, told simply so you can act on it.`,
  ]

  const scenes: string[] = []
  let words = 0
  let i = 0
  while (scenes.length < sceneCount || words < targetWords) {
    const base = templates[i % templates.length]
    const extra =
      words < targetWords
        ? ` Spend a moment on this idea, connect it to your own experience, and notice what changes when you apply it carefully.`
        : ''
    const scene = `${base}${extra}`.trim()
    scenes.push(scene)
    words += scene.split(/\s+/).length
    i += 1
    if (scenes.length >= Math.max(sceneCount, 20) && words >= targetWords) break
    if (i > 40) break
  }

  return { title, script: scenes.join('\n\n') }
}

app.post('/api/generate-script', async (req, res) => {
  try {
    const topic = String(req.body?.topic ?? '').trim()
    const targetMinutes = Math.max(0.5, Math.min(Number(req.body?.targetMinutes) || 1, 12))
    const targetWords = Math.max(
      60,
      Math.min(Number(req.body?.targetWords) || Math.round(targetMinutes * 140), 1800),
    )
    const sceneCount = Math.max(
      3,
      Math.min(Number(req.body?.sceneCount) || Math.round((targetMinutes * 60) / 18), 40),
    )
    if (!topic) {
      res.status(400).json({ error: 'Topic is required' })
      return
    }
    if (topic.length > 500) {
      res.status(400).json({ error: 'Topic must be 500 characters or fewer' })
      return
    }

    const prompt = `Write a YouTube narration script about: "${topic}".
Return ONLY valid JSON with this shape:
{"title":"short catchy title","script":"scene1\\n\\nscene2\\n\\nscene3"}
Rules:
- Aim for about ${targetMinutes} minute(s) spoken aloud (~${targetWords} words total)
- About ${sceneCount} scenes separated by blank lines
- Each scene is 2-4 spoken sentences, conversational, no stage directions
- No markdown, no code fences, JSON only`

    try {
      const response = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You write concise YouTube scripts sized to a target duration. Reply with JSON only.',
            },
            { role: 'user', content: prompt },
          ],
          model: 'openai',
          jsonMode: true,
        }),
        signal: AbortSignal.timeout(20000),
      })

      if (!response.ok) throw new Error(`Script API ${response.status}`)
      const raw = await response.text()
      const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '').trim()) as {
        title?: string
        script?: string
      }
      if (!parsed.script?.trim()) throw new Error('Empty script')
      res.json({
        title: String(parsed.title || topic).slice(0, 80),
        script: String(parsed.script).trim(),
        source: 'ai',
        targetMinutes,
        estimatedWords: targetWords,
      })
    } catch {
      const fallback = fallbackScript(topic, sceneCount, targetWords)
      res.json({
        ...fallback,
        source: 'fallback',
        targetMinutes,
        estimatedWords: targetWords,
      })
    }
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Script generation failed',
    })
  }
})

async function fetchImageWithRetry(
  fullPrompt: string,
  width: number,
  height: number,
  model: string,
): Promise<{ buffer: Buffer; mimeType: string; seed: number }> {
  const maxAttempts = 4
  let lastError: Error | null = null
  const models = [model, model === 'turbo' ? 'flux' : 'turbo']

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const seed = Math.floor(Math.random() * 1_000_000)
    const useModel = models[(attempt - 1) % models.length]
    const url = new URL(
      `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt.slice(0, 350))}`,
    )
    url.searchParams.set('width', String(width))
    url.searchParams.set('height', String(height))
    url.searchParams.set('nologo', 'true')
    url.searchParams.set('model', useModel)
    url.searchParams.set('seed', String(seed))

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'image/*',
          'User-Agent': 'ReelForge/1.0',
        },
        signal: AbortSignal.timeout(120000),
      })
      if (response.status === 429) {
        throw new Error('RATE_LIMIT')
      }
      if (!response.ok) {
        throw new Error(`Image API returned ${response.status}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength < 1000) {
        throw new Error('Image API returned an empty image')
      }
      const mimeType = response.headers.get('content-type') || 'image/jpeg'
      return { buffer, mimeType, seed }
    } catch (err) {
      const isRateLimit =
        err instanceof Error && (err.message === 'RATE_LIMIT' || /429/.test(err.message))
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' || /aborted|timeout/i.test(err.message))

      lastError = isRateLimit
        ? new Error(`Image provider rate-limited (attempt ${attempt}/${maxAttempts})`)
        : isTimeout
          ? new Error(`Image provider timed out (attempt ${attempt}/${maxAttempts})`)
          : err instanceof Error
            ? err
            : new Error('Image generation failed')

      if (attempt < maxAttempts) {
        const waitMs = isRateLimit ? 2500 * attempt : 900 * attempt
        await new Promise((r) => setTimeout(r, waitMs))
      }
    }
  }

  throw lastError ?? new Error('Image generation failed')
}

app.post('/api/generate-image', async (req, res) => {
  // Long-running AI image request — avoid proxy/socket cutoffs.
  req.setTimeout(180000)
  res.setTimeout(180000)

  try {
    const prompt = String(req.body?.prompt ?? '').trim()
    const style = String(req.body?.style ?? 'cinematic')
    const quality = String(req.body?.quality ?? 'fast')
    const width = Math.min(
      Math.max(Number(req.body?.width) || (quality === 'fast' ? 1024 : 1280), 512),
      1920,
    )
    const height = Math.min(
      Math.max(Number(req.body?.height) || (quality === 'fast' ? 576 : 720), 288),
      1080,
    )
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' })
      return
    }

    const aspect = String(req.body?.aspect ?? '16:9') === '9:16' ? '9:16' : '16:9'
    const aspectHint = aspect === '9:16' ? 'vertical 9:16 portrait framing' : 'widescreen 16:9'
    const styleHints: Record<string, string> = {
      cinematic: `cinematic still, dramatic light, shallow depth of field, ${aspectHint}`,
      documentary: `photorealistic documentary photo, natural light, ${aspectHint}`,
      illustration: `digital illustration, clean composition, vibrant, ${aspectHint}`,
      anime: `anime key visual, expressive lighting, ${aspectHint}`,
      noir: `neo-noir, high contrast shadows, atmospheric, ${aspectHint}`,
    }
    const hint = styleHints[style] || styleHints.cinematic
    const fullPrompt = `${prompt}. ${hint}. No text, no watermark.`
    const model = quality === 'fast' ? 'turbo' : 'flux'

    const { buffer, mimeType, seed } = await fetchImageWithRetry(
      fullPrompt,
      width,
      height,
      model,
    )
    res.json({
      imageBase64: buffer.toString('base64'),
      mimeType,
      prompt: fullPrompt,
      seed,
      model,
    })
  } catch (err) {
    const message =
      err instanceof Error
        ? /rate[- ]limit|429/i.test(err.message)
          ? 'AI image provider is busy (rate limited). Wait ~20s, use 3 scenes, then try again.'
          : /timeout|aborted/i.test(err.message)
            ? 'AI image timed out after retries. Try fewer scenes or run Generate AI scenes again.'
            : err.message
        : 'Image generation failed'
    const isRateLimit = /rate[- ]limit|429/i.test(message)
    res.status(isRateLimit ? 429 : 504).json({ error: message })
  }
})

app.post('/api/render-video', async (req, res) => {
  req.setTimeout(900000)
  res.setTimeout(900000)

  try {
    const ffmpeg = await findFfmpeg()
    if (!ffmpeg) {
      res.status(503).json({
        error:
          'FFmpeg is not installed. Install with: brew install ffmpeg — then restart the server for long-form MP4 export.',
      })
      return
    }

    const scenes = Array.isArray(req.body?.scenes) ? req.body.scenes : []
    if (!scenes.length) {
      res.status(400).json({ error: 'At least one scene is required' })
      return
    }
    if (scenes.length > 40) {
      res.status(400).json({ error: 'Maximum 40 scenes per render' })
      return
    }

    const audioBase64 = String(req.body?.audioBase64 ?? '')
    if (!audioBase64) {
      res.status(400).json({ error: 'audioBase64 is required' })
      return
    }

    const aspect: AspectRatio =
      String(req.body?.aspect ?? '16:9') === '9:16' ? '9:16' : '16:9'
    const motionRaw = String(req.body?.motion ?? 'kenburns')
    const motion: MotionStyle = (
      ['kenburns', 'zoom-in', 'pan-left', 'pan-right'] as MotionStyle[]
    ).includes(motionRaw as MotionStyle)
      ? (motionRaw as MotionStyle)
      : 'kenburns'

    const theme = req.body?.theme ?? {
      colors: ['#062a2e', '#0b5c5c', '#1a9a8a'],
      captionColor: '#f4faf9',
      captionBg: 'rgba(4, 20, 24, 0.72)',
    }

    const job: RenderJob = {
      title: String(req.body?.title ?? 'ReelForge Video').slice(0, 120),
      aspect,
      captions: req.body?.captions !== false,
      motion,
      fps: Math.min(Math.max(Number(req.body?.fps) || 24, 24), 30),
          scenes: scenes.map(
            (s: {
              text?: string
              duration?: number
              imageBase64?: string
              mimeType?: string
              captionBase64?: string
            }) => ({
              text: String(s?.text ?? ''),
              duration: Math.max(Number(s?.duration) || 2, 1.2),
              imageBase64: s?.imageBase64 ? String(s.imageBase64) : undefined,
              mimeType: s?.mimeType ? String(s.mimeType) : undefined,
              captionBase64: s?.captionBase64 ? String(s.captionBase64) : undefined,
            }),
          ),
      audioBase64,
      audioMimeType: String(req.body?.audioMimeType ?? 'audio/mpeg'),
      theme: {
        colors: Array.isArray(theme.colors)
          ? (theme.colors.slice(0, 3) as [string, string, string])
          : ['#062a2e', '#0b5c5c', '#1a9a8a'],
        captionColor: String(theme.captionColor || '#f4faf9'),
        captionBg: String(theme.captionBg || 'rgba(4,20,24,0.72)'),
      },
    }

    await ensureTmp()
    const { outputPath, duration } = await renderVideoWithFfmpeg(job, TMP, ffmpeg)
    const buffer = await fs.readFile(outputPath)
    const jobDir = path.dirname(outputPath)
    void fs.rm(jobDir, { recursive: true, force: true })

    res.json({
      videoBase64: buffer.toString('base64'),
      mimeType: 'video/mp4',
      duration,
      aspect,
      engine: 'ffmpeg',
    })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Video render failed',
    })
  }
})

const server = app.listen(PORT, () => {
  console.log(`ReelForge API on http://localhost:${PORT}`)
})
server.requestTimeout = 900000
server.headersTimeout = 910000
server.timeout = 900000
