// Marknadsodds från The Odds API. Ett anrop per liga (marknad h2h, region eu)
// kostar 1 kredit; gratisnivån har 500 krediter i månaden.

import { fetchJson } from "../http";
import { matchTeam } from "../teams";
import type { CouponMatch, MarketOdds, Odds1X2 } from "../types";

export interface OddsEvent {
  home: string;
  away: string;
  commenceTime: string;
  byBookmaker: { name: string; odds: Odds1X2 }[];
}

export interface OddsSource {
  name: string;
  fetchLeague(sportKey: string): Promise<OddsEvent[]>;
}

interface ApiOutcome {
  name: string;
  price: number;
}
interface ApiEvent {
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: { title: string; markets?: { key: string; outcomes?: ApiOutcome[] }[] }[];
}

export function parseOddsApi(events: ApiEvent[]): OddsEvent[] {
  return events.map((e) => ({
    home: e.home_team,
    away: e.away_team,
    commenceTime: e.commence_time,
    byBookmaker: (e.bookmakers ?? []).flatMap((b) => {
      const outcomes = b.markets?.find((m) => m.key === "h2h")?.outcomes ?? [];
      const price = (name: string) => outcomes.find((o) => o.name === name)?.price;
      const home = price(e.home_team);
      const draw = price("Draw");
      const away = price(e.away_team);
      return home && draw && away ? [{ name: b.title, odds: { home, draw, away } }] : [];
    }),
  }));
}

/** Snittodds; tom lista ger undefined. */
export function averageOdds(list: Odds1X2[]): Odds1X2 | undefined {
  if (list.length === 0) return undefined;
  const avg = (k: keyof Odds1X2) => list.reduce((s, o) => s + o[k], 0) / list.length;
  return { home: avg("home"), draw: avg("draw"), away: avg("away") };
}

/**
 * Hittar kupongmatchen bland oddsmatcherna: båda lagnamnen ska likna och
 * avsparken får skilja högst 36 timmar (kupongens tider är ibland preliminära).
 */
export function findMarketOdds(match: CouponMatch, events: OddsEvent[]): MarketOdds | undefined {
  const kickoff = Date.parse(match.kickoff);
  let best: { event: OddsEvent; score: number } | null = null;
  for (const event of events) {
    if (Number.isFinite(kickoff) && Math.abs(Date.parse(event.commenceTime) - kickoff) > 36 * 3_600_000) continue;
    const h = matchTeam(match.home, [event.home]);
    const a = matchTeam(match.away, [event.away]);
    if (!h || !a) continue;
    const score = h.score + a.score;
    if (!best || score > best.score) best = { event, score };
  }
  if (!best) return undefined;
  const average = averageOdds(best.event.byBookmaker.map((b) => b.odds));
  if (!average) return undefined;
  return {
    average,
    bookmakers: best.event.byBookmaker.length,
    byBookmaker: best.event.byBookmaker,
    commenceTime: best.event.commenceTime,
  };
}

export class TheOddsApi implements OddsSource {
  name = "the-odds-api";

  constructor(private apiKey = process.env.ODDS_API_KEY) {}

  get enabled() {
    return Boolean(this.apiKey);
  }

  async fetchLeague(sportKey: string): Promise<OddsEvent[]> {
    if (!this.apiKey) throw new Error("ODDS_API_KEY saknas");
    const url =
      `https://api.the-odds-api.com/v4/sports/${sportKey}/odds` +
      `?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${encodeURIComponent(this.apiKey)}`;
    return parseOddsApi(await fetchJson<ApiEvent[]>(url));
  }
}
