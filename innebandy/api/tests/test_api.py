"""API flow: multipart upload to local storage -> transcode job -> playback.

Supabase is replaced by an in-memory fake that mimics RLS outcomes; the job
runs synchronously with a fake reporter that applies results like job_report.
"""

import subprocess
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main
from app.config import Settings
from innebandy_worker.jobs import run_transcode
from innebandy_worker.storage import LocalStorage

TEAM = str(uuid.uuid4())


class FakeSupabase:
    def __init__(self):
        self.videos: dict[str, dict] = {}
        self.editors = {"coach-token"}
        self.readers = {"coach-token", "player-token"}
        self.jobs: list[dict] = []

    def get_user(self, token):
        if token not in self.readers:
            raise HTTPException(401)
        return {"id": token}

    def get_video(self, token, video_id):
        if token not in self.readers or video_id not in self.videos:
            raise HTTPException(404)
        return dict(self.videos[video_id])

    def update_video(self, token, video_id, data):
        if token not in self.editors:
            raise HTTPException(403)
        self.videos[video_id].update(data)
        return self.videos[video_id]

    def create_job(self, token, video_id, kind, params=None):
        if token not in self.editors:
            raise HTTPException(403)
        job = {"id": str(uuid.uuid4()), "video_id": video_id, "kind": kind, "status": "queued"}
        self.jobs.append(job)
        return job["id"], "job-token"


class SyncDispatcher:
    def __init__(self, sb, storage):
        self.sb, self.storage = sb, storage

    def transcode(self, job, original_key):
        rec = next(j for j in self.sb.jobs if j["id"] == job.job_id)
        video = self.sb.videos[rec["video_id"]]

        def report(status, progress=None, message=None, result=None):
            rec["status"] = status
            if status == "succeeded":
                video.update(status="ready", **result)
            elif status == "failed":
                video.update(status="failed", error=message)

        run_transcode(self.storage, original_key, report)


@pytest.fixture
def env(tmp_path):
    settings = Settings(supabase_url="http://sb.test", supabase_anon_key="anon",
                        public_api_url="http://testserver", local_storage_dir=str(tmp_path / "store"))
    storage = LocalStorage(settings.local_storage_dir, settings.public_api_url, settings.media_signing_secret)
    sb = FakeSupabase()
    main.app.dependency_overrides = {
        main.get_settings: lambda: settings,
        main.get_storage: lambda: storage,
        main.get_supabase: lambda: sb,
        main.get_dispatcher: lambda: SyncDispatcher(sb, storage),
    }
    yield TestClient(main.app), sb, tmp_path
    main.app.dependency_overrides = {}


def auth(token="coach-token"):
    return {"Authorization": f"Bearer {token}"}


def new_video(sb):
    vid = str(uuid.uuid4())
    sb.videos[vid] = {"id": vid, "team_id": TEAM, "status": "created", "original_key": None,
                      "proxy_key": None, "poster_key": None}
    return vid


def make_clip(path: Path) -> bytes:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                    "-i", "testsrc2=size=640x360:rate=25:duration=3", "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", str(path)], check=True)
    return path.read_bytes()


def upload(client, vid, data: bytes, part_size: int, token="coach-token"):
    r = client.post(f"/videos/{vid}/upload/init", headers=auth(token),
                    json={"filename": "match.mp4", "size": len(data)})
    assert r.status_code == 200, r.text
    init = r.json()
    chunks = [data[i:i + part_size] for i in range(0, len(data), part_size)]
    urls = {}
    numbers = list(range(1, len(chunks) + 1))
    for i in range(0, len(numbers), 100):  # API hands out at most 100 URLs per call
        r = client.post(f"/videos/{vid}/upload/parts", headers=auth(token),
                        json={"upload_id": init["upload_id"], "part_numbers": numbers[i:i + 100]})
        urls |= r.json()["urls"]
    parts = []
    for n, chunk in enumerate(chunks, 1):
        url = urls[str(n)].replace("http://testserver", "")
        pr = client.put(url, content=chunk)
        assert pr.status_code == 200, pr.text
        parts.append({"part_number": n, "etag": pr.headers["etag"]})
    return client.post(f"/videos/{vid}/upload/complete", headers=auth(token),
                       json={"upload_id": init["upload_id"], "parts": parts})


def test_full_upload_transcode_playback(env, monkeypatch):
    client, sb, tmp = env
    data = make_clip(tmp / "src.mp4")
    vid = new_video(sb)
    # Small parts to exercise multipart assembly.
    r = upload(client, vid, data, part_size=len(data) // 3 + 1)
    assert r.status_code == 200, r.text

    v = sb.videos[vid]
    assert v["status"] == "ready"
    assert v["original_key"] == f"teams/{TEAM}/videos/{vid}/original.mp4"
    assert abs(v["duration_s"] - 3) < 0.2 and v["fps"] == 25

    r = client.get(f"/videos/{vid}/playback", headers=auth("player-token"))
    assert r.status_code == 200
    url = r.json()["url"].replace("http://testserver", "")
    full = client.get(url)
    assert full.status_code == 200 and full.headers["content-type"] == "video/mp4"
    # Range requests are what make seeking in the browser fast.
    part = client.get(url, headers={"Range": "bytes=0-99"})
    assert part.status_code == 206 and len(part.content) == 100


def test_original_bytes_survive_multipart(env):
    client, sb, tmp = env
    data = make_clip(tmp / "src.mp4")
    vid = new_video(sb)
    upload(client, vid, data, part_size=1000)
    storage = main.app.dependency_overrides[main.get_storage]()
    assert storage.path(sb.videos[vid]["original_key"]).read_bytes() == data


def test_requires_login(env):
    client, sb, _ = env
    vid = new_video(sb)
    assert client.post(f"/videos/{vid}/upload/init", json={"filename": "a.mp4", "size": 10}).status_code == 401
    assert client.get(f"/videos/{vid}/playback", headers=auth("stranger")).status_code == 401


def test_player_cannot_upload(env):
    client, sb, _ = env
    vid = new_video(sb)
    r = client.post(f"/videos/{vid}/upload/init", headers=auth("player-token"),
                    json={"filename": "a.mp4", "size": 10})
    assert r.status_code == 403


def test_rejects_unknown_extension(env):
    client, sb, _ = env
    vid = new_video(sb)
    r = client.post(f"/videos/{vid}/upload/init", headers=auth(), json={"filename": "a.exe", "size": 10})
    assert r.status_code == 400


def test_signed_urls_are_checked(env):
    client, sb, tmp = env
    data = make_clip(tmp / "src.mp4")
    vid = new_video(sb)
    upload(client, vid, data, part_size=len(data))
    url = client.get(f"/videos/{vid}/playback", headers=auth()).json()["url"].replace("http://testserver", "")
    tampered = url.replace("proxy.mp4", "original.mp4")
    assert client.get(tampered).status_code == 403
    assert client.get(url.split("?")[0] + "?exp=1&sig=00").status_code == 403


def test_failed_transcode_marks_video(env):
    client, sb, _ = env
    vid = new_video(sb)
    with pytest.raises(Exception):
        upload(client, vid, b"definitely not a video" * 10, part_size=1000)
    assert sb.videos[vid]["status"] == "failed"
    assert "videoström" in sb.videos[vid]["error"] or "ffprobe" in sb.videos[vid]["error"]
