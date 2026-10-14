"""S3Storage against a local S3 emulator (moto server): the same calls the
browser and worker make against Cloudflare R2, without real credentials."""

import socket

import boto3
import httpx
import pytest

moto_server = pytest.importorskip("moto.server")

from innebandy_worker.storage import Part, S3Storage  # noqa: E402

BUCKET = "innebandy-test"
TEAM = "11111111-1111-1111-1111-111111111111"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def storage():
    port = free_port()
    server = moto_server.ThreadedMotoServer(ip_address="127.0.0.1", port=port, verbose=False)
    server.start()
    endpoint = f"http://127.0.0.1:{port}"
    boto3.client("s3", endpoint_url=endpoint, aws_access_key_id="k", aws_secret_access_key="s",
                 region_name="us-east-1").create_bucket(Bucket=BUCKET)
    yield S3Storage(BUCKET, endpoint, "k", "s", region="us-east-1")
    server.stop()


def test_presigned_multipart_upload_and_range_get(storage, tmp_path):
    key = f"teams/{TEAM}/videos/v1/original.mp4"
    part_size = 5 * 1024 * 1024  # S3 minimum for all but the last part
    data = bytes(range(256)) * (part_size * 2 // 256) + b"tail"
    upload_id = storage.create_multipart(key, "video/mp4")

    parts = []
    with httpx.Client(trust_env=False) as http:
        for n, start in enumerate(range(0, len(data), part_size), 1):
            url = storage.presign_part(key, upload_id, n)
            r = http.put(url, content=data[start:start + part_size])
            assert r.status_code == 200
            assert r.headers.get("etag"), "R2 bucket CORS must expose ETag"
            parts.append(Part(n, r.headers["etag"]))
        storage.complete_multipart(key, upload_id, parts)

        url = storage.presign_get(key)
        r = http.get(url, headers={"Range": "bytes=10-19"})
        assert r.status_code == 206 and r.content == data[10:20]

    dest = tmp_path / "dl.mp4"
    storage.download(key, dest)
    assert dest.read_bytes() == data


def test_upload_delete_and_delete_prefix(storage, tmp_path):
    src = tmp_path / "f.bin"
    src.write_bytes(b"hello")
    base = f"teams/{TEAM}/videos/v2/"
    for name in ("proxy.mp4", "poster.jpg", "original.mov"):
        storage.upload(src, base + name, "application/octet-stream")
    assert storage.exists(base + "proxy.mp4")

    storage.delete(base + "original.mov")
    assert not storage.exists(base + "original.mov")
    assert storage.delete_prefix(base) == 2
    assert not storage.exists(base + "proxy.mp4")


def test_abort_multipart(storage):
    key = f"teams/{TEAM}/videos/v3/original.mp4"
    upload_id = storage.create_multipart(key, "video/mp4")
    storage.abort_multipart(key, upload_id)
    assert not storage.exists(key)


ACCOUNT = "https://" + "a" * 32


@pytest.mark.parametrize("configured, accessible, expected", [
    (ACCOUNT + ".r2.cloudflarestorage.com", {ACCOUNT + ".r2.cloudflarestorage.com"}, ACCOUNT + ".r2.cloudflarestorage.com"),
    (ACCOUNT + ".r2.cloudflarestorage.com", {ACCOUNT + ".eu.r2.cloudflarestorage.com"}, ACCOUNT + ".eu.r2.cloudflarestorage.com"),
    (ACCOUNT + ".r2.cloudflarestorage.com", set(), ACCOUNT + ".r2.cloudflarestorage.com"),
    (ACCOUNT + ".eu.r2.cloudflarestorage.com", set(), ACCOUNT + ".eu.r2.cloudflarestorage.com"),
    ("http://127.0.0.1:9000", set(), "http://127.0.0.1:9000"),
    (None, set(), None),
])
def test_resolve_r2_endpoint_falls_back_to_eu_jurisdiction(configured, accessible, expected):
    from innebandy_worker.storage import resolve_r2_endpoint
    assert resolve_r2_endpoint(configured, lambda e: e in accessible) == expected
