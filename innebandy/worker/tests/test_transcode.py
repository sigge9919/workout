import json
import subprocess
from pathlib import Path

import pytest

from innebandy_worker.transcode import TranscodeError, probe, transcode


def make_clip(path: Path, seconds=6, fps=30, size="1280x720", audio=True) -> Path:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-f", "lavfi", "-i", f"testsrc2=size={size}:rate={fps}:duration={seconds}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:a", "aac"]
    # Long GOP in the source on purpose: the proxy must fix it.
    cmd += ["-c:v", "libx264", "-g", "250", "-pix_fmt", "yuv420p", "-shortest", str(path)]
    subprocess.run(cmd, check=True)
    return path


def keyframe_times(path: Path) -> list[float]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey",
         "-show_entries", "frame=pts_time", "-of", "json", str(path)],
        capture_output=True, text=True, check=True).stdout
    return [float(f["pts_time"]) for f in json.loads(out)["frames"]]


def test_transcode_proxy_properties(tmp_path):
    src = make_clip(tmp_path / "in.mp4")
    progress = []
    res = transcode(src, tmp_path / "out", on_progress=progress.append)

    assert abs(res.duration_s - 6) < 0.2
    assert res.fps == 30
    assert (res.width, res.height) == (1280, 720)
    assert Path(res.poster_path).stat().st_size > 0

    # One keyframe per second => stream-copy clip cuts are within 1 s.
    kf = keyframe_times(Path(res.proxy_path))
    gaps = [b - a for a, b in zip(kf, kf[1:])]
    assert len(kf) >= 6 and max(gaps) <= 1.01

    # +faststart: moov atom before mdat.
    data = Path(res.proxy_path).read_bytes()
    assert data.find(b"moov") < data.find(b"mdat")

    assert progress == sorted(progress)


def test_transcode_downscales_to_1080p_and_handles_no_audio(tmp_path):
    src = make_clip(tmp_path / "in.mp4", seconds=2, fps=25, size="2560x1440", audio=False)
    res = transcode(src, tmp_path / "out")
    assert (res.width, res.height) == (1920, 1080)
    assert probe(res.proxy_path).has_audio is False


def test_transcode_rejects_non_video(tmp_path):
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"not a video")
    with pytest.raises(TranscodeError):
        transcode(bad, tmp_path / "out")
