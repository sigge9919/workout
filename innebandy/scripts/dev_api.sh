#!/usr/bin/env bash
# Run the API locally. Reads env from data/api.env (see README).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; [ -f "$ROOT/data/api.env" ] && . "$ROOT/data/api.env"; set +a
export PYTHONPATH="$ROOT/api:$ROOT/worker"
exec "$ROOT/.venv/bin/uvicorn" app.main:app --port "${API_PORT:-8000}" "$@"
