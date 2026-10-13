# Fas 1: rapport

**Innehåll:** grunddata (lag, spelare, motståndare, matcher, femmor), uppladdning, transkodning, videospelare och taggning med automatiska klipp. Allt fungerar utan automatisk analys.

## Vad som är byggt

| Område | Status |
|---|---|
| Konto, lag och roller | Konto med e-post och lösenord. Att skapa ett lag seedar de tio standardtaggarna. Rollerna är owner, coach, analyst och player (endast läsrätt). |
| Trupp och motståndare | CRUD för spelare (nummer, position, aktiv). Motståndare kan valfritt ha egna spelare. |
| Matcher och femmor | Matcher med motståndare, datum, hemma/borta och tävling. Femmor per match med siffertangent, plus "Kopiera från senaste match". |
| Uppladdning | Multipart direkt till lagring med 64 MB-delar, tre parallella och tre omförsök per del, plus förloppsindikator. Fungerar för filer på flera GB. |
| Transkodning | ffmpeg ger en H.264-proxy (max 1080p, keyframe varje sekund, faststart) och en affischbild. Jobbstatus och förlopp visas i UI:t. |
| Videospelare | Alla kortkommandon från uppdraget (se README) och en tidslinje med taggar och femmabyten. Klicka för att spola. |
| Taggning | Ett tryck ger en tagg på aktuell tidpunkt och ett klipp. Detaljpanelen sparar direkt medan videon fortsätter. |
| Auto-ifyllning | Period, matchtid, spelsituation och vilka som var på plan (femma och målvakt) fylls i av databasen och räknas om när ett byte eller en klocksynk ändras i efterhand. |
| Spelarval | Ett klick bland spelarna på plan. "Visa alla" ger hela truppen. |
| Planskiss | 40×20 m. Klicka för position, och zonen räknas fram automatiskt (vi anfaller åt höger). |
| Klipp | Förinställningen gäller globalt och per taggtyp (skott 10 s före, kontring 8 s, tekning 3 s/8 s). Klipp kan justeras ±1 s, "start/slut = nu" och spelas upp. Klippen hålls inom videon, och "Uppdatera befintliga klipp" respekterar manuella justeringar. |
| Egna taggtyper | Namn, tangent, färg, klipplängd, för/emot, planskiss, spelarroll och egna detaljfält (val eller fritext) samt fri etikett. |

## Tester

| Svit | Antal | Täcker |
|---|---|---|
| `supabase/tests` (pytest mot Postgres) | 10 | RLS-isolering mellan lag, läsrätt för spelarrollen, skydd mot korsreferenser, klippförinställning och kantfall, klipp som följer taggen, om-applicering av förinställningar, auto-ifyllning av klocka, spelsituation och på plan (även vid byte i efterhand), jobbtoken |
| `worker/tests` | 3 | Proxyegenskaper (1 s GOP, faststart, nedskalning, utan ljud) och felhantering |
| `api/tests` | 7 | Uppladdning, transkodning och uppspelning med Range, att filen överlever multipart, behörigheter, signerade länkar och misslyckad transkodning |
| `web/tests` (vitest) | 22 | Klippfönster, kantklippning, sammanslagning av överlapp, kortkommandon, tidsformat och klientens kontextlogik |
| `web/e2e` (Playwright) | 1 | Hela flödet från konto till taggning med kortkommandon, detaljer, klipp, PP, ångra och omladdning |

Skärmdumpar från E2E-körningen finns i `docs/screenshots/fas1/`.

## Mätt

- **Transkodning:** 1080p25 ger 96 bildrutor/s på 4 vCPU (3,8× realtid) med syntetiskt testmaterial. En match på 90 minuter tar alltså ungefär 25 minuter. Riktig matchvideo är tyngre att koda, så räkna med 30–45 minuter. På Modal (4 CPU) blir det ungefär 1–2 kr per match.
- **Taggning:** taggen syns direkt (optimistiskt). Insert plus omhämtning av kontext tar en DB-rundresa. Lokalt märks ingen fördröjning.

## Ej testat än: riktig match

Allt ovan är verifierat med en syntetisk testvideo, eftersom jag inte har någon matchvideo från dig. Det jag behöver från dig för att testa på riktigt:

1. En matchvideo, helst en per källtyp du använder.
2. Truppen (namn och nummer) och vilka femmor som spelade.
3. Att tagga 10–15 minuter själv och notera vad som tar tid eller känns fel. Det viktigaste måttet i den här fasen är hur många sekunder per tagg du lägger.

## Svagheter och kända begränsningar

1. **Supabase-migrationen är inte helt applicerad på det riktiga projektet.** Supabase-verktyget kräver din bekräftelse för SQL som innehåller `DELETE`, även i funktionskroppar. Därför är bara schema, tabeller och RLS applicerade. Triggers för klipp och kontext samt standardtaggarna väntar. Lös det genom att bekräfta i en session där du är med, eller köra `supabase db push` mot projektet.
2. **Gratisnivån i Supabase tar max 50 MB per fil.** Riktig matchvideo kräver Cloudflare R2 (rekommenderas) eller Supabase Pro. API:t har S3-stöd, men jag har inte kunnat testa mot R2 utan nycklar.
3. **Matchklockan är manuell** och kräver periodstart plus en synk vid behov. Mellan synkpunkterna antas klockan gå. Om klockan står still (effektiv tid) utan en ny synk blir matchtiden för hög, upp till nästa synkpunkt där den kapas. Fas 3 (OCR) ersätter detta.
4. **Motståndarnas femmor stöds i datamodellen men har inget UI ännu.** Spelare på plan visas bara för vårt lag (plus motståndarnas målvakt om den läggs in).
5. **Byten kräver en tangenttryckning per byte**, alltså cirka 60–100 tryck per match. Det är den största manuella kostnaden tills fas 5.
6. **En uppladdning kan inte återupptas** efter att sidan laddats om. Den måste startas om.
7. **Jobbstatus pollas** varannan sekund i stället för att använda Supabase Realtime. Det räcker men är inte elegant.
8. **Åtkomstsidor för spelarrollen** (egna spellistor) kommer i fas 2.

## Vad som ger mest förbättring härnäst

1. **Fas 2 (spellistor och export)** som planerat. Det gör taggarna användbara på videomöten.
2. **Byten:** prova att bara tagga byten för vårt lag under en riktig match och mät tiden. Är det för tungt kan en "bytesassistent" som föreslår nästa femma i rotation spara hälften av trycken redan före fas 5.
3. **Lagring:** sätt upp R2 med en bucket och API-nycklar, så att riktiga matcher kan laddas upp mot det riktiga projektet.
