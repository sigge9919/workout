import type { SessionRecord } from '../db/schema';
import { localDateOf, parseLocalDate } from '../lib/stats';
import { settingsToParams } from '../techniques/settings';
import type { Program, ProgramDay } from './types';

/** Hela kalenderdagar från a till b ('YYYY-MM-DD'). Säkert över sommartid. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocalDate(b) - parseLocalDate(a)) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  const d = new Date(parseLocalDate(date));
  d.setDate(d.getDate() + n);
  return localDateOf(d.getTime());
}

export function programLength(p: Program): number {
  return p.weeks.length * 7;
}

export interface ProgramPosition {
  status: 'upcoming' | 'active' | 'finished';
  /** Dag i programmet, 0-baserad (inom varvet om programmet upprepas). */
  index: number;
  /** Dag 1… för visning. */
  dayNumber: number;
  week: number;
  totalDays: number;
  /** Antal varv om programmet upprepas (0 = första). */
  lap: number;
  day: ProgramDay | null;
  /** Dagar kvar till start (upcoming). */
  daysUntilStart: number;
}

/** Var i programmet är vi på ett visst datum? */
export function programPosition(p: Program, startDate: string, date: string): ProgramPosition {
  const total = programLength(p);
  const offset = daysBetween(startDate, date);
  if (offset < 0) {
    return { status: 'upcoming', index: 0, dayNumber: 1, week: 1, totalDays: total, lap: 0, day: dayAt(p, 0), daysUntilStart: -offset };
  }
  if (offset >= total && !p.repeat) {
    return { status: 'finished', index: total - 1, dayNumber: total, week: p.weeks.length, totalDays: total, lap: 0, day: null, daysUntilStart: 0 };
  }
  const index = offset % total;
  return {
    status: 'active',
    index,
    dayNumber: index + 1,
    week: Math.floor(index / 7) + 1,
    totalDays: total,
    lap: Math.floor(offset / total),
    day: dayAt(p, index),
    daysUntilStart: 0,
  };
}

export function dayAt(p: Program, index: number): ProgramDay | null {
  return p.weeks[Math.floor(index / 7)]?.days[index % 7] ?? null;
}

/** Startdatum för ett program som förankras i en händelse (t.ex. matchdag). */
export function startDateForAnchor(p: Program, eventDate: string): string {
  return addDays(eventDate, -(p.anchor?.dayIndex ?? 0));
}

/** Datumet för förankringshändelsen i aktuellt varv (t.ex. nästa matchdag). */
export function anchorDate(p: Program, startDate: string, today: string): string | null {
  if (!p.anchor) return null;
  const total = programLength(p);
  const offset = Math.max(0, daysBetween(startDate, today));
  const lapStart = addDays(startDate, offset - (offset % total));
  return addDays(lapStart, p.anchor.dayIndex);
}

/** Länk till sessionen med programmets förval. */
export function sessionLink(day: ProgramDay, programId: string, dayNumber: number): string {
  const params = new URLSearchParams(settingsToParams(day.settings ?? {}).replace(/^\?/, ''));
  params.set('program', programId);
  params.set('dag', String(dayNumber));
  return `/teknik/${day.techniqueId}?${params.toString()}`;
}

/** Har dagens programsession gjorts? Räknar sessioner på datumet med samma program och dag, eller samma teknik. */
export function isDayDone(
  sessions: Pick<SessionRecord, 'startedAt' | 'techniqueId' | 'programId' | 'programDay' | 'completed'>[],
  date: string,
  programId: string,
  dayNumber: number,
  day: ProgramDay | null,
): boolean {
  if (!day) return false;
  return sessions.some(
    (s) =>
      localDateOf(s.startedAt) === date &&
      s.completed &&
      ((s.programId === programId && s.programDay === dayNumber) || s.techniqueId === day.techniqueId),
  );
}

/** Förslag när inget program är aktivt, efter tid på dygnet. */
export function suggestionForHour(hour: number): { techniqueId: string; reason: string } {
  if (hour < 10) return { techniqueId: 'resonance', reason: 'Lugn start på dagen' };
  if (hour < 17) return { techniqueId: 'box', reason: 'Fokus mitt på dagen' };
  if (hour < 21) return { techniqueId: 'cooldown', reason: 'Varva ner efter dagens träning' };
  return { techniqueId: '478', reason: 'Inför sömnen' };
}
