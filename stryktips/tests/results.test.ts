import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEAGUES } from "@/lib/leagues";
import { leagueUrls, parseCsv, parseDate, seasonCodes, toHistory } from "@/lib/sources/results";

const today = new Date("2026-10-24T10:00:00Z");
const league = (code: string) => LEAGUES.find((l) => l.code === code)!;

describe("football-data.co.uk", () => {
  it("räknar fram säsongskoder och URL:er", () => {
    expect(seasonCodes(today)).toEqual(["2627", "2526"]);
    expect(seasonCodes(new Date("2027-03-01"))).toEqual(["2627", "2526"]);
    expect(leagueUrls(league("E1"), today)[0]).toBe("https://www.football-data.co.uk/mmz4281/2627/E1.csv");
    expect(leagueUrls(league("SWE"), today)).toEqual(["https://www.football-data.co.uk/new/SWE.csv"]);
  });

  it("tolkar datum och citerade fält", () => {
    expect(parseDate("09/08/2026")).toBe("2026-08-09");
    expect(parseDate("9/8/26")).toBe("2026-08-09");
    expect(parseDate("")).toBeNull();
    expect(parseCsv('a,b\n"x, y",2\r\n')).toEqual([{ a: "x, y", b: "2" }]);
  });

  it("läser säsongsfilen med skott och stängningsodds, hoppar över ospelade rader", () => {
    const h = toHistory("E1", [readFileSync("tests/fixtures/E1.csv", "utf8")], today);
    expect(h.results).toHaveLength(3);
    expect(h.teams).toEqual(["Hull", "Leeds", "Sheffield Weds"]);
    expect(h.results[0]).toMatchObject({
      date: "2026-08-09",
      home: "Sheffield Weds",
      homeGoals: 1,
      awayGoals: 2,
      homeShotsOnTarget: 3,
      closingOdds: { home: 4.1, draw: 3.6, away: 1.88 },
    });
    // Saknas stängningsodds används öppningssnittet.
    expect(h.results[2].closingOdds).toEqual({ home: 2.45, draw: 3.3, away: 2.95 });
  });

  it("läser filen med alla säsonger och filtrerar bort gamla matcher", () => {
    const h = toHistory("SWE", [readFileSync("tests/fixtures/SWE.csv", "utf8")], today);
    expect(h.results).toHaveLength(1);
    expect(h.results[0]).toMatchObject({ home: "Djurgarden", away: "Malmo FF", homeGoals: 2, homeShots: undefined });
  });

  it("tar bort dubbletter när två säsongsfiler överlappar", () => {
    const csv = readFileSync("tests/fixtures/E1.csv", "utf8");
    expect(toHistory("E1", [csv, csv], today).results).toHaveLength(3);
  });
});
