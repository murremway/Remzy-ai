"""VIDEO branch: Wan · Hunyuan · LTX."""

from __future__ import annotations

from remzyforge_ai.providers.base import VideoProvider
from remzyforge_ai.providers.mock import MockVideoProvider


class WanAdapter(MockVideoProvider):
    async def generate(self, prompt: str, **kwargs):
        result = await super().generate(prompt, **kwargs)
        result["provider"] = "wan-video"
        result["branch"] = "VIDEO"
        return result


class HunyuanAdapter(MockVideoProvider):
    async def generate(self, prompt: str, **kwargs):
        result = await super().generate(prompt, **kwargs)
        result["provider"] = "hunyuan-video"
        result["branch"] = "VIDEO"
        return result


class LTXAdapter(MockVideoProvider):
    async def generate(self, prompt: str, **kwargs):
        result = await super().generate(prompt, **kwargs)
        result["provider"] = "ltx-video"
        result["branch"] = "VIDEO"
        return result


def resolve_video(model_id: str, *, mock: bool = True) -> VideoProvider:
    if mock:
        mapping = {
            "wan-video": WanAdapter(),
            "hunyuan-video": HunyuanAdapter(),
            "ltx-video": LTXAdapter(),
        }
        return mapping.get(model_id, MockVideoProvider())
    raise RuntimeError(f"Local GPU video backend not configured for {model_id}")
