# ReelForge

Open-source **text → video** studio for YouTube and social media.

Turn a topic or script into a narrated, captioned video with camera motion — sized for **16:9** (YouTube) or **9:16** (Shorts / Reels / TikTok), up to **12 minutes**.

## Why this stack (for longer videos)

Pure AI video models (SVD, CogVideo, etc.) usually max out at a few seconds. ReelForge uses the open pipeline that actually scales to minutes:

| Stage | Open tool |
|-------|-----------|
| Script | Pollinations LLM (free) + local fallback |
| Scene images | Pollinations Flux/Turbo + local stylized frames |
| Voice | [edge-tts](https://github.com/rany2/edge-tts) (Microsoft neural voices, free) |
| Motion | Ken Burns / zoom / pan via **FFmpeg** (or browser canvas) |
| Captions | Burned into the frame |
| Export | **MP4** (FFmpeg) or WebM (browser fallback) |

## Features

- Aspect switch: **16:9** ↔ **9:16**
- Target length: 30s → **12 minutes**
- Burn-in captions (on/off)
- Motion styles: Ken Burns, zoom-in, pan left/right
- Multi-scene assembly for long-form narration
- No paid API keys required

## Setup

```bash
cd youtube-ai-studio
npm install
npm run setup          # creates .venv + edge-tts
brew install ffmpeg    # required for multi-minute MP4 export
npm run dev
```

Open http://localhost:5173

## Workflow

1. Pick **16:9** or **9:16**
2. Paste your script **or** enter a topic + target length
3. Optionally toggle captions and motion style
4. Generate video (FFmpeg MP4 preferred when installed)
5. Download and upload to YouTube / Shorts / Reels

## Notes

- Keep the browser tab focused only for **browser** WebM renders
- FFmpeg renders run on the server and are better for 5–12 minute videos
- If the free image API is rate-limited, stylized local frames are used automatically
- Scene images can be replaced with your own uploads
