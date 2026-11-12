# Stryktipsanalys

Hämtar veckans Stryktipskupong, analyserar de 13 matcherna och föreslår ett system
anpassat efter insatsen. Byggs stegvis: **datahämtning** (klar) → modell →
optimerare → UI → utvärdering.

Allt är TypeScript i Next.js (Vercel) med Supabase som cache. Den enda kostnaden
är Claude API för nyhetsläget; övriga källor är gratis.

## Datakällor

| Källa | Fil | Ger | Nyckel |
|---|---|---|---|
| Svenska Spel (inofficiellt JSON-API) | `src/lib/sources/coupon.ts` | Kupong, avspark, liga, streck, odds, tio tidningars tips | Valfri (`SVENSKASPEL_ACCESS_KEY`) |
| football-data.co.uk (CSV) | `src/lib/sources/results.ts` | Resultat, skott, stängningsodds (två säsonger) | Ingen |
| The Odds API | `src/lib/sources/odds.ts` | Marknadsodds från flera bolag | `ODDS_API_KEY` (gratisnivå) |
| Claude + web search | `src/lib/sources/news.ts` | Skador, avstängningar, tränarbyten, motivation, rotation, derby, matchort | `ANTHROPIC_API_KEY` |
| Open-Meteo | `src/lib/sources/weather.ts` | Väder vid avspark | Ingen |

Varje källa ligger bakom ett interface (`CouponSource`, `ResultsSource`, ...) och kan bytas ut.
`src/lib/leagues.ts` kopplar kupongens liganamn till källornas koder, och
`src/lib/teams.ts` matchar lagnamn mellan källorna ("Sheffield W" = "Sheffield Weds").

## Insamling

`collectDraw()` i `src/lib/collect.ts` hämtar kupongen och sedan, per liga och match,
historik, odds, nyheter och väder. Bara kupongen är obligatorisk: fallerar en annan källa
får matchen en flagga (t.ex. "Marknadsodds saknas för matchen") och insamlingen fortsätter.

Allt cachas (`src/lib/cache.ts`) med tidsstämpel; nycklar för omgångsdata börjar med
`draw<nr>:`. Cachetider: kupong 30 min, odds 1 h, väder 3 h, nyheter 6 h, historik 12 h.
Misslyckas en ny hämtning används den senast cachade datan.

## Köra lokalt

```bash
cd stryktips
npm install
cp .env.example .env              # fyll i nycklar
npm run fetch-draw                # sammanfattning per match, utan Claude
npm run fetch-draw -- --news      # med nyhetsläge (kostar ca 5-15 kr per omgång)
npm run fetch-draw -- --json      # all insamlad data
npm run dev                       # http://localhost:3000/api/draw[?news=1&force=1&draw=4876]
npm test
```

Bakom en HTTP-proxy behöver Node `NODE_USE_ENV_PROXY=1` för att `fetch` ska gå via `HTTPS_PROXY`.

För Supabase-cache: kör `supabase/migrations/` och sätt `CACHE_BACKEND=supabase`,
`SUPABASE_URL` och `SUPABASE_SERVICE_ROLE_KEY`.

## Kända begränsningar

- Svenska Spels API är odokumenterat. Tolkningen i `coupon.ts` följer den struktur som öppna
  projekt beskriver och har ännu inte jämförts med ett riktigt svar.
- football-data.co.uk saknar xG och Superettan. Allsvenskan och andra ligor i filerna med alla säsonger saknar skott.
- Väder hämtas bara när nyhetsanalysen har angett matchort.
