"""
MOTIONFORGE AI
      │
AI ORCHESTRATOR
      │
 IMAGE          VIDEO           AUDIO
 FLUX/SDXL   Wan/Hunyuan/LTX   TTS/Whisper
      │            │               │
      └────────────┼───────────────┘
                   │
             MOTION ENGINE
                   │
                FFmpeg
                   │
              FINAL VIDEO
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from remzyforge_ai.motionforge.audio import WhisperAdapter, resolve_tts
from remzyforge_ai.motionforge.ffmpeg import assemble
from remzyforge_ai.motionforge.image import resolve_image
from remzyforge_ai.motionforge.motion import compile_motion
from remzyforge_ai.motionforge.video import resolve_video
from remzyforge_ai.registry import list_models


class MotionForgeOrchestrator:
    def __init__(self, *, mock: bool = True, output_dir: str = "data/renders") -> None:
        self.mock = mock
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def graph(self) -> dict[str, Any]:
        return {
            "name": "MOTIONFORGE AI",
            "orchestrator": "AI ORCHESTRATOR",
            "branches": {
                "IMAGE": ["FLUX", "SDXL"],
                "VIDEO": ["Wan", "Hunyuan", "LTX"],
                "AUDIO": ["TTS", "Whisper"],
            },
            "motion_engine": True,
            "assembler": "FFmpeg",
            "output": "FINAL VIDEO",
            "models": list_models(),
        }

    async def run(self, plan: dict[str, Any]) -> dict[str, Any]:
        image_id = plan.get("image_model", "sdxl-base")
        video_id = plan.get("video_model", "ltx-video")
        tts_id = plan.get("tts_model", "kokoro")
        image = resolve_image(image_id, mock=self.mock)
        video = resolve_video(video_id, mock=self.mock)
        tts = resolve_tts(tts_id, mock=self.mock)
        whisper = WhisperAdapter()

        scenes = plan.get("scenes") or [
            {
                "scene_id": 1,
                "narration": plan.get("idea", "A cinematic scene."),
                "visual_prompt": plan.get("idea", "cinematic still"),
                "subject_motion": "subtle natural movement, preserve identity",
                "camera_motion": "slow dolly-in",
                "environment_motion": "light wind, dust",
                "lighting_motion": "stable motivated light",
                "facial_motion": "one blink, preserve facial structure",
                "duration": float(plan.get("duration", 5)),
            }
        ]

        rendered_scenes: list[dict[str, Any]] = []
        narration_parts: list[str] = []
        clip_uris: list[str] = []

        for scene in scenes:
            still = await image.generate(scene.get("visual_prompt") or scene.get("narration", ""))
            motion = compile_motion(
                visual_prompt=scene.get("visual_prompt", ""),
                subject_motion=scene.get("subject_motion", "subtle natural movement"),
                camera_motion=scene.get("camera_motion", "slow dolly-in"),
                environment_motion=scene.get("environment_motion", "light atmospheric motion"),
                lighting_motion=scene.get("lighting_motion", "stable lighting"),
                facial_motion=scene.get("facial_motion", ""),
                duration=float(scene.get("duration", 5)),
            )
            clip = await video.generate(motion["video_prompt"], duration=motion["duration"])
            narration = scene.get("narration", "")
            if narration:
                narration_parts.append(narration)
            clip_uris.append(clip["uri"])
            rendered_scenes.append(
                {
                    "scene_id": scene.get("scene_id"),
                    "image": still,
                    "motion": motion,
                    "video": clip,
                }
            )

        full_narration = " ".join(narration_parts)
        voice = await tts.synthesize(full_narration or " ")
        captions = await whisper.transcribe(voice["uri"], text=full_narration)
        final = assemble(
            clip_uris,
            None,
            str(self.output_dir / f"{plan.get('project_id', 'preview')}.mp4"),
        )

        return {
            "pipeline": "MOTIONFORGE",
            "hops": ["IMAGE", "VIDEO", "AUDIO", "MOTION ENGINE", "FFmpeg", "FINAL VIDEO"],
            "image_model": image_id,
            "video_model": video_id,
            "tts_model": tts_id,
            "scenes": rendered_scenes,
            "audio": voice,
            "captions": captions,
            "final_video": final,
        }
