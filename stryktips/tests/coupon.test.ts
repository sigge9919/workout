import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNumber, parseSvenskaSpel, SvenskaSpelCoupon } from "@/lib/sources/coupon";

const json = JSON.parse(readFileSync("tests/fixtures/svenskaspel-draws.json", "utf8"));

describe("Svenska Spel-kupong", () => {
  it("väljer den öppna omgången med närmast spelstopp och sorterar matcherna", () => {
    const c = parseSvenskaSpel(json);
    expect(c.drawNumber).toBe(4876);
    expect(c.matches.map((m) => m.eventNumber)).toEqual([1, 2, 3]);
    expect(c.turnover).toBe(23456789);
  });

  it("tolkar odds med decimalkomma och normaliserar streck till andelar", () => {
    const m = parseSvenskaSpel(json).matches[1];
    expect(m).toMatchObject({ home: "Sheffield W", away: "Leeds", league: "Championship", country: "England" });
    expect(m.odds).toEqual({ home: 4.1, draw: 3.6, away: 1.85 });
    expect(m.streck!.home + m.streck!.draw + m.streck!.away).toBeCloseTo(1);
    expect(m.streck!.away).toBeCloseTo(0.58);
    expect(m.newspaperTips).toEqual({ home: 0, draw: 2, away: 8 });
  });

  it("faller tillbaka på eventDescription och lämnar tomma odds odefinierade", () => {
    const m = parseSvenskaSpel(json).matches[2];
    expect(m.home).toBe("Djurgården");
    expect(m.away).toBe("Malmö FF");
    expect(m.odds).toBeUndefined();
    expect(m.streck).toBeUndefined();
  });

  it("väljer en given omgång och klarar enskilt omgångssvar", () => {
    expect(parseSvenskaSpel(json, 4877).drawNumber).toBe(4877);
    expect(parseSvenskaSpel({ draw: json.draws[0] }).drawNumber).toBe(4877);
    expect(() => parseSvenskaSpel(json, 1)).toThrow(/finns inte/);
    expect(() => parseSvenskaSpel({ draws: [] })).toThrow(/inga omgångar/);
  });

  it("använder den externa endpointen bara med nyckel", () => {
    expect(new SvenskaSpelCoupon("").url()).toBe("https://api.spela.svenskaspel.se/draw/1/stryktipset/draws");
    expect(new SvenskaSpelCoupon("k3y").url(4876)).toBe(
      "https://api.www.svenskaspel.se/external/1/draw/stryktipset/draws/4876?accesskey=k3y",
    );
  });

  it("parseNumber", () => {
    expect(parseNumber("1 234,5")).toBe(1234.5);
    expect(parseNumber(2)).toBe(2);
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("abc")).toBeUndefined();
  });
});
