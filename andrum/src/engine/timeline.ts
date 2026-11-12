import type {
  CompileOptions,
  PhaseKind,
  PhaseSpec,
  RoundsSpec,
  Technique,
  Timeline,
  TimelinePhase,
} from './types';

export const DEFAULT_LABELS: Record<PhaseKind, string> = {
  prepare: 'Gör dig redo',
  inhale: 'Andas in',
  inhale2: 'Fyll på',
  holdIn: 'Håll',
  exhale: 'Andas ut',
  holdOut: 'Håll andan',
  rest: 'Andas fritt',
};

/** Nivå efter första inandningen när en extra påfyllning följer. */
const PARTIAL_INHALE_LEVEL = 0.72;
const DEFAULT_LEAD_IN_S = 3;
/** Avslutande utandning om sista rundan slutar med full hållning. */
const FINAL_EXHALE_S = 4;

export class TechniqueError extends Error {}

/** Längd på en cykel i sekunder. */
export function cycleSeconds(cycle: PhaseSpec[]): number {
  return cycle.reduce((sum, p) => sum + p.seconds, 0);
}

/** Tempo i andetag per minut för en cykel. */
export function breathsPerMinute(cycle: PhaseSpec[]): number {
  return 60 / cycleSeconds(cycle);
}

/** Skalar en cykel till ett nytt tempo med bibehållna proportioner. */
export function scaleCycle(cycle: PhaseSpec[], bpm: number): PhaseSpec[] {
  if (!(bpm > 0) || !Number.isFinite(bpm)) throw new TechniqueError('Ogiltigt tempo');
  const factor = 60 / bpm / cycleSeconds(cycle);
  return cycle.map((p) => ({ ...p, seconds: p.seconds * factor }));
}

export function validateTechnique(t: Technique): void {
  const bad = (msg: string) => {
    throw new TechniqueError(`${t.id || 'teknik'}: ${msg}`);
  };
  if (!t.id) bad('saknar id');
  if (!t.cycle.length) bad('cykeln är tom');
  for (const p of t.cycle) {
    if (!(p.seconds > 0) || !Number.isFinite(p.seconds)) bad(`fasen ${p.kind} har ogiltig längd`);
  }
  if (t.cycle[0].kind !== 'inhale') bad('cykeln måste börja med en inandning');
  if (!t.cycle.some((p) => p.kind === 'exhale')) bad('cykeln saknar utandning');
  if (t.rounds) {
    const r = t.rounds;
    if (!(r.count >= 1) || !Number.isInteger(r.count)) bad('ogiltigt antal rundor');
    if (!(r.cyclesPerRound >= 1) || !Number.isInteger(r.cyclesPerRound)) bad('ogiltigt antal cykler per runda');
    if (!(r.restSeconds >= 0)) bad('ogiltig vila');
    if (r.hold && !(r.hold.seconds > 0)) bad('ogiltig hållning');
  } else if (t.length.mode === 'duration') {
    if (!(t.length.seconds > 0)) bad('ogiltig längd');
  } else if (!(t.length.count >= 1) || !Number.isInteger(t.length.count)) {
    bad('ogiltigt antal cykler');
  }
}

interface RawPhase {
  kind: PhaseKind;
  label: string;
  /** Exakt längd i ms (kan vara decimaltal). */
  ms: number;
  round: number;
  cycle: number;
}

/**
 * Kompilerar en teknik till en platt tidslinje.
 *
 * Gränserna räknas ur den exakta kumulativa summan och avrundas därefter till
 * hela ms. Avrundningsfel kan därför aldrig ackumuleras: varje fasgräns ligger
 * högst 0,5 ms från sin exakta position, även efter hundratals andetag.
 */
export function compileTimeline(technique: Technique, options: CompileOptions = {}): Timeline {
  validateTechnique(technique);

  const cycle =
    options.breathsPerMinute !== undefined
      ? scaleCycle(technique.cycle, options.breathsPerMinute)
      : technique.cycle;
  const cycleMs = cycleSeconds(cycle) * 1000;

  const raw: RawPhase[] = [];
  let cycleNo = 0;

  const pushCycle = (round: number) => {
    for (const p of cycle) {
      raw.push({
        kind: p.kind,
        label: p.label ?? DEFAULT_LABELS[p.kind],
        ms: p.seconds * 1000,
        round,
        cycle: cycleNo,
      });
    }
    cycleNo++;
  };

  const leadInS = options.leadInSeconds ?? DEFAULT_LEAD_IN_S;
  if (leadInS > 0) {
    raw.push({ kind: 'prepare', label: DEFAULT_LABELS.prepare, ms: leadInS * 1000, round: 0, cycle: -1 });
  }

  let roundCount = 1;
  if (technique.rounds) {
    const r: RoundsSpec = {
      ...technique.rounds,
      count: Math.max(1, Math.floor(options.rounds ?? technique.rounds.count)),
      hold:
        technique.rounds.hold && options.holdSeconds !== undefined
          ? { ...technique.rounds.hold, seconds: options.holdSeconds }
          : technique.rounds.hold,
    };
    if (r.hold && !(r.hold.seconds > 0)) throw new TechniqueError('Ogiltig hållning');
    roundCount = r.count;
    for (let round = 0; round < r.count; round++) {
      for (let c = 0; c < r.cyclesPerRound; c++) pushCycle(round);
      if (r.hold) {
        const holdS = r.hold.seconds + (r.hold.incrementSeconds ?? 0) * round;
        if (r.hold.after === 'inhale') {
          const inhaleS = cycle.find((p) => p.kind === 'inhale')!.seconds;
          raw.push({ kind: 'inhale', label: 'Andas in djupt', ms: inhaleS * 1000, round, cycle: -1 });
          raw.push({ kind: 'holdIn', label: DEFAULT_LABELS.holdIn, ms: holdS * 1000, round, cycle: -1 });
        } else {
          raw.push({ kind: 'holdOut', label: DEFAULT_LABELS.holdOut, ms: holdS * 1000, round, cycle: -1 });
        }
      }
      const last = round === r.count - 1;
      if (!last && r.restSeconds > 0) {
        raw.push({ kind: 'rest', label: DEFAULT_LABELS.rest, ms: r.restSeconds * 1000, round, cycle: -1 });
      }
      if (last && r.hold?.after === 'inhale') {
        raw.push({ kind: 'exhale', label: 'Släpp ut', ms: FINAL_EXHALE_S * 1000, round, cycle: -1 });
      }
    }
  } else {
    let cycles: number;
    if (technique.length.mode === 'cycles') {
      cycles = options.cycles ?? technique.length.count;
    } else {
      const durationMs = (options.durationSeconds ?? technique.length.seconds) * 1000;
      // Hela cykler: sessionen slutar alltid efter en avslutad utandning.
      cycles = Math.round(durationMs / cycleMs);
    }
    cycles = Math.max(1, Math.floor(cycles));
    for (let c = 0; c < cycles; c++) pushCycle(0);
  }

  // Exakta gränser → heltals-ms utan ackumulerat fel.
  const phases: TimelinePhase[] = [];
  let exact = 0;
  let level = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const startMs = Math.round(exact);
    exact += r.ms;
    const endMs = Math.round(exact);
    const fromLevel = level;
    const toLevel = targetLevel(r.kind, raw[i + 1]?.kind, level);
    level = toLevel;
    phases.push({
      index: i,
      kind: r.kind,
      label: r.label,
      startMs,
      endMs,
      durationMs: endMs - startMs,
      round: r.round,
      cycle: r.cycle,
      fromLevel,
      toLevel,
    });
  }

  const totalMs = phases.length ? phases[phases.length - 1].endMs : 0;
  const leadInMs = phases[0]?.kind === 'prepare' ? phases[0].endMs : 0;

  return {
    techniqueId: technique.id,
    phases,
    totalMs,
    breathingMs: totalMs - leadInMs,
    roundCount,
  };
}

function targetLevel(kind: PhaseKind, next: PhaseKind | undefined, current: number): number {
  switch (kind) {
    case 'inhale':
      return next === 'inhale2' ? Math.max(current, PARTIAL_INHALE_LEVEL) : 1;
    case 'inhale2':
      return 1;
    case 'exhale':
    case 'rest':
    case 'prepare':
      return 0;
    case 'holdIn':
    case 'holdOut':
      return current;
  }
}

/**
 * Index för fasen som gäller vid `elapsedMs` (start inklusive, slut exklusive).
 * Returnerar -1 före start och phases.length efter slut.
 */
export function phaseIndexAt(timeline: Timeline, elapsedMs: number): number {
  const { phases } = timeline;
  if (elapsedMs < 0) return -1;
  if (elapsedMs >= timeline.totalMs) return phases.length;
  let lo = 0;
  let hi = phases.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (phases[mid].startMs <= elapsedMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
