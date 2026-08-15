export type AspectRatio = '16:9' | '9:16'

export type AspectPreset = {
  id: AspectRatio
  name: string
  label: string
  width: number
  height: number
  /** Slightly smaller for faster AI image generation */
  imageWidth: number
  imageHeight: number
  platform: string
}

export const ASPECT_PRESETS: Record<AspectRatio, AspectPreset> = {
  '16:9': {
    id: '16:9',
    name: 'YouTube / Landscape',
    label: '16:9',
    width: 1280,
    height: 720,
    imageWidth: 768,
    imageHeight: 432,
    platform: 'YouTube, LinkedIn, X',
  },
  '9:16': {
    id: '9:16',
    name: 'Shorts / Reels / TikTok',
    label: '9:16',
    width: 720,
    height: 1280,
    imageWidth: 432,
    imageHeight: 768,
    platform: 'YouTube Shorts, Reels, TikTok',
  },
}

export type MotionStyle = 'kenburns' | 'zoom-in' | 'pan-left' | 'pan-right'

export const MOTION_STYLES: { id: MotionStyle; name: string; hint: string }[] = [
  { id: 'kenburns', name: 'Ken Burns', hint: 'Slow zoom + drift — best for longer clips' },
  { id: 'zoom-in', name: 'Zoom in', hint: 'Steady push into the frame' },
  { id: 'pan-left', name: 'Pan left', hint: 'Horizontal drift left' },
  { id: 'pan-right', name: 'Pan right', hint: 'Horizontal drift right' },
]
