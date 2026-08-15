# MotionForge pipeline

```
                    MOTIONFORGE AI
                          │
                    AI ORCHESTRATOR
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
     IMAGE             VIDEO             AUDIO
        │                 │                 │
   ┌────┴────┐      ┌─────┴─────┐      ┌────┴────┐
   │         │      │     │     │      │         │
  FLUX     SDXL    Wan  Hunyuan LTX   TTS     Whisper
                     │      │     │
                     └──────┼─────┘
                            │
                       MOTION ENGINE
                            │
                         FFmpeg
                            │
                       FINAL VIDEO
```

The orchestrator lives in `packages/ai/remzyforge_ai/motionforge/`.

- `GET /motionforge/graph` — inspect the live graph and registry
- `POST /projects/{id}/pipeline` — run IMAGE → MOTION → VIDEO → AUDIO → FFmpeg

Adapters are swappable. With `MOCK_VIDEO_PROVIDER=true` every hop returns a structured result so the product works without CUDA. Enable a local Diffusers/ComfyUI worker later without changing the API.
