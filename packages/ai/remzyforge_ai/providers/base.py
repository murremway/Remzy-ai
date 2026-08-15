from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ImageProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError


class VideoProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError


class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError


class MusicProvider(ABC):
    @abstractmethod
    async def compose(self, brief: str, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError
