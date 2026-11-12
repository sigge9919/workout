// Kopplar kupongens liganamn till koder hos football-data.co.uk och The Odds API.

export interface LeagueInfo {
  /** Intern kod, samma som football-data.co.uk använder (E0, SWE, ...). */
  code: string;
  name: string;
  /**
   * "season": en fil per säsong (mmz4281/2627/E0.csv), med skott.
   * "all": en fil med alla säsonger (new/SWE.csv), utan skott.
   */
  format: "season" | "all";
  /** Kalenderårssäsong (Norden) i stället för höst–vår. */
  calendarYear: boolean;
  oddsApiKey?: string;
  /** Lowercase-mönster som matchar kupongens liga- och landsnamn. */
  patterns: { league: RegExp; country?: RegExp }[];
}

export const LEAGUES: LeagueInfo[] = [
  {
    code: "E0",
    name: "Premier League",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_epl",
    patterns: [{ league: /premier league/, country: /england|^$/ }],
  },
  {
    code: "E1",
    name: "Championship",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_efl_champ",
    patterns: [{ league: /championship/ }],
  },
  {
    code: "E2",
    name: "League One",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_england_league1",
    patterns: [{ league: /league one|league 1\b/ }],
  },
  {
    code: "E3",
    name: "League Two",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_england_league2",
    patterns: [{ league: /league two|league 2\b/ }],
  },
  {
    code: "EC",
    name: "National League",
    format: "season",
    calendarYear: false,
    patterns: [{ league: /national league/ }],
  },
  {
    code: "SC0",
    name: "Scottish Premiership",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_spl",
    patterns: [{ league: /premiership/, country: /skottland|scotland/ }],
  },
  {
    code: "D1",
    name: "Bundesliga",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_germany_bundesliga",
    patterns: [{ league: /^bundesliga$/, country: /tyskland|germany|^$/ }],
  },
  {
    code: "D2",
    name: "2. Bundesliga",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_germany_bundesliga2",
    patterns: [{ league: /2\.? bundesliga/ }],
  },
  {
    code: "I1",
    name: "Serie A",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_italy_serie_a",
    patterns: [{ league: /serie a/, country: /italien|italy|^$/ }],
  },
  {
    code: "SP1",
    name: "La Liga",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_spain_la_liga",
    patterns: [{ league: /la ?liga|primera division/ }],
  },
  {
    code: "F1",
    name: "Ligue 1",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_france_ligue_one",
    patterns: [{ league: /ligue 1/ }],
  },
  {
    code: "N1",
    name: "Eredivisie",
    format: "season",
    calendarYear: false,
    oddsApiKey: "soccer_netherlands_eredivisie",
    patterns: [{ league: /eredivisie/ }],
  },
  {
    code: "SWE",
    name: "Allsvenskan",
    format: "all",
    calendarYear: true,
    oddsApiKey: "soccer_sweden_allsvenskan",
    patterns: [{ league: /allsvenskan/ }],
  },
  {
    code: "SWE2",
    name: "Superettan",
    format: "all",
    calendarYear: true,
    oddsApiKey: "soccer_sweden_superettan",
    // football-data.co.uk saknar Superettan; bara odds finns.
    patterns: [{ league: /superettan/ }],
  },
  {
    code: "NOR",
    name: "Eliteserien",
    format: "all",
    calendarYear: true,
    oddsApiKey: "soccer_norway_eliteserien",
    patterns: [{ league: /eliteserien/ }],
  },
  {
    code: "DNK",
    name: "Superligaen",
    format: "all",
    calendarYear: false,
    oddsApiKey: "soccer_denmark_superliga",
    patterns: [{ league: /superliga/, country: /danmark|denmark|^$/ }],
  },
];

/** Ligor där football-data.co.uk inte har någon resultatfil. */
export const NO_RESULTS_FILE = new Set(["SWE2"]);

export function resolveLeague(league: string, country = ""): LeagueInfo | null {
  const l = league.trim().toLowerCase();
  const c = country.trim().toLowerCase();
  for (const info of LEAGUES) {
    for (const p of info.patterns) {
      if (p.league.test(l) && (!p.country || p.country.test(c))) return info;
    }
  }
  return null;
}
