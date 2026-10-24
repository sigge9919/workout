import { describe, expect, it } from "vitest";
import { resolveLeague } from "@/lib/leagues";
import { matchTeam, normalizeTeam, teamSimilarity } from "@/lib/teams";

describe("lagnamn", () => {
  it("normaliserar diakritiska tecken, förkortningar och brus", () => {
    expect(normalizeTeam("Malmö FF")).toBe("malmo");
    expect(normalizeTeam("Man United")).toBe("manchester united");
    expect(normalizeTeam("Brighton & Hove Albion")).toBe("brighton");
    expect(normalizeTeam("AFC Bournemouth")).toBe("bournemouth");
  });

  it.each([
    ["Manchester U", ["Man City", "Man United", "Newcastle"], "Man United"],
    ["Sheffield W", ["Sheffield United", "Sheffield Weds", "Leeds"], "Sheffield Weds"],
    ["Djurgården", ["Djurgarden", "Degerfors", "AIK"], "Djurgarden"],
    ["IFK Göteborg", ["Goteborg", "Hacken"], "Goteborg"],
    ["Wolverhampton", ["Wolves", "West Ham"], "Wolves"],
    ["Nottingham", ["Nott'm Forest", "Notts County"], "Nott'm Forest"],
    ["Queens Park Rangers", ["QPR", "Preston"], "QPR"],
    ["Leeds", ["Leeds United", "Leicester"], "Leeds United"],
  ])("%s matchar rätt kandidat", (name, candidates, expected) => {
    expect(matchTeam(name, candidates)?.name).toBe(expected);
  });

  it("matchar inte olika lag", () => {
    expect(matchTeam("West Ham", ["West Brom"])).toBeNull();
    expect(matchTeam("Hull", ["Leeds", "Luton"])).toBeNull();
    expect(teamSimilarity("Arsenal", "Arsenal")).toBe(1);
  });

  it("kopplar kupongens liga till rätt källa", () => {
    expect(resolveLeague("Premier League", "England")?.code).toBe("E0");
    expect(resolveLeague("Championship", "England")?.code).toBe("E1");
    expect(resolveLeague("League One")?.code).toBe("E2");
    expect(resolveLeague("Allsvenskan", "Sverige")?.code).toBe("SWE");
    expect(resolveLeague("Premiership", "Skottland")?.code).toBe("SC0");
    expect(resolveLeague("Serie A", "Brasilien")).toBeNull();
    expect(resolveLeague("Okänd liga")).toBeNull();
  });
});
