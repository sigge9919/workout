"""Check that object storage (Cloudflare R2 or any S3) is set up the way the
app needs it: presigned multipart uploads from the browser (CORS + ETag),
range requests for playback, and deletes for retention.

Usage:
  S3_BUCKET=... S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
  S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  PYTHONPATH=worker python scripts/check_storage.py [--origin https://din-app.vercel.app]

Writes and deletes one small test object under teams/_check/.
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid

import httpx

from innebandy_worker.storage import Part, S3Storage

OK, FAIL = "OK  ", "FEL "


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--origin", action="append", default=None,
                    help="webbapp-origin som ska ha CORS-åtkomst (kan anges flera gånger)")
    args = ap.parse_args()
    origins = args.origin or ["http://localhost:3000"]

    missing = [k for k in ("S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY") if not os.environ.get(k)]
    if missing:
        print(f"{FAIL}Saknade miljövariabler: {', '.join(missing)}")
        return 2

    s = S3Storage(os.environ["S3_BUCKET"], os.environ["S3_ENDPOINT"], os.environ["S3_ACCESS_KEY_ID"],
                  os.environ["S3_SECRET_ACCESS_KEY"], region=os.environ.get("S3_REGION", "auto"))
    prefix = f"teams/_check/videos/{uuid.uuid4()}/"
    key = prefix + "original.mp4"
    data = os.urandom(6 * 1024 * 1024)  # two parts: 5 MiB + 1 MiB
    errors = 0

    def check(cond: bool, ok: str, fail: str) -> bool:
        nonlocal errors
        print(f"{OK if cond else FAIL}{ok if cond else fail}")
        errors += 0 if cond else 1
        return cond

    try:
        upload_id = s.create_multipart(key, "video/mp4")
        print(f"{OK}Multipart-uppladdning skapad (nyckeln har rätt behörighet att skriva)")
    except Exception as e:
        print(f"{FAIL}Kunde inte skapa uppladdning: {e}\n     Kontrollera endpoint, bucketnamn och att token har 'Object Read & Write'.")
        return 1

    with httpx.Client(trust_env=True, timeout=60) as http:
        parts = []
        for n, chunk in enumerate((data[: 5 * 1024 * 1024], data[5 * 1024 * 1024:]), 1):
            url = s.presign_part(key, upload_id, n)
            for origin in origins:
                pre = http.options(url, headers={"Origin": origin, "Access-Control-Request-Method": "PUT",
                                                 "Access-Control-Request-Headers": "content-type"})
                allowed = pre.headers.get("access-control-allow-origin") in (origin, "*")
                if n == 1:
                    check(allowed, f"CORS tillåter uppladdning från {origin}",
                          f"CORS tillåter inte PUT från {origin}. Lägg till origin i bucketens CORS-policy.")
            r = http.put(url, content=chunk, headers={"Origin": origins[0]})
            if not check(r.status_code == 200, f"Del {n} uppladdad", f"Del {n} misslyckades: {r.status_code} {r.text[:200]}"):
                break
            if n == 1:
                exposed = r.headers.get("access-control-expose-headers", "").lower()
                check("etag" in exposed, "CORS exponerar ETag (krävs för multipart i webbläsaren)",
                      "CORS exponerar inte ETag. Lägg till \"ExposeHeaders\": [\"ETag\"] i CORS-policyn.")
            parts.append(Part(n, r.headers["etag"]))
        else:
            s.complete_multipart(key, upload_id, parts)
            print(f"{OK}Uppladdningen slutförd")
            url = s.presign_get(key)
            r = http.get(url, headers={"Range": "bytes=100-199", "Origin": origins[0]})
            check(r.status_code == 206 and r.content == data[100:200], "Range-läsning fungerar (snabb spolning)",
                  f"Range-läsning gav {r.status_code}")
            check(r.headers.get("access-control-allow-origin") in (origins[0], "*"),
                  "CORS tillåter uppspelning", "CORS tillåter inte GET från webbappen")

    try:
        s.abort_multipart(key, upload_id)
    except Exception:
        pass
    try:
        n = s.delete_prefix(prefix)
        check(not s.exists(key), f"Radering fungerar ({n} objekt)", "Testobjektet kunde inte raderas")
    except Exception as e:
        check(False, "", f"Radering misslyckades: {e}. Token behöver även raderingsrätt (Object Read & Write).")

    print("\nAllt klart, lagringen fungerar för appen." if errors == 0 else f"\n{errors} problem hittades.")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
