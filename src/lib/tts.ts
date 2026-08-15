export type VoiceInfo = {
  name: string
  shortName: string
  gender: string
  locale: string
}

export type TtsResult = {
  blob: Blob
  url: string
  duration: number
  vtt: string
}

async function audioDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob)
  try {
    const audio = new Audio()
    audio.preload = 'metadata'
    const duration = await new Promise<number>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0)
      audio.onerror = () => reject(new Error('Could not read audio duration'))
      audio.src = url
    })
    return duration
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function fetchVoices(): Promise<{ featured: VoiceInfo[]; voices: VoiceInfo[] }> {
  const res = await fetch('/api/voices')
  if (!res.ok) throw new Error('Could not load voices')
  return res.json()
}

function bytesFromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function previewSampleText(scriptOrScene: string): string {
  const cleaned = scriptOrScene.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'This is a short preview of the selected voice.'
  const words = cleaned.split(' ')
  if (words.length <= 26) return cleaned
  return `${words.slice(0, 26).join(' ')}.`
}

export async function synthesizeSpeech(options: {
  text: string
  voice: string
  rate?: string
  pitch?: string
}): Promise<TtsResult> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Voice generation failed')

  const bytes = bytesFromBase64(data.audioBase64 as string)
  const blob = new Blob([bytes], { type: data.mimeType || 'audio/mpeg' })
  const duration = await audioDuration(blob)
  const url = URL.createObjectURL(blob)
  return { blob, url, duration, vtt: data.vtt || '' }
}

export async function synthesizeSpeechBatch(options: {
  texts: string[]
  voice: string
}): Promise<{ blob: Blob; url: string; duration: number; durations: number[] }> {
  const res = await fetch('/api/tts/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Voice generation failed')

  const bytes = bytesFromBase64(data.audioBase64 as string)
  const blob = new Blob([bytes], { type: data.mimeType || 'audio/mpeg' })
  const durations = Array.isArray(data.durations)
    ? (data.durations as number[]).map((d) => Math.max(Number(d) || 1.2, 1.2))
    : []
  const duration =
    Number(data.duration) ||
    durations.reduce((a, b) => a + b, 0) ||
    (await audioDuration(blob))
  return { blob, url: URL.createObjectURL(blob), duration, durations }
}

export async function concatAudioBlobs(blobs: Blob[]): Promise<{ blob: Blob; url: string; duration: number }> {
  if (blobs.length === 0) throw new Error('No audio to merge')
  if (blobs.length === 1) {
    const blob = blobs[0]
    const duration = await audioDuration(blob)
    return { blob, url: URL.createObjectURL(blob), duration }
  }

  const ctx = new AudioContext()
  const decoded = await Promise.all(
    blobs.map(async (blob) => {
      const buffer = await blob.arrayBuffer()
      return ctx.decodeAudioData(buffer.slice(0))
    }),
  )

  const totalLength = decoded.reduce((sum, b) => sum + b.length, 0)
  const sampleRate = decoded[0].sampleRate
  const channels = Math.max(...decoded.map((b) => b.numberOfChannels))
  const merged = ctx.createBuffer(channels, totalLength, sampleRate)

  let offset = 0
  for (const buffer of decoded) {
    for (let ch = 0; ch < channels; ch++) {
      const target = merged.getChannelData(ch)
      const source = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1))
      target.set(source, offset)
    }
    offset += buffer.length
  }

  await ctx.close()
  const wav = audioBufferToWav(merged)
  const blob = new Blob([wav], { type: 'audio/wav' })
  return { blob, url: URL.createObjectURL(blob), duration: merged.duration }
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1
  const bitDepth = 16
  const samples = buffer.length
  const blockAlign = (numChannels * bitDepth) / 8
  const byteRate = sampleRate * blockAlign
  const dataSize = samples * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  const channels = Array.from({ length: numChannels }, (_, i) => buffer.getChannelData(i))
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return arrayBuffer
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
}
