// Domäntyper som delas av alla källor. Sannolikheter och streck är andelar 0..1.

export type Sign = "1" | "X" | "2";

export interface Triple {
  home: number;
  draw: number;
  away: number;
}

/** Decimalodds för 1/X/2. */
export type Odds1X2 = Triple;

export interface CouponMatch {
  /** 1..13 på kupongen. */
  eventNumber: number;
  home: string;
  away: string;
  league: string;
  country?: string;
  /** ISO 8601. */
  kickoff: string;
  /** Odds som Svenska Spel visar på kupongen. */
  odds?: Odds1X2;
  /** Svenska folkets streck (andelar som summerar till ~1). */
  streck?: Triple;
  /** Tio tidningars tips, antal tidningar per tecken. */
  newspaperTips?: Triple;
}

export interface Coupon {
  drawNumber: number;
  /** Spelstopp, ISO 8601. */
  closeTime: string;
  matches: CouponMatch[];
  /** Total omsättning i kronor om källan anger den. */
  turnover?: number;
  source: string;
}

/** Ett spelat matchresultat från historiken. */
export interface MatchResult {
  /** YYYY-MM-DD */
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  homeShots?: number;
  awayShots?: number;
  homeShotsOnTarget?: number;
  awayShotsOnTarget?: number;
  /** Stängningsodds (snitt över bookmakers) om filen har dem. */
  closingOdds?: Odds1X2;
}

export interface LeagueHistory {
  leagueCode: string;
  results: MatchResult[];
  /** Alla lagnamn som förekommer i historiken. */
  teams: string[];
}

export interface MarketOdds {
  /** Snittodds över bookmakers. */
  average: Odds1X2;
  bookmakers: number;
  /** Bookmakerns namn och odds, för transparens. */
  byBookmaker: { name: string; odds: Odds1X2 }[];
  commenceTime: string;
}

export type Importance = "nyckelspelare" | "ordinarie" | "bredd";

export interface Absence {
  player: string;
  reason: "skada" | "avstängning" | "annat";
  importance: Importance;
  status: "borta" | "osäker";
}

export interface TeamNews {
  absences: Absence[];
  managerChange: string | null;
  motivation: string;
  /** −2 (inget att spela för) .. +2 (allt att spela för). */
  motivationScore: number;
  /** Rotation, matchtäthet, resor. −2 (kraftig påverkan) .. 0. */
  fatigueScore: number;
  notes: string;
}

export interface MatchNews {
  home: TeamNews;
  away: TeamNews;
  isDerby: boolean;
  /** Stad där matchen spelas, för väderuppslag. */
  venueCity: string | null;
  summary: string;
  /** 0..1, hur säker Claude är på underlaget. */
  confidence: number;
  sources: string[];
}

export interface Weather {
  temperatureC: number;
  precipitationMm: number;
  windSpeedMs: number;
  location: string;
}

/** Status för en källa i en match. Sparas så att UI:t kan visa flaggor. */
export interface SourceStatus {
  source: string;
  ok: boolean;
  fetchedAt?: string;
  fromCache?: boolean;
  error?: string;
}

export interface MatchData {
  match: CouponMatch;
  leagueCode: string | null;
  /** Matchade lagnamn i resultathistoriken. */
  historyNames?: { home: string; away: string };
  homeResults: MatchResult[];
  awayResults: MatchResult[];
  headToHead: MatchResult[];
  marketOdds?: MarketOdds;
  news?: MatchNews;
  weather?: Weather;
  sources: SourceStatus[];
  /** Klartextflaggor, t.ex. "Odds saknas". */
  flags: string[];
}

export interface DrawData {
  coupon: Coupon;
  couponStatus: SourceStatus;
  matches: MatchData[];
  collectedAt: string;
}
