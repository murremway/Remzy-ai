"""PromptCompiler — model-agnostic prompt assembly (Phase 2+)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CompiledPrompts:
    image_prompt: str
    video_prompt: str
    motion_prompt: str
    negative_prompt: str


class PromptCompiler:
    def compile(
        self,
        *,
        scene: str,
        character: str = "",
        style: str = "",
        camera: str = "static",
        lighting: str = "",
        motion: str = "",
        duration: float = 5,
        aspect_ratio: str = "9:16",
    ) -> CompiledPrompts:
        subject = ", ".join(part for part in [character, scene] if part)
        look = ", ".join(part for part in [style, lighting, f"{aspect_ratio} framing"] if part)
        image = f"{subject}. {look}. No text, no watermark."
        video = f"{image} Camera: {camera}. Duration {duration:.1f}s."
        motion_prompt = motion or f"{camera} with subtle environmental movement"
        negative = "blurry, watermark, logo, extra limbs, distorted faces, low contrast"
        return CompiledPrompts(image, video, motion_prompt, negative)


class WanPromptAdapter:
    def adapt(self, compiled: CompiledPrompts) -> CompiledPrompts:
        return compiled


class HunyuanPromptAdapter:
    def adapt(self, compiled: CompiledPrompts) -> CompiledPrompts:
        return compiled


class LTXPromptAdapter:
    def adapt(self, compiled: CompiledPrompts) -> CompiledPrompts:
        return compiled
