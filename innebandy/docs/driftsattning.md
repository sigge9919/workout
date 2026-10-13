# Driftsättning

Så här kommer appen ut på en riktig adress. Räkna med ungefär 45 minuter första gången. Lägg aldrig in nycklar i chatten, bara i respektive tjänsts inställningar.

```
Webbläsare ──► Vercel (webb) ──► Supabase (databas, inloggning)
     │                │
     │                └──► Render (API) ──► Modal (transkodning)
     │                                          │
     └──── video direkt upp/ned ──► Cloudflare R2 ◄┘
```

| Tjänst | Används till | Kostnad |
|---|---|---|
| Vercel (Hobby) | Webbappen | Gratis |
| Render (Free) | API:t. Somnar efter 15 min, och första anropet efter det tar ~1 min. | Gratis |
| Modal | Transkodning, 4 CPU, ~10–15 min per match | ~1–2 kr/match, ryms i gratiskrediten |
| Cloudflare R2 | Video | Gratis upp till 10 GB, därefter $0,015/GB/mån |
| Supabase | Databas och inloggning | Gratis |

Värden som återkommer nedan:

| Namn | Var du hittar det |
|---|---|
| `ACCOUNT_ID` | Cloudflare → R2 → höger kolumn "Account ID" |
| `BUCKET` | Namnet på bucketen du skapat |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `SUPABASE_URL` | `https://dmfeafseyecocyaxsdtv.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_M6CInPfXyBzfKsfeF9_kzA_1oEI0F6v` (publik nyckel, inte hemlig) |

## 1. Cloudflare R2

**API-token**
1. Gå till R2 → *Manage R2 API Tokens* → *Create API token*.
2. Välj behörigheten **Object Read & Write** och begränsa den till din bucket.
3. Spara *Access Key ID* (`S3_ACCESS_KEY_ID`) och *Secret Access Key* (`S3_SECRET_ACCESS_KEY`). Secret visas bara en gång.

**CORS**
Gå till bucketen → *Settings* → *CORS Policy* → *Edit* och klistra in följande. Byt `din-app.vercel.app` mot Vercel-adressen när du har den (steg 4). Det går bra att lägga in policyn nu och uppdatera den senare.
```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://din-app.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
`ExposeHeaders: ETag` är nödvändigt. Utan det kan webbläsaren inte slutföra uppladdningen.

**Livscykelregel (rekommenderas)**
Gå till bucketen → *Settings* → *Object lifecycle rules* → *Add rule*. Välj "Abort incomplete multipart uploads" efter 1 dag. Då städas avbrutna uppladdningar bort automatiskt.

## 2. Modal (transkodning)

1. Skapa ett konto på modal.com. Gå till *Settings* → *API Tokens* → *New token* och spara `MODAL_TOKEN_ID` och `MODAL_TOKEN_SECRET`.
2. Gå till *Secrets* → *Create new secret* → *Custom* och döp den till **`innebandy-worker`**. Lägg in:
   ```
   STORAGE_BACKEND=s3
   S3_BUCKET=<BUCKET>
   S3_ENDPOINT=<S3_ENDPOINT>
   S3_ACCESS_KEY_ID=<...>
   S3_SECRET_ACCESS_KEY=<...>
   S3_REGION=auto
   SUPABASE_URL=https://dmfeafseyecocyaxsdtv.supabase.co
   SUPABASE_ANON_KEY=sb_publishable_M6CInPfXyBzfKsfeF9_kzA_1oEI0F6v
   ```
3. Driftsätt workern. Antingen gör du det själv:
   ```bash
   pip install modal && modal token set --token-id <ID> --token-secret <SECRET>
   cd innebandy/worker && modal deploy modal_app.py
   ```
   Eller så lägger du `MODAL_TOKEN_ID` och `MODAL_TOKEN_SECRET` i min molnmiljö (steg 6), så gör jag det.

## 3. Render (API)

1. Skapa ett konto på render.com och koppla GitHub.
2. Välj *New* → *Blueprint* → repot `sigge9919/workout`, branch `claude/admiring-cori-s6mmzm` eller `main` efter merge. Render läser `render.yaml`.
3. Fyll i de värden som efterfrågas:
   - `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   - `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`
   - `CORS_ORIGINS`: Vercel-adressen, t.ex. `https://din-app.vercel.app`. Fyll i den efter steg 4.
   - `PUBLIC_API_URL`: Render-adressen, t.ex. `https://innebandy-api.onrender.com`.
4. Kontrollera att `https://innebandy-api.onrender.com/health` svarar `{"ok":true}`.

## 4. Vercel (webb)

1. Gå till *Add New* → *Project* → importera `sigge9919/workout`.
2. Sätt **Root Directory** till `innebandy/web`. Framework identifieras som Next.js.
3. Lägg in miljövariablerna:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://dmfeafseyecocyaxsdtv.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_M6CInPfXyBzfKsfeF9_kzA_1oEI0F6v
   NEXT_PUBLIC_API_URL=https://innebandy-api.onrender.com
   ```
4. Klicka *Deploy* och notera adressen. Lägg sedan in den på två ställen:
   - i R2:s CORS-policy (steg 1)
   - i Renders `CORS_ORIGINS` (steg 3)

## 5. Supabase-inloggning

Gå till Supabase → projektet *Innebandy Analys* → *Authentication* → *URL Configuration*:
- **Site URL:** Vercel-adressen.
- **Redirect URLs:** lägg till Vercel-adressen.

Nya konton måste bekräfta sin e-post. Supabases inbyggda e-post klarar bara några få mejl per timme, vilket räcker för en tränarstab. Ska fler bjudas in koppla en egen SMTP under *Authentication* → *Emails*.

## 6. Låt mig verifiera

Lägg in variablerna i molnmiljön för den här Claude-sessionen: titelraden → molnmiljöns meny → *Edit* → miljövariabler.
- `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- valfritt `MODAL_TOKEN_ID` och `MODAL_TOKEN_SECRET`, om jag ska driftsätta workern

De gäller från nästa session. Där kör jag:
```bash
PYTHONPATH=worker python scripts/check_storage.py --origin https://din-app.vercel.app
```
Skriptet kontrollerar uppladdning, CORS/ETag, Range-läsning och radering och förklarar eventuella fel på svenska.

## 7. Första testet

1. Logga in på Vercel-adressen, skapa laget, lägg in truppen och skapa en match.
2. Ladda upp en kort fil först, ett par minuter. Den ska bli "Klar" inom någon minut.
3. Ladda sedan upp en hel match.
4. Under *Taggar & inställningar* → *Originalfiler* styr du hur många matcher som behåller originalfilen (standard: 5).
