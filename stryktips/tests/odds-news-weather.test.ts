import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNews } from "@/lib/sources/news";
import { findMarketOdds, parseOddsApi } from "@/lib/sources/odds";
import { pickHour } from "@/lib/sources/weather";
import type { CouponMatch } from "@/lib/types";

const match: CouponMatch = {
  eventNumber: 2,
  home: "Sheffield W",
  away: "Leeds",
  league: "Championship",
  kickoff: "2026-10-24T16:00:00+02:00",
};

describe("The Odds API", () => {
  const events = parseOddsApi(JSON.parse(readFileSync("tests/fixtures/odds-api.json", "utf8")));

  it("hoppar över bookmakers som saknar ett tecken", () => {
    expect(events[0].byBookmaker.map((b) => b.name)).toEqual(["Pinnacle", "Unibet"]);
  });

  it("hittar rätt match och räknar snittodds", () => {
    const m = findMarketOdds(match, events)!;
    expect(m.bookmakers).toBe(2);
    expect(m.average.home).toBeCloseTo(4.1);
    expect(m.average.draw).toBeCloseTo(3.55);
    expect(m.average.away).toBeCloseTo(1.88);
  });

  it("matchar inte returmatchen eller en match en annan vecka", () => {
    expect(findMarketOdds({ ...match, home: "Leeds", away: "Sheffield W" }, events)).toBeUndefined();
    expect(findMarketOdds({ ...match, kickoff: "2026-11-07T16:00:00+01:00" }, events)).toBeUndefined();
  });
});

describe("nyhetssvar från Claude", () => {
  const team = {
    absences: [{ player: "A. Spelare", reason: "skada", importance: "nyckelspelare", status: "borta" }],
    managerChange: null,
    motivation: "Kvalstrid",
    motivationScore: 1,
    fatigueScore: -1,
    notes: "",
  };
  const body = { home: team, away: { ...team, absences: [] }, isDerby: false, venueCity: "Sheffield", summary: "x", confidence: 0.7, sources: [] };

  it("plockar JSON ur text med inledande prosa", () => {
    const n = parseNews(`Här är läget:\n${JSON.stringify(body)}\n`);
    expect(n.home.absences[0].importance).toBe("nyckelspelare");
    expect(n.venueCity).toBe("Sheffield");
  });

  it("avvisar svar utanför schemat", () => {
    expect(() => parseNews(JSON.stringify({ ...body, confidence: 3 }))).toThrow(/Ogiltigt/);
    expect(() => parseNews("inget json här")).toThrow(/JSON/);
  });
});

describe("Open-Meteo", () => {
  it("väljer timmen närmast avspark", () => {
    const w = pickHour(
      {
        hourly: {
          time: ["2026-10-24T13:00", "2026-10-24T14:00", "2026-10-24T15:00"],
          temperature_2m: [10, 11, 12],
          precipitation: [0, 2.5, 0],
          wind_speed_10m: [3, 9, 4],
        },
      },
      "2026-10-24T16:00:00+02:00",
    );
    expect(w).toEqual({ temperatureC: 11, precipitationMm: 2.5, windSpeedMs: 9 });
  });
});
