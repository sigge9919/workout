"""Object storage behind one small interface.

Backends:
  * local – files on disk, served by the API with HMAC-signed URLs (dev/tests)
  * s3    – any S3-compatible store: Cloudflare R2, Supabase Storage (S3
            protocol) or AWS S3. Uploads are multipart with presigned part URLs
            so multi-GB match videos can be uploaded straight from the browser.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import quote, urlencode

PART_SIZE = 64 * 1024 * 1024  # 64 MiB; S3 allows max 10 000 parts => 640 GB


@dataclass
class Part:
    part_number: int
    etag: str


class Storage(Protocol):
    name: str

    def create_multipart(self, key: str, content_type: str) -> str: ...
    def presign_part(self, key: str, upload_id: str, part_number: int, expires_s: int = 3600) -> str: ...
    def complete_multipart(self, key: str, upload_id: str, parts: list[Part]) -> None: ...
    def abort_multipart(self, key: str, upload_id: str) -> None: ...
    def presign_get(self, key: str, expires_s: int = 3600) -> str: ...
    def download(self, key: str, dest: str | Path) -> None: ...
    def upload(self, src: str | Path, key: str, content_type: str) -> None: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...
    def delete_prefix(self, prefix: str) -> int: ...


def _check_prefix(prefix: str) -> str:
    # Never allow wiping the whole bucket or a team folder by mistake.
    if not prefix.endswith("/") or prefix.count("/") < 4:
        raise ValueError(f"refusing to delete prefix {prefix!r}")
    return _check_key(prefix)


def _check_key(key: str) -> str:
    if not key or key.startswith("/") or ".." in key.split("/"):
        raise ValueError(f"invalid storage key: {key!r}")
    return key


class LocalStorage:
    """Disk-backed storage. Signed URLs point at the API's /local-storage routes."""

    name = "local"

    def __init__(self, root: str | Path, public_base_url: str, secret: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.base = public_base_url.rstrip("/")
        self.secret = secret.encode()

    # -- signing ---------------------------------------------------------
    def sign(self, payload: str, exp: int) -> str:
        return hmac.new(self.secret, f"{payload}:{exp}".encode(), hashlib.sha256).hexdigest()

    def verify(self, payload: str, exp: int, sig: str) -> bool:
        return exp >= int(time.time()) and hmac.compare_digest(self.sign(payload, exp), sig)

    def path(self, key: str) -> Path:
        p = (self.root / _check_key(key)).resolve()
        if self.root not in p.parents:
            raise ValueError("key escapes storage root")
        return p

    def _upload_dir(self, upload_id: str) -> Path:
        uuid.UUID(upload_id)  # validates format
        return self.root / ".uploads" / upload_id

    # -- multipart -------------------------------------------------------
    def create_multipart(self, key: str, content_type: str) -> str:
        _check_key(key)
        upload_id = str(uuid.uuid4())
        d = self._upload_dir(upload_id)
        d.mkdir(parents=True)
        (d / "key").write_text(key)
        return upload_id

    def presign_part(self, key: str, upload_id: str, part_number: int, expires_s: int = 3600) -> str:
        exp = int(time.time()) + expires_s
        payload = f"part:{upload_id}:{part_number}"
        q = urlencode({"exp": exp, "sig": self.sign(payload, exp)})
        return f"{self.base}/local-storage/upload/{upload_id}/{part_number}?{q}"

    async def write_part(self, upload_id: str, part_number: int, stream) -> str:
        d = self._upload_dir(upload_id)
        if not d.is_dir():
            raise FileNotFoundError(upload_id)
        h = hashlib.md5()
        tmp = d / f"{part_number:05d}.tmp"
        with tmp.open("wb") as f:
            async for chunk in stream:
                h.update(chunk)
                f.write(chunk)
        tmp.rename(d / f"{part_number:05d}.part")
        return f'"{h.hexdigest()}"'

    def complete_multipart(self, key: str, upload_id: str, parts: list[Part]) -> None:
        d = self._upload_dir(upload_id)
        if (d / "key").read_text() != key:
            raise ValueError("upload id does not belong to key")
        dest = self.path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as out:
            for part in sorted(parts, key=lambda p: p.part_number):
                with (d / f"{part.part_number:05d}.part").open("rb") as f:
                    shutil.copyfileobj(f, out, 1024 * 1024)
        shutil.rmtree(d)

    def abort_multipart(self, key: str, upload_id: str) -> None:
        shutil.rmtree(self._upload_dir(upload_id), ignore_errors=True)

    # -- objects ---------------------------------------------------------
    def presign_get(self, key: str, expires_s: int = 3600) -> str:
        exp = int(time.time()) + expires_s
        q = urlencode({"exp": exp, "sig": self.sign(f"get:{key}", exp)})
        return f"{self.base}/local-storage/media/{quote(key)}?{q}"

    def download(self, key: str, dest: str | Path) -> None:
        shutil.copyfile(self.path(key), dest)

    def upload(self, src: str | Path, key: str, content_type: str) -> None:
        dest = self.path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        shutil.copyfile(src, tmp)
        os.replace(tmp, dest)

    def exists(self, key: str) -> bool:
        return self.path(key).is_file()

    def delete(self, key: str) -> None:
        self.path(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> int:
        d = self.path(_check_prefix(prefix).rstrip("/"))
        if not d.is_dir():
            return 0
        n = sum(1 for p in d.rglob("*") if p.is_file())
        shutil.rmtree(d)
        return n


class S3Storage:
    name = "s3"

    def __init__(self, bucket: str, endpoint_url: str | None, access_key: str, secret_key: str,
                 region: str = "auto"):
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        self.client = boto3.client(
            "s3", endpoint_url=endpoint_url, aws_access_key_id=access_key,
            aws_secret_access_key=secret_key, region_name=region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    def create_multipart(self, key: str, content_type: str) -> str:
        r = self.client.create_multipart_upload(Bucket=self.bucket, Key=_check_key(key), ContentType=content_type)
        return r["UploadId"]

    def presign_part(self, key: str, upload_id: str, part_number: int, expires_s: int = 3600) -> str:
        return self.client.generate_presigned_url(
            "upload_part", ExpiresIn=expires_s,
            Params={"Bucket": self.bucket, "Key": key, "UploadId": upload_id, "PartNumber": part_number},
        )

    def complete_multipart(self, key: str, upload_id: str, parts: list[Part]) -> None:
        self.client.complete_multipart_upload(
            Bucket=self.bucket, Key=key, UploadId=upload_id,
            MultipartUpload={"Parts": [{"PartNumber": p.part_number, "ETag": p.etag}
                                       for p in sorted(parts, key=lambda p: p.part_number)]},
        )

    def abort_multipart(self, key: str, upload_id: str) -> None:
        self.client.abort_multipart_upload(Bucket=self.bucket, Key=key, UploadId=upload_id)

    def presign_get(self, key: str, expires_s: int = 3600) -> str:
        return self.client.generate_presigned_url(
            "get_object", ExpiresIn=expires_s, Params={"Bucket": self.bucket, "Key": key})

    def download(self, key: str, dest: str | Path) -> None:
        self.client.download_file(self.bucket, key, str(dest))

    def upload(self, src: str | Path, key: str, content_type: str) -> None:
        self.client.upload_file(str(src), self.bucket, _check_key(key), ExtraArgs={"ContentType": content_type})

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except self.client.exceptions.ClientError:
            return False

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=_check_key(key))

    def delete_prefix(self, prefix: str) -> int:
        n = 0
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=_check_prefix(prefix)):
            objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if objs:
                self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": objs, "Quiet": True})
                n += len(objs)
        return n


def storage_from_env(env: dict[str, str] | None = None) -> Storage:
    env = dict(os.environ if env is None else env)
    backend = env.get("STORAGE_BACKEND", "local")
    if backend == "local":
        return LocalStorage(
            env.get("LOCAL_STORAGE_DIR", "./data/storage"),
            env.get("PUBLIC_API_URL", "http://localhost:8000"),
            env["MEDIA_SIGNING_SECRET"],
        )
    if backend == "s3":
        return S3Storage(
            bucket=env["S3_BUCKET"], endpoint_url=env.get("S3_ENDPOINT") or None,
            access_key=env["S3_ACCESS_KEY_ID"], secret_key=env["S3_SECRET_ACCESS_KEY"],
            region=env.get("S3_REGION", "auto"),
        )
    raise ValueError(f"unknown STORAGE_BACKEND {backend!r}")
