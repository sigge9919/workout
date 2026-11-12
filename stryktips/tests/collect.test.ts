import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { cached, MemoryCache } from "@/lib/cache";
import { collectDraw, type Sources } from "@/lib/collect";
import { parseSvenskaSpel } from "@/lib/sources/coupon";
import { parseOddsApi } from "@/lib/sources/odds";
import { toHistory } from "@/lib/sources/results";

const today = new Date("2026-10-24T10:00:00Z");
const coupon = parseSvenskaSpel(JSON.parse(readFileSync("tests/fixtures/svenskaspel-draws.json", "utf8")));
const e1 = readFileSync("tests/fixtures/E1.csv", "utf8");
const oddsEvents = parseOddsApi(JSON.parse(readFileSync("tests/fixtures/odds-api.json", "utf8")));

function fakeSources(overrides: Partial<Sources> = {}): Sources {
  return {
    coupon: { name: "svenskaspel", fetch: vi.fn(async () => coupon) },
    results: {
      name: "football-data.co.uk",
      fetchLeague: vi.fn(async (league) => {
        if (league.code === "E1") return toHistory("E1", [e1], today);
        throw new Error("nätverksfel");
      }),
    },
    odds: { name: "the-odds-api", fetchLeague: vi.fn(async (key: string) => (key === "soccer_efl_champ" ? oddsEvents : [])) },
    news: null,
    weather: null,
    ...overrides,
  };
}

describe("collectDraw", () => {
  it("samlar historik och odds per match och flaggar det som saknas", async () => {
    const d = await collectDraw({ sources: fakeSources(), store: new MemoryCache(), today });
    expect(d.coupon.drawNumber).toBe(4876);
    expect(d.matches).toHaveLength(3);

    const [pl, champ, swe] = d.matches;
    expect(champ.historyNames).toEqual({ home: "Sheffield Weds", away: "Leeds" });
    expect(champ.homeResults.map((r) => r.date)).toEqual(["2026-08-23", "2026-08-09"]);
    expect(champ.headToHead).toHaveLength(1);
    expect(champ.marketOdds?.bookmakers).toBe(2);
    expect(champ.flags).toEqual([]);

    expect(pl.flags).toContain("Resultathistorik kunde inte hämtas");
    expect(pl.flags).toContain("Marknadsodds saknas för matchen");
    expect(swe.flags).toEqual(
      expect.arrayContaining(["Svenska Spel visar inga odds för matchen", "Streckprocent saknas"]),
    );
  });

  it("hämtar varje liga en gång och läser från cachen nästa gång", async () => {
    const sources = fakeSources();
    const store = new MemoryCache();
    await collectDraw({ sources, store, today });
    const again = await collectDraw({ sources, store, today });
    expect(sources.coupon.fetch).toHaveBeenCalledTimes(1);
    expect(sources.odds!.fetchLeague).toHaveBeenCalledTimes(3); // E0, E1, SWE
    expect(again.couponStatus.fromCache).toBe(true);
  });

  it("flaggar nyhetsfel utan att stoppa insamlingen och hämtar väder från nyhetens ort", async () => {
    const news = {
      name: "claude-web-search",
      fetchMatch: vi.fn(async (m: { eventNumber: number }) => {
        if (m.eventNumber === 1) throw new Error("timeout");
        return {
          home: { absences: [], managerChange: null, motivation: "", motivationScore: 0, fatigueScore: 0, notes: "" },
          away: { absences: [], managerChange: null, motivation: "", motivationScore: 0, fatigueScore: 0, notes: "" },
          isDerby: false,
          venueCity: "Sheffield",
          summary: "",
          confidence: 0.3,
          sources: [],
        };
      }),
    };
    const weather = {
      name: "open-meteo",
      forecast: vi.fn(async () => ({ temperatureC: 8, precipitationMm: 4, windSpeedMs: 12, location: "Sheffield" })),
    };
    const d = await collectDraw({ sources: fakeSources({ news, weather }), store: new MemoryCache(), today, includeNews: true });
    expect(d.matches[0].flags).toContain("Nyhetsläget kunde inte hämtas");
    expect(d.matches[1].news?.venueCity).toBe("Sheffield");
    expect(d.matches[1].flags).toContain("Osäkert nyhetsläge");
    expect(d.matches[1].weather?.precipitationMm).toBe(4);
    expect(weather.forecast).toHaveBeenCalledTimes(2);
  });

  it("kastar om kupongen inte kan hämtas", async () => {
    const sources = fakeSources({ coupon: { name: "svenskaspel", fetch: async () => { throw new Error("403"); } } });
    await expect(collectDraw({ sources, store: new MemoryCache(), today })).rejects.toThrow("403");
  });
});

describe("cached", () => {
  it("använder gammal data när en ny hämtning misslyckas", async () => {
    const store = new MemoryCache();
    await store.set("k", { value: 1, fetchedAt: "2026-01-01T00:00:00Z" });
    const r = await cached("k", async () => { throw new Error("nere"); }, { ttlMinutes: 1, store });
    expect(r).toEqual({ value: 1, fetchedAt: "2026-01-01T00:00:00Z", fromCache: true });
  });

  it("hämtar nytt när force är satt", async () => {
    const store = new MemoryCache();
    await store.set("k", { value: 1, fetchedAt: new Date().toISOString() });
    expect((await cached("k", async () => 2, { ttlMinutes: 60, store, force: true })).value).toBe(2);
  });
});
