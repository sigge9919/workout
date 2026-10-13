"""Proxy transcoding with ffmpeg.

The proxy is what the browser plays and what clip exports are cut from:
H.264 (yuv420p) + AAC in MP4, at most 1080p, with a keyframe every second and
the moov atom up front (+faststart) so seeking over HTTP range requests is
fast. One-second GOPs keep stream-copy clip exports within 1 s of the
requested in/out points.
"""

from __future__ import annotations

import json
import math
import re
import subprocess
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path

FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"


class TranscodeError(RuntimeError):
    pass


@dataclass
class ProbeResult:
    duration_s: float
    fps: float
    width: int
    height: int
    has_audio: bool


@dataclass
class TranscodeResult:
    duration_s: float
    fps: float
    width: int
    height: int
    proxy_path: str
    poster_path: str

    def as_dict(self) -> dict:
        return asdict(self)


def _parse_rate(rate: str | None) -> float:
    if not rate or rate == "0/0":
        return 0.0
    if "/" in rate:
        num, den = rate.split("/", 1)
        return float(num) / float(den) if float(den) else 0.0
    return float(rate)


def probe(path: str | Path) -> ProbeResult:
    proc = subprocess.run(
        [FFPROBE, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise TranscodeError(f"ffprobe failed: {proc.stderr.strip()[:500]}")
    info = json.loads(proc.stdout)
    video = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    if video is None:
        raise TranscodeError("Filen innehåller ingen videoström.")
    duration = float(info.get("format", {}).get("duration") or video.get("duration") or 0)
    fps = _parse_rate(video.get("avg_frame_rate")) or _parse_rate(video.get("r_frame_rate"))
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    return ProbeResult(duration, fps, int(video["width"]), int(video["height"]), has_audio)


def proxy_command(src: str | Path, dst: str | Path, p: ProbeResult) -> list[str]:
    # Keep the source frame rate (25/30/50/60) but cap at 60; GOP = 1 s.
    fps = min(round(p.fps) or 25, 60)
    vf = "scale=-2:'min(1080,ih)':flags=bicubic,format=yuv420p"
    cmd = [
        FFMPEG, "-hide_banner", "-y", "-i", str(src),
        "-map", "0:v:0", "-vf", vf, "-r", str(fps),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-profile:v", "high",
        "-g", str(fps), "-keyint_min", str(fps), "-sc_threshold", "0",
    ]
    if p.has_audio:
        cmd += ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ac", "2"]
    cmd += ["-movflags", "+faststart", "-progress", "pipe:1", "-nostats", str(dst)]
    return cmd


_OUT_TIME = re.compile(r"^out_time_us=(\d+)$")


def transcode(
    src: str | Path,
    out_dir: str | Path,
    on_progress: Callable[[float], None] | None = None,
) -> TranscodeResult:
    """Transcode src into out_dir/proxy.mp4 and out_dir/poster.jpg."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    p = probe(src)
    proxy = out / "proxy.mp4"
    poster = out / "poster.jpg"

    proc = subprocess.Popen(proxy_command(src, proxy, p), stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)
    last = -1.0
    assert proc.stdout is not None
    for line in proc.stdout:
        m = _OUT_TIME.match(line.strip())
        if m and on_progress and p.duration_s > 0:
            frac = min(int(m.group(1)) / 1e6 / p.duration_s, 0.99)
            if frac - last >= 0.02:
                last = frac
                on_progress(frac)
    stderr = proc.stderr.read() if proc.stderr else ""
    if proc.wait() != 0:
        raise TranscodeError(f"ffmpeg failed: {stderr.strip()[-800:]}")

    out_probe = probe(proxy)
    at = max(min(out_probe.duration_s * 0.1, 60.0), 0.0)
    subprocess.run(
        [FFMPEG, "-hide_banner", "-y", "-ss", f"{at:.2f}", "-i", str(proxy), "-frames:v", "1",
         "-vf", "scale=640:-2", "-q:v", "4", str(poster)],
        capture_output=True, check=True,
    )
    return TranscodeResult(
        duration_s=math.floor(out_probe.duration_s * 1000) / 1000,
        fps=round(out_probe.fps, 3),
        width=out_probe.width,
        height=out_probe.height,
        proxy_path=str(proxy),
        poster_path=str(poster),
    )
