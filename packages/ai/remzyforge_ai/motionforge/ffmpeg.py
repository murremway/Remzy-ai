"""FFmpeg assembly — last hop before FINAL VIDEO."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def assemble(
    clip_uris: list[str],
    audio_uri: str | None,
    output_path: str,
    *,
    fast: bool = False,
) -> dict:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    if fast or not clip_uris:
        out.write_bytes(b"MOTIONFORGE_PLACEHOLDER_MP4")
        return {"engine": "placeholder", "uri": str(out), "clips": clip_uris, "audio": audio_uri}

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        out.write_bytes(b"MOTIONFORGE_PLACEHOLDER_MP4")
        return {"engine": "placeholder", "uri": str(out), "clips": clip_uris, "audio": audio_uri}

    color = "color=c=0x1a1410:s=720x1280:d=1,format=yuv420p"
    cmd = [
        ffmpeg,
        "-y",
        "-f",
        "lavfi",
        "-i",
        color,
        "-frames:v",
        "24",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        str(out),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=20)
        engine = "ffmpeg"
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        out.write_bytes(b"MOTIONFORGE_PLACEHOLDER_MP4")
        engine = "placeholder"
    return {"engine": engine, "uri": str(out), "clips": clip_uris, "audio": audio_uri}
