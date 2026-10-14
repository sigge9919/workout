"""Modal deployment of the worker (used when the API runs with WORKER_MODE=modal).

Deploy:  modal deploy worker/modal_app.py   (worker + the API web endpoint)
Secrets: a Modal secret named "innebandy-worker" with STORAGE_BACKEND=s3,
         S3_* variables, SUPABASE_URL and SUPABASE_ANON_KEY.

Phase 1 only has CPU transcoding; GPU functions for the analysis pipeline are
added from phase 3.
"""

import os
from pathlib import Path

import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install("httpx", "boto3")
    .add_local_python_source("innebandy_worker")
)

# The API (innebandy/api) as a web endpoint. The web app reaches it same-origin
# through the /api route in the repo's vercel.json.
api_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("fastapi>=0.115", "httpx", "boto3", "pydantic-settings>=2.4", "modal>=1.0")
    .env({"WORKER_MODE": "modal", "CORS_ORIGINS": "http://localhost:3000"})
    .add_local_python_source("innebandy_worker")
    .add_local_dir(Path(__file__).resolve().parent.parent / "api" / "app", "/root/app")
)

app = modal.App("innebandy-worker", image=image)


@app.function(image=api_image, secrets=[modal.Secret.from_name("innebandy-worker")], scaledown_window=300)
@modal.concurrent(max_inputs=50)
@modal.asgi_app()
def api():
    from app.main import app as fastapi_app

    return fastapi_app


@app.function(cpu=4, memory=4096, timeout=3 * 3600,
              secrets=[modal.Secret.from_name("innebandy-worker")])
def transcode_job(job_id: str, token: str, original_key: str) -> dict:
    from innebandy_worker.jobs import JobRef, Reporter, run_transcode_job
    from innebandy_worker.storage import storage_from_env

    report = Reporter(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"], JobRef(job_id, token))
    return run_transcode_job(storage_from_env(), original_key, report)
