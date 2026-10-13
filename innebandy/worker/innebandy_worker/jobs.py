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
    def __init__(self, supabase_url: str, anon_key: str, job: JobRef):
        self.url = supabase_url.rstrip("/") + "/rest/v1/rpc/job_report"
        self.headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
        self.job = job

    def __call__(self, status: str, progress: float | None = None, message: str | None = None,
                 result: dict | None = None) -> None:
        body = {"p_job_id": self.job.job_id, "p_token": self.job.token, "p_status": status,
                "p_progress": progress, "p_message": message, "p_result": result}
        r = httpx.post(self.url, json=body, headers=self.headers, timeout=30)
        if r.status_code >= 300:
            log.error("job_report failed: %s %s", r.status_code, r.text)
            r.raise_for_status()


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
