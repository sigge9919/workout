"""Thin Supabase client that always acts as the calling user.

The API forwards the user's access token to PostgREST, so Row Level Security
decides what the user may read and write — the API holds no elevated key.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import HTTPException


class SupabaseClient:
    def __init__(self, url: str, anon_key: str, transport: httpx.BaseTransport | None = None):
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self.http = httpx.Client(timeout=20, transport=transport)
        self._user_cache: dict[str, tuple[float, dict]] = {}

    def _headers(self, token: str) -> dict[str, str]:
        return {"apikey": self.anon_key, "Authorization": f"Bearer {token}"}

    def get_user(self, token: str) -> dict:
        hit = self._user_cache.get(token)
        if hit and hit[0] > time.time():
            return hit[1]
        r = self.http.get(f"{self.url}/auth/v1/user", headers=self._headers(token))
        if r.status_code != 200:
            raise HTTPException(401, "Ogiltig eller utgången inloggning.")
        user = r.json()
        self._user_cache[token] = (time.time() + 60, user)
        if len(self._user_cache) > 1000:
            self._user_cache.clear()
        return user

    def get_video(self, token: str, video_id: str) -> dict:
        r = self.http.get(f"{self.url}/rest/v1/videos", headers=self._headers(token),
                          params={"id": f"eq.{video_id}", "select": "*"})
        self._raise(r)
        rows = r.json()
        if not rows:
            raise HTTPException(404, "Videon finns inte eller så saknar du behörighet.")
        return rows[0]

    def update_video(self, token: str, video_id: str, data: dict[str, Any]) -> dict:
        headers = self._headers(token) | {"Prefer": "return=representation"}
        r = self.http.patch(f"{self.url}/rest/v1/videos", headers=headers,
                            params={"id": f"eq.{video_id}"}, json=data)
        self._raise(r)
        rows = r.json()
        if not rows:
            # RLS filtered the update: member without edit rights.
            raise HTTPException(403, "Du har inte behörighet att ändra videon.")
        return rows[0]

    def create_job(self, token: str, video_id: str, kind: str, params: dict | None = None) -> tuple[str, str]:
        r = self.http.post(f"{self.url}/rest/v1/rpc/create_job", headers=self._headers(token),
                           json={"p_video_id": video_id, "p_kind": kind, "p_params": params or {}})
        self._raise(r)
        row = r.json()[0]
        return row["job_id"], row["token"]

    @staticmethod
    def _raise(r: httpx.Response) -> None:
        if r.status_code in (401, 403):
            raise HTTPException(403, "Åtkomst nekad.")
        if r.status_code >= 400:
            raise HTTPException(502, f"Databasfel: {r.text[:300]}")
