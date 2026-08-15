"""MOTION ENGINE — turns a still + scene into a constrained i2v instruction."""

from __future__ import annotations

from typing import Any


def compile_motion(
    *,
    visual_prompt: str,
    subject_motion: str,
    camera_motion: str,
    environment_motion: str,
    lighting_motion: str,
    facial_motion: str = "",
    duration: float = 5,
) -> dict[str, Any]:
    video_prompt = (
        f"Image-to-video, {duration:.1f}s. Animate only the supplied still. "
        f"Subject: {subject_motion} "
        f"Face: {facial_motion or 'preserve identity; one natural blink'}. "
        f"Camera: {camera_motion}. "
        f"Environment: {environment_motion} "
        f"Light: {lighting_motion} "
        f"Keep clothing, geometry, hands, and faces identical. "
        f"No morphing, no extra limbs, no flicker. {visual_prompt}"
    )
    return {
        "engine": "motionforge",
        "duration": duration,
        "subject_motion": subject_motion,
        "facial_motion": facial_motion,
        "camera_motion": camera_motion,
        "environment_motion": environment_motion,
        "lighting_motion": lighting_motion,
        "video_prompt": video_prompt,
        "negative_prompt": (
            "deformed anatomy, extra fingers, duplicate people, warped faces, "
            "flickering, unstable identity, camera jitter, unnatural motion, "
            "melting objects, distorted hands, text artifacts, watermarks, "
            "low resolution, frame inconsistency"
        ),
    }
