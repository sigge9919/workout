// Samlar all data för en omgång. Bara kupongen är obligatorisk: om en annan
// källa fallerar för en match fortsätter insamlingen och matchen flaggas.

import { cached, type Cached, type CacheStore } from "./cache";
import { NO_RESULTS_FILE, resolveLeague, type LeagueInfo } from "./leagues";
import { SvenskaSpelCoupon, type CouponSource } from "./sources/coupon";
import { ClaudeNews, type NewsSource } from "./sources/news";
import { findMarketOdds, TheOddsApi, type OddsEvent, type OddsSource } from "./sources/odds";
import { FootballDataResults, type ResultsSource } from "./sources/results";
import { OpenMeteo, type WeatherSource } from "./sources/weather";
import { matchTeam } from "./teams";
import type { DrawData, LeagueHistory, MatchData, SourceStatus } from "./types";

export interface Sources {
  coupon: CouponSource;
  results: ResultsSource;
  odds: (OddsSource & { enabled?: boolean }) | null;
  news: (NewsSource & { enabled?: boolean }) | null;
  weather: WeatherSource | null;
}

export function defaultSources(): Sources {
  const odds = new TheOddsApi();
  const news = new ClaudeNews();
  return {
    coupon: new SvenskaSpelCoupon(),
    results: new FootballDataResults(),
    odds: odds.enabled ? odds : null,
    news: news.enabled ? news : null,
    weather: new OpenMeteo(),
  };
}

export interface CollectOptions {
  drawNumber?: number;
  /** Kör Claude-sökningen (kostar pengar). */
  includeNews?: boolean;
  /** Ignorera färsk cache. */
  force?: boolean;
  sources?: Sources;
  store?: CacheStore;
  today?: Date;
  /** Hur många nyhetssökningar som körs samtidigt. */
  concurrency?: number;
}

/** Cachetider i minuter. Streck och odds rör sig under veckan, historik sällan. */
export const TTL = { coupon: 30, results: 12 * 60, odds: 60, news: 6 * 60, weather: 3 * 60 };

type Outcome<T> = { ok: true; value: T; status: SourceStatus } | { ok: false; status: SourceStatus };

async function attempt<T>(source: string, run: () => Promise<Cached<T>>): Promise<Outcome<T>> {
  try {
    const r = await run();
    return { ok: true, value: r.value, status: { source, ok: true, fetchedAt: r.fetchedAt, fromCache: r.fromCache } };
  } catch (e) {
    return { ok: false, status: { source, ok: false, error: (e as Error).message } };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Senaste matcher för ett lag, nyast först. */
function teamResults(history: LeagueHistory, team: string, limit = 20) {
  return history.results
    .filter((r) => r.home === team || r.away === team)
    .slice(-limit)
    .reverse();
}

export async function collectDraw(opts: CollectOptions = {}): Promise<DrawData> {
  const sources = opts.sources ?? defaultSources();
  const today = opts.today ?? new Date();
  const base = { force: opts.force, store: opts.store, now: () => new Date() };

  const couponKey = opts.drawNumber ? `draw${opts.drawNumber}:coupon` : "coupon:current";
  const c = await cached(couponKey, () => sources.coupon.fetch(opts.drawNumber), { ...base, ttlMinutes: TTL.coupon });
  const coupon = c.value;
  const couponStatus: SourceStatus = { source: sources.coupon.name, ok: true, fetchedAt: c.fetchedAt, fromCache: c.fromCache };
  const dk = `draw${coupon.drawNumber}`;

  // En hämtning per liga, delas av kupongens matcher i samma liga.
  const leagues = new Map<string, LeagueInfo>();
  const leagueOf = new Map<number, LeagueInfo | null>();
  for (const m of coupon.matches) {
    const info = resolveLeague(m.league, m.country);
    leagueOf.set(m.eventNumber, info);
    if (info) leagues.set(info.code, info);
  }

  const historyByLeague = new Map<string, Outcome<LeagueHistory>>();
  const oddsByLeague = new Map<string, Outcome<OddsEvent[]>>();
  await Promise.all(
    [...leagues.values()].map(async (info) => {
      if (!NO_RESULTS_FILE.has(info.code)) {
        const day = today.toISOString().slice(0, 10);
        historyByLeague.set(
          info.code,
          await attempt(sources.results.name, () =>
            cached(`results:${info.code}:${day}`, () => sources.results.fetchLeague(info, today), {
              ...base,
              ttlMinutes: TTL.results,
            }),
          ),
        );
      }
      if (sources.odds && info.oddsApiKey) {
        const odds = sources.odds;
        oddsByLeague.set(
          info.code,
          await attempt(odds.name, () =>
            cached(`${dk}:odds:${info.oddsApiKey}`, () => odds.fetchLeague(info.oddsApiKey!), {
              ...base,
              ttlMinutes: TTL.odds,
            }),
          ),
        );
      }
    }),
  );

  const matches = await mapLimit(coupon.matches, opts.concurrency ?? 4, async (match): Promise<MatchData> => {
    const info = leagueOf.get(match.eventNumber) ?? null;
    const data: MatchData = {
      match,
      leagueCode: info?.code ?? null,
      homeResults: [],
      awayResults: [],
      headToHead: [],
      sources: [],
      flags: [],
    };

    if (!info) data.flags.push(`Okänd liga (${match.league}): ingen historik eller marknadsodds`);
    if (!match.odds) data.flags.push("Svenska Spel visar inga odds för matchen");
    if (!match.streck) data.flags.push("Streckprocent saknas");

    // Historik
    const hist = info ? historyByLeague.get(info.code) : undefined;
    if (hist?.ok) {
      const home = matchTeam(match.home, hist.value.teams);
      const away = matchTeam(match.away, hist.value.teams);
      if (home && away) {
        data.historyNames = { home: home.name, away: away.name };
        data.homeResults = teamResults(hist.value, home.name);
        data.awayResults = teamResults(hist.value, away.name);
        data.headToHead = hist.value.results
          .filter(
            (r) =>
              (r.home === home.name && r.away === away.name) || (r.home === away.name && r.away === home.name),
          )
          .reverse();
        data.sources.push(hist.status);
      } else {
        const missing = [!home && match.home, !away && match.away].filter(Boolean).join(", ");
        data.sources.push({ ...hist.status, ok: false, error: `Hittade inte ${missing} i historiken` });
        data.flags.push(`Ingen historik för ${missing}`);
      }
    } else if (hist) {
      data.sources.push(hist.status);
      data.flags.push("Resultathistorik kunde inte hämtas");
    } else if (info) {
      data.flags.push(`Ingen gratis resultatkälla för ${info.name}`);
    }

    // Marknadsodds
    const odds = info ? oddsByLeague.get(info.code) : undefined;
    if (odds?.ok) {
      data.marketOdds = findMarketOdds(match, odds.value);
      data.sources.push(data.marketOdds ? odds.status : { ...odds.status, ok: false, error: "Matchen saknas i oddsflödet" });
      if (!data.marketOdds) data.flags.push("Marknadsodds saknas för matchen");
    } else if (odds) {
      data.sources.push(odds.status);
      data.flags.push("Marknadsodds kunde inte hämtas");
    }

    // Nyheter och väder
    if (opts.includeNews && sources.news) {
      const news = sources.news;
      const n = await attempt(news.name, () =>
        cached(`${dk}:news:${match.eventNumber}:${match.home}-${match.away}`, () => news.fetchMatch(match), {
          ...base,
          ttlMinutes: TTL.news,
        }),
      );
      data.sources.push(n.status);
      if (n.ok) {
        data.news = n.value;
        if (n.value.confidence < 0.4) data.flags.push("Osäkert nyhetsläge");
      } else data.flags.push("Nyhetsläget kunde inte hämtas");
    } else if (opts.includeNews) {
      data.flags.push("Nyhetsanalys avstängd (ANTHROPIC_API_KEY saknas)");
    }

    const city = data.news?.venueCity;
    if (city && sources.weather) {
      const weather = sources.weather;
      const w = await attempt(weather.name, () =>
        cached(`${dk}:weather:${match.eventNumber}`, () => weather.forecast(city, match.kickoff), {
          ...base,
          ttlMinutes: TTL.weather,
        }),
      );
      data.sources.push(w.status);
      if (w.ok) data.weather = w.value;
    }

    return data;
  });

  return { coupon, couponStatus, matches, collectedAt: new Date().toISOString() };
}

/** Kort sammanställning av vad som saknas, för loggar och CLI. */
export function summarize(d: DrawData): string {
  const lines = [
    `Omgång ${d.coupon.drawNumber}, spelstopp ${d.coupon.closeTime} (kupong hämtad ${d.couponStatus.fetchedAt}${d.couponStatus.fromCache ? ", cache" : ""})`,
  ];
  for (const m of d.matches) {
    const { match } = m;
    const pct = (x?: number) => (x === undefined ? "–" : `${Math.round(x * 100)}`);
    const streck = match.streck ? `${pct(match.streck.home)}/${pct(match.streck.draw)}/${pct(match.streck.away)}` : "–";
    lines.push(
      `${String(match.eventNumber).padStart(2)}. ${match.home} – ${match.away} [${match.league}] ` +
        `streck ${streck}, historik ${m.homeResults.length}/${m.awayResults.length}, ` +
        `odds ${m.marketOdds ? m.marketOdds.bookmakers + " bolag" : "–"}` +
        (m.flags.length ? `\n    ⚑ ${m.flags.join("; ")}` : ""),
    );
  }
  return lines.join("\n");
}

