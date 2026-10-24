// Lagnamn skrivs olika hos varje källa ("Manchester U", "Man United",
// "Manchester United"). Här normaliseras de och matchas mot en kandidatlista.

/** Kända förkortningar och smeknamn -> gemensam nyckel. */
const ALIASES: Record<string, string> = {
  "man utd": "manchester united",
  "man united": "manchester united",
  "manchester u": "manchester united",
  "man city": "manchester city",
  "manchester c": "manchester city",
  "nottm forest": "nottingham forest",
  "nott m forest": "nottingham forest",
  "nottingham": "nottingham forest",
  "nottingham f": "nottingham forest",
  "spurs": "tottenham",
  "tottenham hotspur": "tottenham",
  "wolves": "wolverhampton",
  "wolverhampton wanderers": "wolverhampton",
  "brighton and hove albion": "brighton",
  "brighton hove albion": "brighton",
  "west ham united": "west ham",
  "newcastle united": "newcastle",
  "leeds united": "leeds",
  "sheffield weds": "sheffield wednesday",
  "sheffield w": "sheffield wednesday",
  "sheff wed": "sheffield wednesday",
  "sheffield u": "sheffield united",
  "sheff utd": "sheffield united",
  "sheffield utd": "sheffield united",
  "qpr": "queens park rangers",
  "west brom": "west bromwich",
  "west bromwich albion": "west bromwich",
  "wba": "west bromwich",
  "mk dons": "milton keynes dons",
  "afc wimbledon": "wimbledon",
  "inter": "internazionale",
  "inter milan": "internazionale",
  "ac milan": "milan",
  "bayern munchen": "bayern munich",
  "fc bayern": "bayern munich",
  "m gladbach": "monchengladbach",
  "borussia monchengladbach": "monchengladbach",
  "b monchengladbach": "monchengladbach",
  "ein frankfurt": "eintracht frankfurt",
  "psg": "paris saint germain",
  "paris sg": "paris saint germain",
  "ath madrid": "atletico madrid",
  "atl madrid": "atletico madrid",
  "ath bilbao": "athletic bilbao",
  "djurgarden": "djurgardens",
  "djurgardens if": "djurgardens",
  "malmo ff": "malmo",
  "ifk goteborg": "goteborg",
  "ifk norrkoping": "norrkoping",
  "bk hacken": "hacken",
  "if elfsborg": "elfsborg",
  "hammarby if": "hammarby",
};

/** Ord som inte skiljer lag åt och därför tas bort. */
const NOISE = new Set(["fc", "afc", "cf", "sc", "the", "club", "and"]);

export function normalizeTeam(name: string): string {
  let s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (ALIASES[s]) return ALIASES[s];
  s = s
    .split(" ")
    .filter((w) => !NOISE.has(w))
    .join(" ");
  return ALIASES[s] ?? s;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/ /g, "");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Likhet 0..1 mellan två lagnamn. */
export function teamSimilarity(a: string, b: string): number {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  // "Sheffield W" mot "Sheffield Wednesday": varje ord i det kortare namnet är
  // ett prefix till motsvarande ord i det längre.
  const wa = na.split(" ");
  const wb = nb.split(" ");
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (short.every((w, i) => long[i]?.startsWith(w))) return 0.9;

  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of ga) {
    overlap += Math.min(n, gb.get(g) ?? 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total ? (2 * overlap) / total : 0;
}

/** Bästa kandidat med likhet minst `threshold`, annars null. */
export function matchTeam(
  name: string,
  candidates: Iterable<string>,
  threshold = 0.6,
): { name: string; score: number } | null {
  let best: { name: string; score: number } | null = null;
  for (const c of candidates) {
    const score = teamSimilarity(name, c);
    if (score >= threshold && (!best || score > best.score)) best = { name: c, score };
  }
  return best;
}
