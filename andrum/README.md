# Andrum

Personlig andningsapp för idrottare: guidade sessioner med animerad andningscirkel och genererat ljud, BOLT-test, vilopuls/HRV, statistik och veckoprogram. Installeras på iPhone från Safari ("Lägg till på hemskärmen") och fungerar helt offline.

- Ingen backend, inga konton, ingen spårning. All data ligger i telefonens IndexedDB.
- Backup: Inställningar → Exportera backup (JSON).
- Inte medicinsk rådgivning. Gör aldrig andetagshållningar i vatten eller under bilkörning.

## Kör lokalt

Kräver Node 20 eller senare.

```bash
cd andrum
```

```bash
npm install
```

```bash
npm run dev
```

Öppna adressen som skrivs ut (normalt http://localhost:5173).

Övriga kommandon:

```bash
npm test
```

```bash
npm run build
```

```bash
npm run preview
```

`npm test` kör alla tester (tajming i sessionsmotorn, tekniker, lagring, statistik, program). `npm run build` bygger till `dist/` med service worker och manifest; `npm run preview` serverar bygget lokalt så att offline-läget kan provas.

> iPhone kräver **HTTPS** för service worker och installation. Att öppna dev-servern från telefonen via datorns IP-adress fungerar för att titta, men inte för offline/installation – använd en av hostingvarianterna nedan.

## Gratis hosting

### Alternativ A: Netlify (enklast, fungerar även med privat repo)

**Snabbast – dra och släpp, inget konto-krångel med Git:**

1. Bygg lokalt:

   ```bash
   cd andrum && npm install && npm run build
   ```

2. Gå till https://app.netlify.com/drop och dra in mappen `andrum/dist`.
3. Du får en adress som `https://något-namn.netlify.app`. Byt gärna namn under *Site configuration → Change site name*.
4. För en ny version: bygg igen och dra in `dist` på samma site (*Deploys → drag and drop*).

**Automatiskt från GitHub:**

1. Logga in på https://app.netlify.com → *Add new site → Import an existing project* → välj GitHub och repot.
2. **Base directory:** `andrum` (resten läses från `andrum/netlify.toml`: build-kommando `npm run build`, publish `dist`).
3. **Branch to deploy:** den gren du vill publicera.
4. Deploy. Varje push till grenen bygger och publicerar en ny version.

### Alternativ B: GitHub Pages

Kräver att repot är **publikt**, eller ett betalt GitHub-konto för privata repon. Med privat repo på gratiskonto: använd Netlify.

1. På GitHub: *Settings → Pages → Build and deployment → Source:* välj **GitHub Actions**.
2. Arbetsflödet `.github/workflows/andrum-pages.yml` bygger, kör testerna och publicerar `andrum/` automatiskt vid varje push till **standardgrenen** som ändrar något i `andrum/`.
3. Vill du publicera från en annan gren: *Actions → Andrum – GitHub Pages → Run workflow* och välj grenen. GitHub tillåter som standard bara standardgrenen i miljön `github-pages`; lägg i så fall till grenen under *Settings → Environments → github-pages → Deployment branches*.
4. Appen hamnar på `https://<ditt-användarnamn>.github.io/<reponamn>/`.

Bygget anpassar sökvägen själv (`BASE_PATH=/<reponamn>/`). Navigering sker med `#/` i adressen, så ingen extra serverkonfiguration behövs.

## Installera på iPhone

1. Öppna den publicerade adressen i **Safari** (inte i en app-inbyggd webbläsare).
2. Tryck på **Dela** → **Lägg till på hemskärmen** → **Lägg till**.
3. Starta Andrum från ikonen på hemskärmen. Första gången laddas allt ned; banderollen "Appen fungerar nu offline" bekräftar det.
4. Prova: flygplansläge → öppna appen → starta en session.

**Uppdateringar:** när en ny version publicerats och du öppnar appen visas "Ny version av Andrum finns". Tryck *Uppdatera* (visas aldrig under en pågående session).

**Bra att veta på iPhone**

- **Ljud:** signaler och bakgrund spelas även med ljudlösknappen på (iOS 17+). Ljudet startar när du trycker *Starta*.
- **Skärmen hålls tänd** under sessioner och BOLT-test (iOS 16.4+ i installerad app). Lås inte skärmen manuellt – då pausar iOS ljudet; tiden fortsätter ändå räknas rätt.
- **Vibration** stöds inte av Safari på iPhone. Inställningen visas bara där det fungerar (t.ex. Android).
- **Data:** appen ber om beständig lagring. Ta ändå backup ibland (*Inställningar → Exportera backup* → spara i Filer/iCloud Drive). Raderar du appen från hemskärmen raderas datan.

## Lägg till egna tekniker

**Utan kod:** *Inställningar → Egna tekniker* – klistra in JSON eller välj en fil. Exempel:

```json
{
  "id": "min-teknik",
  "name": "Min teknik",
  "purpose": "Kort syfte",
  "description": "Vad den gör och när den passar.",
  "tags": ["focus"],
  "cycle": [
    { "kind": "inhale", "seconds": 4 },
    { "kind": "holdIn", "seconds": 2 },
    { "kind": "exhale", "seconds": 6 }
  ],
  "length": { "mode": "duration", "seconds": 300 },
  "adjustable": { "duration": { "minMinutes": 2, "maxMinutes": 20 } }
}
```

- Faser (`kind`): `inhale`, `inhale2` (extra påfyllning), `holdIn`, `exhale`, `holdOut`. Egen text per fas med `"label"`.
- Längd: `{"mode":"duration","seconds":300}` eller `{"mode":"cycles","count":6}`.
- Rundor med hållning: `"rounds": {"count":4, "cyclesPerRound":5, "hold":{"after":"exhale","seconds":15,"incrementSeconds":5}, "restSeconds":30}`.
- Justerbart i appen: `breathsPerMinute`, `duration`, `cycles`, `rounds`, `holdSeconds` under `"adjustable"`.
- Situationer (`tags`): `prematch`, `break`, `post`, `sleep`, `focus`.
- Tekniker med hållningar får automatiskt säkerhetstexten.

**I koden:** lägg ett objekt i `src/techniques/builtin.ts` (typen `Technique` i `src/engine/types.ts`). Testerna kontrollerar att alla inbyggda tekniker är giltiga.

## Lägg till egna program

Program finns i `src/programs/builtin.ts` (typ i `src/programs/types.ts`). Varje vecka har exakt 7 dagar; en dag är `null` (vila) eller:

```ts
{ title: 'CO2-tolerans', techniqueId: 'co2', settings: { rounds: 5, hold: 15 }, note: 'Valfri text', bolt: true }
```

`settings` använder samma fält som teknikens justeringar: `bpm`, `minutes`, `cycles`, `rounds`, `hold`. `repeat: true` upprepar programmet; `anchor` räknar startdatum bakåt från en händelse (som matchdagen). Testerna kontrollerar att alla förval ligger inom teknikens gränser.

## Projektstruktur

```
andrum/
├─ src/
│  ├─ engine/       sessionsmotor: tidslinje, motor, easing (+ tester för tajming)
│  ├─ audio/        Web Audio: signaler, brus/drone, schemaläggning på ljudklockan
│  ├─ techniques/   inbyggda tekniker, situationer, inställningar, JSON-inläsning
│  ├─ programs/     veckoprogram och "Idag"-logik
│  ├─ db/           IndexedDB (Dexie), backup export/import
│  ├─ lib/          statistik, wake lock, vibration, format, inställningar
│  ├─ components/   andningscirkel, diagram, knappar, reglage
│  └─ pages/        Idag, Tekniker, Session, Mätning, BOLT, Statistik, Program, Inställningar
├─ public/icons/    appikoner (icon.svg är källan)
├─ netlify.toml
└─ vite.config.ts   Vite + Tailwind + PWA (manifest, service worker)
```

**Tajmingen:** en teknik kompileras till en tidslinje med exakta fasgränser i hela millisekunder (ingen ackumulerad avrundning). Motorn räknar ut allt – fas, nedräkning, cirkelns storlek – från förfluten tid, inte från timers, så inget glider isär. Ljudsignalerna schemaläggs i förväg på `AudioContext`-klockan för att träffa fasbytet exakt.
