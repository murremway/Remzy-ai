import { estimateWords } from './script'
import type { AspectRatio } from './aspect'
import { ASPECT_PRESETS } from './aspect'

export const IMAGE_STYLES = [
  { id: 'cinematic', name: 'Cinematic' },
  { id: 'documentary', name: 'Documentary' },
  { id: 'illustration', name: 'Illustration' },
  { id: 'anime', name: 'Anime' },
  { id: 'noir', name: 'Noir' },
] as const

export type ImageStyle = (typeof IMAGE_STYLES)[number]['id']

export type GeneratedScript = {
  title: string
  script: string
  source: 'ai' | 'fallback'
  targetMinutes?: number
  estimatedWords?: number
}

export type GeneratedImage = {
  blob: Blob
  url: string
  imageEl: HTMLImageElement
  prompt: string
  source: 'remote' | 'local'
}

/** ~140 spoken words per minute for YouTube-style narration. */
export const WORDS_PER_MINUTE = 140

/** Rough seconds of narration per scene before splitting further. */
export const SECONDS_PER_SCENE = 18

export const TARGET_MINUTE_OPTIONS = [
  { value: 0.5, label: '30 seconds' },
  { value: 1, label: '1 minute' },
  { value: 2, label: '2 minutes' },
  { value: 3, label: '3 minutes' },
  { value: 5, label: '5 minutes' },
  { value: 8, label: '8 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 12, label: '12 minutes' },
] as const

export function sceneCountForMinutes(minutes: number): number {
  const secs = minutes * 60
  return Math.max(3, Math.min(40, Math.round(secs / SECONDS_PER_SCENE)))
}

export function wordTargetForMinutes(minutes: number): number {
  return Math.max(60, Math.round(minutes * WORDS_PER_MINUTE))
}

export function estimateScriptMinutes(script: string): number {
  return estimateWords(script) / WORDS_PER_MINUTE
}

function sceneToImagePrompt(sceneText: string, topic?: string): string {
  const cleaned = sceneText
    .replace(/\b(welcome|today we|in this video|subscribe|like and)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const focus = cleaned.slice(0, 140) || topic || 'abstract concept'
  return `Visual scene: ${focus}`
}

function friendlyError(err: unknown, fallback: string): Error {
  if (!(err instanceof Error)) return new Error(fallback)
  if (err.name === 'AbortError' || /aborted|timeout/i.test(err.message)) {
    return new Error(
      'AI image timed out. Local stylized frames will be used instead when possible.',
    )
  }
  return err
}

const STYLE_PALETTES: Record<ImageStyle, [string, string, string]> = {
  cinematic: ['#062a2e', '#0b5c5c', '#1a9a8a'],
  documentary: ['#1a2330', '#355070', '#6b9ac4'],
  illustration: ['#1c120c', '#8a3d1c', '#d9773a'],
  anime: ['#1a1030', '#5b2d8e', '#e86aa3'],
  noir: ['#0a0a0c', '#2a2a32', '#8a8a96'],
}

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Always-available stylized frame so rate limits never block video export. */
export async function generateLocalSceneImage(options: {
  sceneText: string
  style: ImageStyle
  topic?: string
  index?: number
  aspect?: AspectRatio
}): Promise<GeneratedImage> {
  const preset = ASPECT_PRESETS[options.aspect ?? '16:9']
  const width = preset.width
  const height = preset.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  const [c1, c2, c3] = STYLE_PALETTES[options.style]
  const seed = hashSeed(`${options.sceneText}|${options.topic || ''}|${options.index ?? 0}`)
  const t = (seed % 1000) / 1000

  const g = ctx.createLinearGradient(0, 0, width, height)
  g.addColorStop(0, c1)
  g.addColorStop(0.45 + t * 0.2, c2)
  g.addColorStop(1, c3)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)

  ctx.globalAlpha = 0.18
  for (let i = 0; i < 10; i++) {
    const x = ((seed * (i + 3)) % (width + 200)) - 100
    const y = (seed / (i + 2)) % height
    ctx.beginPath()
    ctx.arc(x, y, 60 + (i % 4) * 35, 0, Math.PI * 2)
    ctx.fillStyle = i % 2 ? '#ffffff' : c3
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(0, height * 0.55, width, height * 0.45)

  const label = (options.sceneText || options.topic || 'Scene').slice(0, 90)
  const fontSize = Math.round(width * 0.045)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = `700 ${fontSize}px Syne, system-ui, sans-serif`
  wrapFillText(ctx, label, width / 2, height * 0.72, width * 0.78, Math.round(fontSize * 1.2))

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not create local frame'))),
      'image/jpeg',
      0.92,
    )
  })
  const { url, imageEl } = await loadImageFromBlob(blob)
  return {
    blob,
    url,
    imageEl,
    prompt: sceneToImagePrompt(options.sceneText, options.topic),
    source: 'local',
  }
}

function wrapFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  lineHeight: number,
) {
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
  const startY = cy - ((lines.length - 1) * lineHeight) / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, cx, startY + i * lineHeight)
  })
}

export async function generateScriptFromTopic(
  topic: string,
  options: { sceneCount?: number; targetMinutes?: number } = {},
): Promise<GeneratedScript> {
  const targetMinutes = options.targetMinutes ?? 1
  const sceneCount = options.sceneCount ?? sceneCountForMinutes(targetMinutes)
  const res = await fetch('/api/generate-script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic,
      sceneCount,
      targetMinutes,
      targetWords: wordTargetForMinutes(targetMinutes),
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw friendlyError(new Error(data.error || 'Script generation failed'), 'Script failed')
  }
  return data as GeneratedScript
}

function loadImageFromBlob(blob: Blob): Promise<{ url: string; imageEl: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const imageEl = new Image()
    imageEl.onload = () => resolve({ url, imageEl })
    imageEl.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not decode generated image'))
    }
    imageEl.src = url
  })
}

export async function generateSceneImage(options: {
  sceneText: string
  style: ImageStyle
  topic?: string
  index?: number
  allowLocalFallback?: boolean
  aspect?: AspectRatio
}): Promise<GeneratedImage> {
  const prompt = sceneToImagePrompt(options.sceneText, options.topic)
  const allowLocal = options.allowLocalFallback !== false
  const aspect = options.aspect ?? '16:9'
  const preset = ASPECT_PRESETS[aspect]

  try {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        style: options.style,
        quality: 'fast',
        aspect,
        width: preset.imageWidth,
        height: preset.imageHeight,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Image generation failed')

    const binary = atob(data.imageBase64 as string)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: data.mimeType || 'image/jpeg' })
    const { url, imageEl } = await loadImageFromBlob(blob)
    return {
      blob,
      url,
      imageEl,
      prompt: String(data.prompt || prompt),
      source: 'remote',
    }
  } catch (err) {
    if (allowLocal) {
      return generateLocalSceneImage({ ...options, aspect })
    }
    throw friendlyError(err, 'Image generation failed')
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Transparent PNG with burn-in captions for FFmpeg overlay after Ken Burns. */
export async function createCaptionOverlay(options: {
  text: string
  width: number
  height: number
  captionColor: string
  captionBg: string
}): Promise<Blob> {
  const { width, height, text, captionColor, captionBg } = options
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  const vertical = height > width
  const fontSize = Math.round(width * (vertical ? 0.048 : 0.035))
  ctx.font = `700 ${fontSize}px Syne, system-ui, sans-serif`
  const maxWidth = width * (vertical ? 0.84 : 0.78)
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
  const shown = lines.slice(0, 5)
  const lineHeight = Math.round(fontSize * 1.35)
  const blockHeight = shown.length * lineHeight + 36
  const blockWidth = Math.min(
    width * 0.9,
    Math.max(...shown.map((l) => ctx.measureText(l).width), 40) + 64,
  )
  const x = (width - blockWidth) / 2
  const y = height * (vertical ? 0.7 : 0.72) - blockHeight / 2

  ctx.fillStyle = captionBg
  const r = 18
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + blockWidth, y, x + blockWidth, y + blockHeight, r)
  ctx.arcTo(x + blockWidth, y + blockHeight, x, y + blockHeight, r)
  ctx.arcTo(x, y + blockHeight, x, y, r)
  ctx.arcTo(x, y, x + blockWidth, y, r)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = captionColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  shown.forEach((line, i) => {
    ctx.fillText(line, width / 2, y + 28 + i * lineHeight + lineHeight / 2)
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not create caption overlay'))),
      'image/png',
    )
  })
  return blob
}
