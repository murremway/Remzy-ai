export type AspectRatio = '16:9' | '9:16' | '1:1'

export type ProjectMode =
  | 'text_to_video'
  | 'script_to_video'
  | 'image_to_video'
  | 'image_motion'
  | 'text_to_storyboard'
  | 'storyboard_to_video'
  | 'video_to_video'
  | 'character_to_video'
  | 'product_ad'
  | 'longform_to_shorts'

export type JobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'GENERATING'
  | 'UPSCALING'
  | 'RENDERING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type CameraMotion =
  | 'static'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'zoom_in'
  | 'zoom_out'
  | 'dolly_in'
  | 'dolly_out'
  | 'tracking'
  | 'orbit'
  | 'crane'
  | 'handheld'
  | 'drone'
  | 'rack_focus'
  | 'slow_motion'
  | 'time_lapse'

export interface User {
  id: string
  email: string
  name: string
  is_admin: boolean
  organization_id: string
  organization_name: string
  role: string
}

export interface Project {
  id: string
  title: string
  idea: string
  script: string | null
  mode: ProjectMode
  aspect_ratio: AspectRatio
  target_duration_seconds: number
  status: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
  scene_count: number
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface ModelInfo {
  model_id: string
  display_name: string
  provider: string
  location: 'local' | 'cloud' | 'mock'
  category: string
  capabilities: string[]
  vram_gb: number
  resolutions: string[]
  max_duration_seconds: number | null
  license: string
  commercial_use: boolean
  estimated_generation_time_seconds: number
  priority: number
  enabled: boolean
}
