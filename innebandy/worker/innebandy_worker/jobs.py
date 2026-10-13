"""Job runners. Each runner is plain Python so it can run inline in the API
process during development or inside a Modal function in production.

Workers report status through the `job_report` RPC, authenticated by the
per-job token, so they need neither user sessions nor the service-role key.
"""

from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path

import httpx

from .storage import Storage
from .transcode import TranscodeError, transcode

log = logging.getLogger(__name__)


@dataclass
class JobRef:
    job_id: str
    token: str


class Reporter:
    """Calls the job-token RPCs (job_report, job_storage_cleanup, ...)."""

    def __init__(self, supabase_url: str, anon_key: str, job: JobRef):
        self.base = supabase_url.rstrip("/") + "/rest/v1/rpc/"
        self.headers = {"apikey": anon_key}
        if anon_key.startswith("eyJ"):
            # Legacy JWT anon key; new sb_publishable_ keys go in apikey only.
            self.headers["Authorization"] = f"Bearer {anon_key}"
        self.job = job

    def rpc(self, name: str, **params):
        body = {"p_job_id": self.job.job_id, "p_token": self.job.token, **params}
        r = httpx.post(self.base + name, json=body, headers=self.headers, timeout=30)
        if r.status_code >= 300:
            log.error("%s failed: %s %s", name, r.status_code, r.text)
            r.raise_for_status()
        return r.json() if r.content else None

    def __call__(self, status: str, progress: float | None = None, message: str | None = None,
                 result: dict | None = None) -> None:
        self.rpc("job_report", p_status=status, p_progress=progress, p_message=message, p_result=result)


def proxy_keys(original_key: str) -> tuple[str, str]:
    base = original_key.rsplit("/", 1)[0]
    return f"{base}/proxy.mp4", f"{base}/poster.jpg"


def run_transcode(storage: Storage, original_key: str, report) -> dict:
    """Download the original, build the proxy + poster, upload them, report."""
    report("running", 0.01, "Laddar ned original")
    try:
        with tempfile.TemporaryDirectory(prefix="transcode-") as tmp:
            src = Path(tmp) / ("original" + Path(original_key).suffix)
            storage.download(original_key, src)
            report("running", 0.03, "Transkoderar")

            def progress(frac: float) -> None:
                report("running", 0.03 + frac * 0.9, "Transkoderar")

            res = transcode(src, Path(tmp) / "out", on_progress=progress)
            report("running", 0.95, "Laddar upp proxy")
            proxy_key, poster_key = proxy_keys(original_key)
            storage.upload(res.proxy_path, proxy_key, "video/mp4")
            storage.upload(res.poster_path, poster_key, "image/jpeg")
            result = {"proxy_key": proxy_key, "poster_key": poster_key, "duration_s": res.duration_s,
                      "fps": res.fps, "width": res.width, "height": res.height}
            report("succeeded", 1.0, "Klar", result)
            return result
    except TranscodeError as e:
        report("failed", None, str(e))
        raise
    except Exception as e:  # report anything else too, then re-raise for logs
        report("failed", None, f"Oväntat fel: {e}")
        raise


def run_storage_cleanup(storage: Storage, client: Reporter) -> dict:
    """Delete originals outside the team's retention window and files of
    deleted videos. Failures are logged, never fatal: the video is ready."""
    deleted_videos: list[str] = []
    deleted_prefixes: list[str] = []
    try:
        for row in client.rpc("job_storage_cleanup") or []:
            try:
                if row["kind"] == "original":
                    storage.delete(row["key"])
                    deleted_videos.append(row["video_id"])
                elif row["kind"] == "prefix":
                    storage.delete_prefix(row["key"])
                    deleted_prefixes.append(row["key"])
            except Exception as e:  # keep going with the rest
                log.warning("cleanup of %s failed: %s", row.get("key"), e)
        if deleted_videos or deleted_prefixes:
            client.rpc("job_storage_cleanup_done", p_video_ids=deleted_videos, p_prefixes=deleted_prefixes)
    except Exception as e:
        log.warning("storage cleanup skipped: %s", e)
    return {"originals": len(deleted_videos), "prefixes": len(deleted_prefixes)}


def run_transcode_job(storage: Storage, original_key: str, client: Reporter) -> dict:
    """Transcode, then apply storage retention for the team."""
    result = run_transcode(storage, original_key, client)
    run_storage_cleanup(storage, client)
    return result
