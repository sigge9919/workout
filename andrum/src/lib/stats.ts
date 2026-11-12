import type { BoltResult, DailyMetric } from '../db/schema';

export interface DayValue {
  /** Lokalt datum 'YYYY-MM-DD'. */
  date: string;
  /** Lokal midnatt, epok-ms (för tidsaxel). */
  t: number;
  value: number;
}

const DAY_MS = 86_400_000;

export function localDateOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → lokal midnatt i epok-ms. */
export function parseLocalDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** BOLT per dag (medel om flera mätningar samma dag), äldst först. */
export function dailyBolt(results: BoltResult[]): DayValue[] {
  const byDay = new Map<string, number[]>();
  for (const r of results) {
    const key = localDateOf(r.date);
    const list = byDay.get(key) ?? [];
    list.push(r.seconds);
    byDay.set(key, list);
  }
  return [...byDay.entries()]
    .map(([date, vals]) => ({ date, t: parseLocalDate(date), value: round1(vals.reduce((a, b) => a + b, 0) / vals.length) }))
    .sort((a, b) => a.t - b.t);
}

/** Dagsvärden som serie för ett fält, äldst först. Dagar utan värde utelämnas. */
export function metricSeries(metrics: DailyMetric[], field: 'restingHr' | 'hrv'): DayValue[] {
  return metrics
    .filter((m) => typeof m[field] === 'number')
    .map((m) => ({ date: m.date, t: parseLocalDate(m.date), value: m[field] as number }))
    .sort((a, b) => a.t - b.t);
}

export interface PeriodSummary {
  latest?: { value: number; t: number };
  best?: number;
  /** Medel senaste 7 dygnen. */
  avg7?: number;
  /** Förändring mot de 7 dygnen innan (avg7 − föregående). */
  delta7?: number;
  count: number;
}

/**
 * Sammanfattning av mätningar. `higherIsBetter` styr vad som är "bäst"
 * (BOLT, HRV: högre; vilopuls: lägre).
 */
export function summarize(points: Array<{ t: number; value: number }>, now: number, higherIsBetter = true): PeriodSummary {
  if (!points.length) return { count: 0 };
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const last = sorted[sorted.length - 1];
  const values = sorted.map((p) => p.value);
  const inRange = (from: number, to: number) => sorted.filter((p) => p.t > from && p.t <= to).map((p) => p.value);
  const recent = inRange(now - 7 * DAY_MS, now);
  const previous = inRange(now - 14 * DAY_MS, now - 7 * DAY_MS);
  const avg7 = recent.length ? round1(mean(recent)) : undefined;
  const prev = previous.length ? mean(previous) : undefined;
  return {
    latest: { value: last.value, t: last.t },
    best: higherIsBetter ? Math.max(...values) : Math.min(...values),
    avg7,
    delta7: avg7 !== undefined && prev !== undefined ? round1(avg7 - prev) : undefined,
    count: points.length,
  };
}

/** Grov vägledning för BOLT – inte medicinsk bedömning. */
export function boltLevel(seconds: number): { label: string; text: string } {
  if (seconds < 10) return { label: 'Låg', text: 'Mycket att vinna på lugn näsandning och CO2-träning.' };
  if (seconds < 20) return { label: 'Under medel', text: 'Vanligt hos aktiva också. Regelbunden träning brukar ge snabb förbättring.' };
  if (seconds < 30) return { label: 'Medel', text: 'Bra grund. Fortsätt med lugn näsandning i vardagen.' };
  if (seconds < 40) return { label: 'Bra', text: 'God tolerans för koldioxid.' };
  return { label: 'Mycket bra', text: 'Hög tolerans – fokus på att behålla nivån.' };
}

export interface MetricInput {
  date: string;
  restingHr?: string | number;
  hrv?: string | number;
}

export const RESTING_HR_RANGE = [25, 150] as const;
export const HRV_RANGE = [1, 300] as const;

/** Kontrollerar och tolkar ett dagsvärde från formuläret. Kastar Error med svensk text. */
export function parseDailyMetric(input: MetricInput): DailyMetric {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(parseLocalDate(input.date))) {
    throw new Error('Välj ett datum.');
  }
  const num = (v: string | number | undefined, name: string, [min, max]: readonly [number, number]) => {
    if (v === undefined || v === '') return undefined;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} måste vara mellan ${min} och ${max}.`);
    return Math.round(n);
  };
  const restingHr = num(input.restingHr, 'Vilopuls', RESTING_HR_RANGE);
  const hrv = num(input.hrv, 'HRV', HRV_RANGE);
  if (restingHr === undefined && hrv === undefined) throw new Error('Fyll i vilopuls, HRV eller båda.');
  return { date: input.date, ...(restingHr !== undefined ? { restingHr } : {}), ...(hrv !== undefined ? { hrv } : {}) };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (x: number) => Math.round(x * 10) / 10;

// ── Sessioner ──────────────────────────────────────────────────────────────

/** Måndag 00:00 lokal tid för veckan som innehåller `ms`. */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // måndag = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** ISO 8601-veckonummer. */
export function isoWeek(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // torsdag samma vecka
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / DAY_MS - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

export interface WeekBucket {
  /** Måndag 00:00, epok-ms. */
  t: number;
  week: number;
  count: number;
  minutes: number;
}

interface SessionLike {
  startedAt: number;
  actualSec: number;
}

/** Antal sessioner och minuter per vecka, de senaste `weeks` veckorna (inkl. denna), äldst först. */
export function sessionsPerWeek(sessions: SessionLike[], now: number, weeks = 12): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  let t = weekStart(now);
  for (let i = 0; i < weeks; i++) {
    buckets.unshift({ t, week: isoWeek(t), count: 0, minutes: 0 });
    const prev = new Date(t);
    prev.setDate(prev.getDate() - 7); // setDate hanterar sommartid
    t = prev.getTime();
  }
  const index = new Map(buckets.map((b, i) => [b.t, i]));
  for (const s of sessions) {
    const i = index.get(weekStart(s.startedAt));
    if (i === undefined) continue;
    buckets[i].count++;
    buckets[i].minutes += s.actualSec / 60;
  }
  for (const b of buckets) b.minutes = Math.round(b.minutes);
  return buckets;
}

export interface Streak {
  /** Dagar i rad fram till idag (eller igår, om idag inte är gjord än). */
  current: number;
  longest: number;
  /** Om dagens session är gjord. */
  doneToday: boolean;
}

/** Streak = dagar i rad med minst en session. */
export function streak(sessions: SessionLike[], now: number): Streak {
  const days = new Set(sessions.map((s) => localDateOf(s.startedAt)));
  const today = localDateOf(now);
  const dayBefore = (date: string) => {
    const d = new Date(parseLocalDate(date));
    d.setDate(d.getDate() - 1);
    return localDateOf(d.getTime());
  };

  const doneToday = days.has(today);
  let current = 0;
  let cursor = doneToday ? today : dayBefore(today);
  while (days.has(cursor)) {
    current++;
    cursor = dayBefore(cursor);
  }

  let longest = 0;
  for (const day of days) {
    if (days.has(dayBefore(day))) continue; // inte början på en svit
    let len = 0;
    let c = day;
    while (days.has(c)) {
      len++;
      const d = new Date(parseLocalDate(c));
      d.setDate(d.getDate() + 1);
      c = localDateOf(d.getTime());
    }
    longest = Math.max(longest, len);
  }
  return { current, longest, doneToday };
}

export interface RatingEffect {
  /** Antal skattade sessioner. */
  n: number;
  energy?: number;
  stress?: number;
  focus?: number;
}

type Rated = { before?: { energy: number; stress: number; focus: number }; after?: { energy: number; stress: number; focus: number } };

/** Medelförändring (efter − före) per mått över skattade sessioner. */
export function ratingEffect(sessions: Rated[]): RatingEffect {
  const rated = sessions.filter((s) => s.before && s.after);
  if (!rated.length) return { n: 0 };
  const avg = (k: 'energy' | 'stress' | 'focus') =>
    round1(rated.reduce((sum, s) => sum + (s.after![k] - s.before![k]), 0) / rated.length);
  return { n: rated.length, energy: avg('energy'), stress: avg('stress'), focus: avg('focus') };
}
