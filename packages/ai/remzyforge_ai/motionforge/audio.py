"""AUDIO branch: TTS · Whisper."""

from __future__ import annotations

from remzyforge_ai.providers.mock import MockTTSProvider


class KokoroTTSAdapter(MockTTSProvider):
    async def synthesize(self, text: str, **kwargs):
        result = await super().synthesize(text, **kwargs)
        result["provider"] = "kokoro"
        result["branch"] = "AUDIO"
        return result


class WhisperAdapter:
    async def transcribe(self, audio_uri: str, **kwargs) -> dict:
        text = kwargs.get("text", "")
        return {
            "provider": "whisper-base",
            "branch": "AUDIO",
            "audio_uri": audio_uri,
            "text": text,
            "srt": f"1\n00:00:00,000 --> 00:00:04,000\n{text[:80]}",
            "vtt": f"WEBVTT\n\n00:00:00.000 --> 00:00:04.000\n{text[:80]}",
        }


def resolve_tts(model_id: str, *, mock: bool = True) -> MockTTSProvider:
    if mock:
        return KokoroTTSAdapter() if model_id == "kokoro" else MockTTSProvider()
    raise RuntimeError(f"Local TTS backend not configured for {model_id}")
