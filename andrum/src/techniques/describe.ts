import type { PhaseKind, PhaseSpec, Technique } from '../engine/types';
import { scaleCycle } from '../engine/timeline';
import { formatNumber } from '../lib/format';
import type { SessionSettings } from './settings';

export const SHORT_LABELS: Record<PhaseKind, string> = {
  prepare: 'Redo',
  inhale: 'In',
  inhale2: 'Fyll',
  holdIn: 'Håll',
  exhale: 'Ut',
  holdOut: 'Håll',
  rest: 'Vila',
};

/** Cykeln med eventuellt justerat tempo. */
export function effectiveCycle(t: Technique, s: SessionSettings): PhaseSpec[] {
  return s.bpm !== undefined ? scaleCycle(t.cycle, s.bpm) : t.cycle;
}

/** "4 · 7 · 8" – sekunder per fas. */
export function cycleDigits(cycle: PhaseSpec[]): string {
  return cycle.map((p) => formatNumber(p.seconds)).join(' · ');
}

/** Kort beskrivning av upplägget, t.ex. "6 rundor · 5 andetag + håll 15→40 s". */
export function structureSummary(t: Technique, s: SessionSettings): string {
  if (t.rounds) {
    const rounds = s.rounds ?? t.rounds.count;
    const parts = [`${rounds} ${rounds === 1 ? 'runda' : 'rundor'}`, `${t.rounds.cyclesPerRound} andetag`];
    const h = t.rounds.hold;
    if (h) {
      const first = s.hold ?? h.seconds;
      const last = first + (h.incrementSeconds ?? 0) * (rounds - 1);
      const where = h.after === 'inhale' ? 'fulla lungor' : 'tomma lungor';
      parts[1] += ` + håll ${first === last ? first : `${first}→${last}`} s (${where})`;
    }
    if (t.rounds.restSeconds > 0) parts.push(`${t.rounds.restSeconds} s vila`);
    return parts.join(' · ');
  }
  if (t.length.mode === 'cycles') {
    const n = s.cycles ?? t.length.count;
    return `${n} andetag`;
  }
  const bpm = 60 / effectiveCycle(t, s).reduce((a, p) => a + p.seconds, 0);
  return `${formatNumber(bpm)} andetag/min`;
}
