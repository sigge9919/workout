from pathlib import Path

import pytest

from innebandy_worker.jobs import run_storage_cleanup
from innebandy_worker.storage import LocalStorage

TEAM = "11111111-1111-1111-1111-111111111111"


class FakeClient:
    def __init__(self, rows):
        self.rows = rows
        self.done = None

    def rpc(self, name, **params):
        if name == "job_storage_cleanup":
            return self.rows
        if name == "job_storage_cleanup_done":
            self.done = params
        return None


def put(storage: LocalStorage, key: str):
    p = storage.path(key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"x")


def test_cleanup_deletes_originals_and_garbage(tmp_path):
    s = LocalStorage(tmp_path, "http://x", "secret")
    keep = f"teams/{TEAM}/videos/v1/proxy.mp4"
    old = f"teams/{TEAM}/videos/v1/original.mp4"
    gone = f"teams/{TEAM}/videos/v2/"
    for k in (keep, old, gone + "proxy.mp4", gone + "original.mov"):
        put(s, k)

    client = FakeClient([
        {"kind": "original", "video_id": "v1", "key": old},
        {"kind": "prefix", "video_id": None, "key": gone},
    ])
    assert run_storage_cleanup(s, client) == {"originals": 1, "prefixes": 1}
    assert s.exists(keep) and not s.exists(old)
    assert not (tmp_path / gone).exists()
    assert client.done == {"p_video_ids": ["v1"], "p_prefixes": [gone]}


def test_cleanup_never_fails_the_job(tmp_path):
    class Broken:
        def rpc(self, name, **params):
            raise RuntimeError("network down")

    s = LocalStorage(tmp_path, "http://x", "secret")
    assert run_storage_cleanup(s, Broken()) == {"originals": 0, "prefixes": 0}


@pytest.mark.parametrize("prefix", ["", "teams/", f"teams/{TEAM}/", f"teams/{TEAM}/videos/", "teams/x/videos/v"])
def test_refuses_dangerous_prefixes(tmp_path, prefix):
    s = LocalStorage(tmp_path, "http://x", "secret")
    with pytest.raises(ValueError):
        s.delete_prefix(prefix)
