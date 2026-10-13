#!/usr/bin/env bash
# Minimal local Supabase for development and end-to-end tests without Docker:
# Postgres (must be running) + GoTrue (auth) + PostgREST behind a tiny gateway
# that exposes the same URL layout as Supabase (/auth/v1, /rest/v1).
#
# Usage: scripts/local_supabase.sh start|stop|reset
# Env:   PGADMIN_URL (default postgresql://postgres:postgres@localhost/postgres)
#
# Prints NEXT_PUBLIC_SUPABASE_URL / ANON_KEY for the web app and API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/data/local-supabase"
BIN="$DATA/bin"
DB=innebandy_local
PGADMIN_URL="${PGADMIN_URL:-postgresql://postgres:postgres@localhost/postgres}"
PGBASE="${PGADMIN_URL%/*}"
JWT_SECRET="local-dev-jwt-secret-at-least-32-characters-long"
AUTH_PW=auth_local_pw
AUTHN_PW=authenticator_local_pw
POSTGREST_VERSION=v12.2.3
GOTRUE_VERSION=v2.177.0
mkdir -p "$BIN" "$DATA/logs"

jwt() { # role -> HS256 JWT valid for 10 years
  python3 - "$1" "$JWT_SECRET" <<'EOF'
import base64, hashlib, hmac, json, sys, time
b = lambda d: base64.urlsafe_b64encode(d).rstrip(b"=").decode()
h = b(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
p = b(json.dumps({"role": sys.argv[1], "iss": "supabase", "iat": int(time.time()), "exp": int(time.time()) + 10 * 365 * 86400}).encode())
s = b(hmac.new(sys.argv[2].encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
print(f"{h}.{p}.{s}")
EOF
}

fetch_bins() {
  [ -x "$BIN/postgrest" ] || {
    curl -sSfL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" | tar xJ -C "$BIN"
  }
  [ -x "$BIN/auth" ] || {
    curl -sSfL "https://github.com/supabase/auth/releases/download/$GOTRUE_VERSION/auth-$GOTRUE_VERSION-x86.tar.gz" | tar xz -C "$BIN"
  }
}

reset_db() {
  psql "$PGADMIN_URL" -q -v ON_ERROR_STOP=1 <<SQL
drop database if exists $DB with (force);
create database $DB;
SQL
  psql "$PGBASE/$DB" -q -v ON_ERROR_STOP=1 <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login createrole password '$AUTH_PW';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password '$AUTHN_PW';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
create schema auth authorization supabase_auth_admin;
grant create on database $DB to supabase_auth_admin;
SQL
  GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:$AUTH_PW@localhost/$DB?search_path=auth" \
    GOTRUE_DB_MIGRATIONS_PATH="$BIN/migrations" API_EXTERNAL_URL=http://localhost:54321/auth/v1 \
    GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_SITE_URL=http://localhost:3000 \
    "$BIN/auth" migrate >"$DATA/logs/auth-migrate.log" 2>&1
  psql "$PGBASE/$DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/local_bootstrap.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do psql "$PGBASE/$DB" -q -v ON_ERROR_STOP=1 -f "$f"; done
  psql "$PGBASE/$DB" -q -c "notify pgrst, 'reload schema'"
}

start() {
  fetch_bins
  reset_db
  cat >"$DATA/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:$AUTHN_PW@localhost/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-port = 54322
EOF
  nohup "$BIN/postgrest" "$DATA/postgrest.conf" >"$DATA/logs/postgrest.log" 2>&1 & echo $! >"$DATA/postgrest.pid"
  GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:$AUTH_PW@localhost/$DB?search_path=auth" \
    GOTRUE_API_HOST=127.0.0.1 PORT=54323 API_EXTERNAL_URL=http://localhost:54321/auth/v1 \
    GOTRUE_SITE_URL=http://localhost:3000 GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 \
    GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
    GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_DISABLE_SIGNUP=false \
    GOTRUE_DB_MIGRATIONS_PATH="$BIN/migrations" \
    nohup "$BIN/auth" serve >"$DATA/logs/auth.log" 2>&1 & echo $! >"$DATA/auth.pid"
  nohup node "$ROOT/scripts/local_gateway.mjs" >"$DATA/logs/gateway.log" 2>&1 & echo $! >"$DATA/gateway.pid"
  sleep 2
  echo "NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$(jwt anon)"
}

stop() {
  for p in postgrest auth gateway; do
    [ -f "$DATA/$p.pid" ] && kill "$(cat "$DATA/$p.pid")" 2>/dev/null || true
    rm -f "$DATA/$p.pid"
  done
}

case "${1:-start}" in
  start) stop; start ;;
  stop) stop ;;
  reset) reset_db ;;
  anon-key) jwt anon ;;
  *) echo "usage: $0 start|stop|reset|anon-key" >&2; exit 1 ;;
esac
