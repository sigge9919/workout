# Innebandyanalys

Videoanalys för innebandy. Tränaren laddar upp matchvideo och taggar händelser med kortkommandon. Varje tagg blir automatiskt ett klipp (förinställt 5 s före till 5 s efter). Automatisk analys (OCR, tracking, byten) läggs till fas för fas, se `docs/`.

```
web/       Next.js 15 + TypeScript + Tailwind (svenskt UI). Pratar direkt med Supabase (RLS).
api/       FastAPI: uppladdning (multipart), jobb och signerade uppspelningslänkar.
worker/    Jobbkod (ffmpeg-transkodning nu, analyspipeline senare) + Modal-wrapper.
supabase/  Migrationer och schematester (RLS, triggers för kontext och klipp).
scripts/   Lokal utvecklingsmiljö (mini-Supabase utan Docker, API-start).
docs/      Fasrapporter och skärmdumpar.
```

## Arkitektur i korthet

- **Postgres är sanningen.** Taggar (`events`), klipp (`clips`) och kontext (byten, spelsituation och klocka som *ändringspunkter*) lagras normaliserat. Triggers fyller i period, matchtid, spelsituation och vilka som var på plan för varje tagg. De härleder om allt när tränaren ändrar ett byte eller en klocksynk i efterhand.
- **Klipp är tidsintervall** på originalvideon. Inga filer skapas vid taggning. Klippet följer taggen tills tränaren justerar det för hand.
- **Proxyvideo:** uppladdningen transkodas till H.264 med en keyframe per sekund och `+faststart`. Det ger snabb spolning i webbläsaren, och exporter med stream copy hamnar inom 1 s från önskad in- och utpunkt.
- **Jobb** rapporterar status via RPC:n `job_report` med en engångstoken per jobb. Workers behöver därför ingen service role-nyckel.
- **RLS** isolerar data per lag. Rollen `player` har bara läsrätt.

## Köra lokalt

Krav: Python 3.11+, Node 20+, ffmpeg och en lokal Postgres 15+ (lösenord `postgres` för användaren `postgres`, eller sätt `PGADMIN_URL`).

```bash
cd innebandy
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
(cd web && npm install)

# 1. Mini-Supabase (Postgres + GoTrue + PostgREST + gateway på :54321)
scripts/local_supabase.sh start          # skriver ut URL och anon-nyckel

# 2. API (lokal lagring i data/storage)
cat > data/api.env <<EOF
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=$(scripts/local_supabase.sh anon-key)
STORAGE_BACKEND=local
LOCAL_STORAGE_DIR=$PWD/data/storage
MEDIA_SIGNING_SECRET=byt-mig
EOF
scripts/dev_api.sh

# 3. Webb
cat > web/.env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(scripts/local_supabase.sh anon-key)
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF
(cd web && npm run dev)                  # http://localhost:3000
```

## Tester

```bash
.venv/bin/python -m pytest              # schema/RLS, transkodning, API-flöde
(cd web && npm test)                    # klipp, kortkommandon, kontextlogik
(cd web && npm run e2e)                 # hela fas 1-flödet i webbläsare (kräver stacken ovan)
```

## Produktion

| Del | Rekommendation |
|---|---|
| Databas/auth | Supabase-projektet *Innebandy Analys* (`dmfeafseyecocyaxsdtv`, eu-north-1). |
| Videolagring | `STORAGE_BACKEND=s3` mot **Cloudflare R2** (ingen egress-kostnad) eller Supabase Storage via S3-protokollet. Supabases gratisnivå tillåter bara filer upp till 50 MB, så matchvideo kräver R2 eller Supabase Pro. |
| Transkodning | `WORKER_MODE=modal`, deploy med `modal deploy worker/modal_app.py`. |
| API | Valfri Python-värd (Fly.io, Render, Railway). Sätt `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CORS_ORIGINS`, `PUBLIC_API_URL` och S3-variablerna. |
| Webb | Vercel eller annan Node-värd med de tre `NEXT_PUBLIC_*`-variablerna. |

## Kortkommandon i taggningen

| Tangent | Funktion |
|---|---|
| Mellanslag | Spela/pausa |
| ← / → | −2 s / +2 s |
| Skift + ← / → | −5 s / +5 s |
| `,` / `.` | En bildruta bakåt/framåt |
| `[` / `]` | Långsammare/snabbare (0,25×–4×) |
| Bokstäver | Taggtyper (konfigurerbart, t.ex. S = skott, T = bolltapp) |
| 1–9 | Femma in på plan (konfigureras per match), 0 = ingen femma |
| Skift + 1–6 | Spelsituation: 5 mot 5, PP, BP, 4 mot 4, tom kasse vi/de |
| Ctrl/Cmd + Z | Ångra senaste taggen |
| Esc | Stäng detaljpanelen |
