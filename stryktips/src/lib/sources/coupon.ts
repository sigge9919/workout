// Kupongkällor. Svenska Spels API är inofficiellt och odokumenterat, därför
// tolkas svaret defensivt och allt bakom interfacet CouponSource kan bytas ut.

import { fetchJson } from "../http";
import type { Coupon, CouponMatch, Odds1X2, Triple } from "../types";

export interface CouponSource {
  name: string;
  /** Aktuell (öppen) omgång, eller en given omgång. */
  fetch(drawNumber?: number): Promise<Coupon>;
}

const PUBLIC_BASE = "https://api.spela.svenskaspel.se/draw/1/stryktipset/draws";
const EXTERNAL_BASE = "https://api.www.svenskaspel.se/external/1/draw/stryktipset/draws";

export class SvenskaSpelCoupon implements CouponSource {
  name = "svenskaspel";

  constructor(private accessKey = process.env.SVENSKASPEL_ACCESS_KEY || undefined) {}

  url(drawNumber?: number): string {
    const base = this.accessKey ? EXTERNAL_BASE : PUBLIC_BASE;
    const url = drawNumber ? `${base}/${drawNumber}` : base;
    return this.accessKey ? `${url}?accesskey=${encodeURIComponent(this.accessKey)}` : url;
  }

  async fetch(drawNumber?: number): Promise<Coupon> {
    return parseSvenskaSpel(await fetchJson(this.url(drawNumber)), drawNumber);
  }
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** "2,45", "2.45", 2.45 -> 2.45. Tomt eller ogiltigt -> undefined. */
export function parseNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return v.trim() && Number.isFinite(n) ? n : undefined;
}

function triple(v: unknown, keys = ["one", "x", "two"]): Triple | undefined {
  if (!isObj(v)) return undefined;
  const [h, d, a] = keys.map((k) => parseNumber(v[k]));
  if (h === undefined || d === undefined || a === undefined) return undefined;
  return { home: h, draw: d, away: a };
}

function parseOdds(v: unknown): Odds1X2 | undefined {
  const t = triple(v);
  return t && t.home > 1 && t.draw > 1 && t.away > 1 ? t : undefined;
}

/** Streck anges i procent ("45"); normaliseras till andelar som summerar till 1. */
function parseStreck(v: unknown): Triple | undefined {
  const t = triple(v);
  if (!t) return undefined;
  const sum = t.home + t.draw + t.away;
  if (sum <= 0) return undefined;
  return { home: t.home / sum, draw: t.draw / sum, away: t.away / sum };
}

function parseEvent(e: Json): CouponMatch {
  const match = isObj(e.match) ? e.match : {};
  const participants = Array.isArray(match.participants) ? (match.participants as Json[]) : [];
  const byType = (t: string) => participants.find((p) => p.type === t)?.name as string | undefined;

  let home = byType("home");
  let away = byType("away");
  if ((!home || !away) && typeof e.eventDescription === "string") {
    [home, away] = e.eventDescription.split(/\s+-\s+/);
  }
  if (!home || !away) throw new Error(`Match ${e.eventNumber}: lagnamn saknas`);

  const league = isObj(match.league) ? match.league : {};
  const country = isObj(league.country) ? (league.country.name as string) : undefined;

  return {
    eventNumber: Number(e.eventNumber),
    home: home.trim(),
    away: away.trim(),
    league: (league.name as string) ?? "",
    country,
    kickoff: String(match.matchStart ?? e.matchStart ?? ""),
    odds: parseOdds(e.odds) ?? parseOdds(e.startOdds),
    streck: parseStreck(e.svenskaFolket),
    newspaperTips: triple(e.tioTidningarsTips),
  };
}

function parseDraw(d: Json): Coupon {
  const events = Array.isArray(d.drawEvents) ? (d.drawEvents as Json[]) : [];
  const matches = events.filter((e) => !e.cancelled).map(parseEvent);
  if (matches.length === 0) throw new Error(`Omgång ${d.drawNumber}: inga matcher`);
  matches.sort((a, b) => a.eventNumber - b.eventNumber);
  return {
    drawNumber: Number(d.drawNumber),
    closeTime: String(d.regCloseTime ?? d.closeTime ?? ""),
    matches,
    turnover: parseNumber(d.turnover),
    source: "svenskaspel",
  };
}

/**
 * Tolkar både listsvaret ({draws: [...]}) och en enskild omgång ({draw: {...}}).
 * Ur listan väljs den öppna omgången med närmast spelstopp.
 */
export function parseSvenskaSpel(json: unknown, drawNumber?: number): Coupon {
  if (!isObj(json)) throw new Error("Oväntat svar från Svenska Spel");
  if (isObj(json.draw)) return parseDraw(json.draw);

  const draws = Array.isArray(json.draws) ? (json.draws as Json[]) : [];
  if (draws.length === 0) throw new Error("Svenska Spel returnerade inga omgångar");

  if (drawNumber) {
    const d = draws.find((x) => Number(x.drawNumber) === drawNumber);
    if (!d) throw new Error(`Omgång ${drawNumber} finns inte i svaret`);
    return parseDraw(d);
  }
  const open = draws.filter((d) => String(d.drawState ?? "").toLowerCase() === "open");
  const pool = open.length ? open : draws;
  pool.sort((a, b) => String(a.regCloseTime).localeCompare(String(b.regCloseTime)));
  return parseDraw(pool[0]);
}
