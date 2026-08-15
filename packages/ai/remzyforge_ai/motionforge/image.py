"""IMAGE branch: FLUX · SDXL (swap via registry; mock when GPU is off)."""

from __future__ import annotations

from remzyforge_ai.providers.base import ImageProvider
from remzyforge_ai.providers.mock import MockImageProvider


class FluxAdapter(MockImageProvider):
    async def generate(self, prompt: str, **kwargs):
        result = await super().generate(prompt, **kwargs)
        result["provider"] = "flux-compatible"
        result["branch"] = "IMAGE"
        return result


class SDXLAdapter(MockImageProvider):
    async def generate(self, prompt: str, **kwargs):
        result = await super().generate(prompt, **kwargs)
        result["provider"] = "sdxl-base"
        result["branch"] = "IMAGE"
        return result


def resolve_image(model_id: str, *, mock: bool = True) -> ImageProvider:
    if mock:
        return {"flux-compatible": FluxAdapter(), "sdxl-base": SDXLAdapter()}.get(
            model_id, MockImageProvider()
        )
    raise RuntimeError(f"Local GPU image backend not configured for {model_id}")
