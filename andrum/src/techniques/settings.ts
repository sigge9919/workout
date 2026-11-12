import { breathsPerMinute } from '../engine/timeline';
import type { CompileOptions, Technique } from '../engine/types';

/**
 * Användarens val för en session. Bara de fält tekniken tillåter att
 * justera finns med. Serialiseras till URL:en (?bpm=5.5&min=10) så att
 * snabbval och program kan länka direkt till en inställd session.
 */
export interface SessionSettings {
  bpm?: number;
  minutes?: number;
  cycles?: number;
  rounds?: number;
  hold?: number;
}

const KEYS = ['bpm', 'minutes', 'cycles', 'rounds', 'hold'] as const;
const PARAM: Record<(typeof KEYS)[number], string> = {
  bpm: 'bpm',
  minutes: 'min',
  cycles: 'cykler',
  rounds: 'rundor',
  hold: 'hall',
};

export function defaultSettings(t: Technique): SessionSettings {
  const a = t.adjustable ?? {};
  const s: SessionSettings = {};
  if (a.breathsPerMinute) s.bpm = a.breathsPerMinute.default;
  if (a.duration && t.length.mode === 'duration') s.minutes = t.length.seconds / 60;
  if (a.cycles && t.length.mode === 'cycles') s.cycles = t.length.count;
  if (a.rounds && t.rounds) s.rounds = t.rounds.count;
  if (a.holdSeconds && t.rounds?.hold) s.hold = t.rounds.hold.seconds;
  return s;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const snap = (v: number, step: number, base: number) => Math.round((v - base) / step) * step + base;

/** Tvingar värden inom teknikens tillåtna intervall. Okända fält tas bort. */
export function clampSettings(t: Technique, input: SessionSettings): SessionSettings {
  const a = t.adjustable ?? {};
  const s = { ...defaultSettings(t) };
  const ok = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
  if (a.breathsPerMinute && ok(input.bpm)) {
    const r = a.breathsPerMinute;
    s.bpm = round2(clamp(snap(input.bpm, r.step, r.min), r.min, r.max));
  }
  if (a.duration && ok(input.minutes) && s.minutes !== undefined) {
    s.minutes = clamp(Math.round(input.minutes), a.duration.minMinutes, a.duration.maxMinutes);
  }
  if (a.cycles && ok(input.cycles) && s.cycles !== undefined) {
    s.cycles = clamp(Math.round(input.cycles), a.cycles.min, a.cycles.max);
  }
  if (a.rounds && ok(input.rounds) && s.rounds !== undefined) {
    s.rounds = clamp(Math.round(input.rounds), a.rounds.min, a.rounds.max);
  }
  if (a.holdSeconds && ok(input.hold) && s.hold !== undefined) {
    const r = a.holdSeconds;
    s.hold = clamp(snap(input.hold, r.step, r.min), r.min, r.max);
  }
  return s;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function toCompileOptions(s: SessionSettings): CompileOptions {
  return {
    breathsPerMinute: s.bpm,
    durationSeconds: s.minutes !== undefined ? s.minutes * 60 : undefined,
    cycles: s.cycles,
    rounds: s.rounds,
    holdSeconds: s.hold,
  };
}

export function settingsFromParams(params: URLSearchParams): SessionSettings {
  const s: SessionSettings = {};
  for (const k of KEYS) {
    const raw = params.get(PARAM[k]);
    if (raw === null || raw === '') continue;
    const v = Number(raw.replace(',', '.'));
    if (Number.isFinite(v)) s[k] = v;
  }
  return s;
}

export function settingsToParams(s: SessionSettings): string {
  const p = new URLSearchParams();
  for (const k of KEYS) if (s[k] !== undefined) p.set(PARAM[k], String(s[k]));
  const str = p.toString();
  return str ? `?${str}` : '';
}

/** Teknikens tempo i andetag/min (efter eventuell justering). */
export function effectiveBpm(t: Technique, s: SessionSettings): number {
  return s.bpm ?? breathsPerMinute(t.cycle);
}
