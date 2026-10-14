"""FastAPI service: video upload, transcoding jobs and signed playback URLs.

Everything that is plain CRUD goes from the web app straight to Supabase
(RLS); this service only does what needs Python, storage credentials or
background work.
"""

from __future__ import annotations

import logging
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from innebandy_worker.jobs import JobRef, Reporter, run_transcode_job
from innebandy_worker.storage import PART_SIZE, LocalStorage, Part, Storage, storage_from_env

from .config import Settings, get_settings
from .supabase import SupabaseClient

log = logging.getLogger("innebandy.api")

app = FastAPI(title="Innebandyanalys API")

MAX_UPLOAD_BYTES = 200 * 1024**3
ALLOWED_EXT = {".mp4", ".mov", ".mkv", ".m4v", ".avi", ".mts", ".ts", ".webm"}


# ---------------------------------------------------------------- dependencies

@lru_cache
def get_storage() -> Storage:
    s = get_settings()
    return storage_from_env({
        "STORAGE_BACKEND": s.storage_backend, "LOCAL_STORAGE_DIR": s.local_storage_dir,
        "PUBLIC_API_URL": s.public_api_url, "MEDIA_SIGNING_SECRET": s.media_signing_secret,
        "S3_BUCKET": s.s3_bucket or "", "S3_ENDPOINT": s.s3_endpoint or "",
        "S3_ACCESS_KEY_ID": s.s3_access_key_id or "", "S3_SECRET_ACCESS_KEY": s.s3_secret_access_key or "",
        "S3_REGION": s.s3_region,
    })


@lru_cache
def get_supabase() -> SupabaseClient:
    s = get_settings()
    return SupabaseClient(s.supabase_url, s.supabase_anon_key)


class Dispatcher:
    """Runs jobs inline (thread pool, dev) or on Modal (production)."""

    def __init__(self, settings: Settings, storage: Storage):
        self.settings = settings
        self.storage = storage
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="job")

    def transcode(self, job: JobRef, original_key: str) -> None:
        if self.settings.worker_mode == "modal":
            import modal
            fn = modal.Function.from_name("innebandy-worker", "transcode_job")
            fn.spawn(job.job_id, job.token, original_key)
            return
        report = Reporter(self.settings.supabase_url, self.settings.supabase_anon_key, job)
        fut = self.pool.submit(run_transcode_job, self.storage, original_key, report)
        fut.add_done_callback(lambda f: f.exception() and log.error("transcode failed: %s", f.exception()))


@lru_cache
def get_dispatcher() -> Dispatcher:
    return Dispatcher(get_settings(), get_storage())


def bearer(authorization: str = Header(default="")) -> str:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Inloggning krävs.")
    return authorization[7:]


def current_token(token: str = Depends(bearer), sb: SupabaseClient = Depends(get_supabase)) -> str:
    sb.get_user(token)
    return token


def _configure_cors() -> None:
    try:
        s = get_settings()
        origins = [o.strip().rstrip("/") for o in s.cors_origins.split(",") if o.strip()]
        origin_regex = s.cors_origin_regex or None
    except Exception:  # settings missing at import time (tests configure later)
        origins, origin_regex = ["http://localhost:3000"], None
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_origin_regex=origin_regex,
                       allow_methods=["*"], allow_headers=["*"], expose_headers=["ETag"])


_configure_cors()


# ---------------------------------------------------------------- models

class UploadInit(BaseModel):
    filename: str = Field(max_length=255)
    size: int = Field(gt=0, le=MAX_UPLOAD_BYTES)
    content_type: str = "video/mp4"


class UploadInitOut(BaseModel):
    upload_id: str
    key: str
    part_size: int
    part_count: int


class PartsIn(BaseModel):
    upload_id: str
    part_numbers: list[int] = Field(min_length=1, max_length=100)


class PartIn(BaseModel):
    part_number: int = Field(ge=1, le=10000)
    etag: str


class CompleteIn(BaseModel):
    upload_id: str
    parts: list[PartIn] = Field(min_length=1, max_length=10000)


# ---------------------------------------------------------------- routes

@app.get("/health")
def health() -> dict:
    return {"ok": True, "commit": os.environ.get("RENDER_GIT_COMMIT", "")[:7]}


def _original_key(video: dict, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Filtypen {ext or '(ingen)'} stöds inte.")
    return f"teams/{video['team_id']}/videos/{video['id']}/original{ext}"


@app.post("/videos/{video_id}/upload/init", response_model=UploadInitOut)
def upload_init(video_id: str, body: UploadInit, token: str = Depends(current_token),
                sb: SupabaseClient = Depends(get_supabase), storage: Storage = Depends(get_storage)):
    video = sb.get_video(token, video_id)
    if video["status"] in ("processing", "ready"):
        raise HTTPException(409, "Videon är redan uppladdad.")
    key = _original_key(video, body.filename)
    # Update first: RLS rejects members without edit rights before any upload starts.
    sb.update_video(token, video_id, {"status": "uploading", "original_key": key,
                                      "original_bytes": body.size, "storage_backend": storage.name,
                                      "error": None})
    upload_id = storage.create_multipart(key, body.content_type)
    return UploadInitOut(upload_id=upload_id, key=key, part_size=PART_SIZE,
                         part_count=max(1, math.ceil(body.size / PART_SIZE)))


@app.post("/videos/{video_id}/upload/parts")
def upload_parts(video_id: str, body: PartsIn, token: str = Depends(current_token),
                 sb: SupabaseClient = Depends(get_supabase), storage: Storage = Depends(get_storage)):
    video = sb.get_video(token, video_id)
    if video["status"] != "uploading" or not video.get("original_key"):
        raise HTTPException(409, "Ingen pågående uppladdning.")
    return {"urls": {n: storage.presign_part(video["original_key"], body.upload_id, n) for n in body.part_numbers}}


@app.post("/videos/{video_id}/upload/complete")
def upload_complete(video_id: str, body: CompleteIn, token: str = Depends(current_token),
                    sb: SupabaseClient = Depends(get_supabase), storage: Storage = Depends(get_storage),
                    dispatcher: Dispatcher = Depends(get_dispatcher)):
    video = sb.get_video(token, video_id)
    if video["status"] != "uploading" or not video.get("original_key"):
        raise HTTPException(409, "Ingen pågående uppladdning.")
    key = video["original_key"]
    storage.complete_multipart(key, body.upload_id, [Part(p.part_number, p.etag) for p in body.parts])
    sb.update_video(token, video_id, {"status": "uploaded"})
    job_id, job_token = sb.create_job(token, video_id, "transcode")
    dispatcher.transcode(JobRef(job_id, job_token), key)
    return {"job_id": job_id}


@app.post("/videos/{video_id}/transcode")
def retranscode(video_id: str, token: str = Depends(current_token),
                sb: SupabaseClient = Depends(get_supabase), dispatcher: Dispatcher = Depends(get_dispatcher)):
    """Re-run transcoding (e.g. after a failure)."""
    video = sb.get_video(token, video_id)
    if video.get("original_deleted_at"):
        raise HTTPException(409, "Originalfilen är raderad enligt lagets inställning och kan inte bearbetas om.")
    if not video.get("original_key") or video["status"] in ("created", "uploading"):
        raise HTTPException(409, "Videon är inte uppladdad.")
    job_id, job_token = sb.create_job(token, video_id, "transcode")
    dispatcher.transcode(JobRef(job_id, job_token), video["original_key"])
    return {"job_id": job_id}


@app.get("/videos/{video_id}/playback")
def playback(video_id: str, token: str = Depends(current_token), sb: SupabaseClient = Depends(get_supabase),
             storage: Storage = Depends(get_storage), settings: Settings = Depends(get_settings)):
    video = sb.get_video(token, video_id)
    if video["status"] != "ready" or not video.get("proxy_key"):
        raise HTTPException(409, "Videon är inte färdigbearbetad ännu.")
    ttl = settings.playback_url_ttl_s
    return {
        "url": storage.presign_get(video["proxy_key"], ttl),
        "poster_url": storage.presign_get(video["poster_key"], ttl) if video.get("poster_key") else None,
        "expires_in": ttl,
    }


# ---------------------------------------------------------------- local storage (dev)

_PART_RE = re.compile(r"^[0-9a-f-]{36}$")


def _local(storage: Storage = Depends(get_storage)) -> LocalStorage:
    if not isinstance(storage, LocalStorage):
        raise HTTPException(404)
    return storage


@app.put("/local-storage/upload/{upload_id}/{part_number}")
async def local_upload_part(upload_id: str, part_number: int, exp: int, sig: str, request: Request,
                            storage: LocalStorage = Depends(_local)):
    if not _PART_RE.match(upload_id) or not storage.verify(f"part:{upload_id}:{part_number}", exp, sig):
        raise HTTPException(403, "Ogiltig eller utgången uppladdningslänk.")
    try:
        etag = await storage.write_part(upload_id, part_number, request.stream())
    except FileNotFoundError:
        raise HTTPException(404, "Okänd uppladdning.")
    return Response(status_code=200, headers={"ETag": etag})


@app.get("/local-storage/media/{key:path}")
def local_media(key: str, exp: int, sig: str, storage: LocalStorage = Depends(_local)):
    if not storage.verify(f"get:{key}", exp, sig):
        raise HTTPException(403, "Ogiltig eller utgången länk.")
    try:
        path = storage.path(key)
    except ValueError:
        raise HTTPException(400)
    if not path.is_file():
        raise HTTPException(404)
    media_type = "video/mp4" if key.endswith(".mp4") else "image/jpeg" if key.endswith(".jpg") else None
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "private, max-age=3600"})
