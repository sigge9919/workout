// Resultathistorik från football-data.co.uk (gratis CSV-filer).
// Ger form, tabell, inbördes möten och underlag för målmodellen.

import { fetchText, HttpError } from "../http";
import type { LeagueInfo } from "../leagues";
import type { LeagueHistory, MatchResult, Odds1X2 } from "../types";

export interface ResultsSource {
  name: string;
  fetchLeague(league: LeagueInfo, today?: Date): Promise<LeagueHistory>;
}

const BASE = "https://www.football-data.co.uk";

/** Säsongskoder ("2627") för innevarande och föregående höst–vår-säsong. */
export function seasonCodes(today: Date): string[] {
  const y = today.getUTCFullYear();
  const start = today.getUTCMonth() >= 6 ? y : y - 1;
  const code = (s: number) => `${String(s % 100).padStart(2, "0")}${String((s + 1) % 100).padStart(2, "0")}`;
  return [code(start), code(start - 1)];
}

export function leagueUrls(league: LeagueInfo, today: Date): string[] {
  if (league.format === "all") return [`${BASE}/new/${league.code}.csv`];
  return seasonCodes(today).map((s) => `${BASE}/mmz4281/${s}/${league.code}.csv`);
}

/** Enkel CSV-tolk som klarar citattecken. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** "24/10/2026" eller "24/10/26" -> "2026-10-24". */
export function parseDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const num = (s: string | undefined) => (s && s !== "" && Number.isFinite(Number(s)) ? Number(s) : undefined);

function odds(r: Record<string, string>, h: string, d: string, a: string): Odds1X2 | undefined {
  const [home, draw, away] = [num(r[h]), num(r[d]), num(r[a])];
  return home && draw && away ? { home, draw, away } : undefined;
}

export function rowToResult(r: Record<string, string>): MatchResult | null {
  const date = parseDate(r.Date ?? "");
  const home = r.HomeTeam ?? r.Home;
  const away = r.AwayTeam ?? r.Away;
  const hg = num(r.FTHG ?? r.HG);
  const ag = num(r.FTAG ?? r.AG);
  if (!date || !home || !away || hg === undefined || ag === undefined) return null;
  return {
    date,
    home,
    away,
    homeGoals: hg,
    awayGoals: ag,
    homeShots: num(r.HS),
    awayShots: num(r.AS),
    homeShotsOnTarget: num(r.HST),
    awayShotsOnTarget: num(r.AST),
    closingOdds:
      odds(r, "AvgCH", "AvgCD", "AvgCA") ?? odds(r, "PSCH", "PSCD", "PSCA") ?? odds(r, "AvgH", "AvgD", "AvgA"),
  };
}

/** Matcher från de senaste `days` dagarna, äldst först. */
export function toHistory(code: string, csvs: string[], today: Date, days = 730): LeagueHistory {
  const cutoff = new Date(today.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const seen = new Set<string>();
  const results: MatchResult[] = [];
  for (const csv of csvs) {
    for (const row of parseCsv(csv)) {
      const r = rowToResult(row);
      if (!r || r.date < cutoff) continue;
      const id = `${r.date}|${r.home}|${r.away}`;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push(r);
    }
  }
  results.sort((a, b) => a.date.localeCompare(b.date));
  const teams = [...new Set(results.flatMap((r) => [r.home, r.away]))].sort();
  return { leagueCode: code, results, teams };
}

export class FootballDataResults implements ResultsSource {
  name = "football-data.co.uk";

  async fetchLeague(league: LeagueInfo, today = new Date()): Promise<LeagueHistory> {
    const csvs: string[] = [];
    for (const url of leagueUrls(league, today)) {
      try {
        csvs.push(await fetchText(url, 20_000));
      } catch (e) {
        // Ny säsong kan sakna fil de första dagarna; föregående säsong räcker då.
        if (e instanceof HttpError && e.status === 404) continue;
        throw e;
      }
    }
    if (csvs.length === 0) throw new Error(`Ingen resultatfil för ${league.name}`);
    return toHistory(league.code, csvs, today);
  }
}
