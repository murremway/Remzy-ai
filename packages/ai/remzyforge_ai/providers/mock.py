"""Deterministic mock providers so the product works without a GPU."""

from __future__ import annotations

import hashlib
from typing import Any

from remzyforge_ai.providers.base import ImageProvider, MusicProvider, TTSProvider, VideoProvider


def _seed(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:16]


class MockImageProvider(ImageProvider):
    async def generate(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        return {
            "provider": "mock",
            "kind": "image",
            "prompt": prompt,
            "seed": kwargs.get("seed") or _seed(prompt),
            "uri": f"mock://image/{_seed(prompt)}.png",
            "width": kwargs.get("width", 1280),
            "height": kwargs.get("height", 720),
        }


class MockVideoProvider(VideoProvider):
    async def generate(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        return {
            "provider": "mock",
            "kind": "video",
            "prompt": prompt,
            "seed": kwargs.get("seed") or _seed(prompt),
            "uri": f"mock://video/{_seed(prompt)}.mp4",
            "duration": kwargs.get("duration", 5),
        }


class MockTTSProvider(TTSProvider):
    async def synthesize(self, text: str, **kwargs: Any) -> dict[str, Any]:
        return {
            "provider": "mock",
            "kind": "audio",
            "text": text,
            "uri": f"mock://voice/{_seed(text)}.wav",
            "duration": max(1.2, len(text.split()) / 2.3),
        }


class MockMusicProvider(MusicProvider):
    async def compose(self, brief: str, **kwargs: Any) -> dict[str, Any]:
        return {
            "provider": "mock",
            "kind": "music",
            "brief": brief,
            "uri": f"mock://music/{_seed(brief)}.wav",
        }
