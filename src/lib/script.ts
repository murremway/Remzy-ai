export type Scene = {
  id: string
  text: string
}

export function splitIntoScenes(script: string): Scene[] {
  const cleaned = script.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []

  const byParagraph = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)

  const scenes =
    byParagraph.length > 1
      ? byParagraph
      : cleaned
          .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
          .map((s) => s.trim())
          .filter(Boolean)

  return scenes.map((text, i) => ({
    id: `scene-${i + 1}`,
    text,
  }))
}

export function estimateWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
