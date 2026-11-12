import type { Timeline } from '../engine/types';
import { audio, cueForPhase, type AudioEngine, type ScheduledCue } from './AudioEngine';
import type { CueKind } from './cues';

export interface PlannedCue {
  /** Nyckel så att samma signal aldrig läggs två gånger. */
  key: string;
  kind: CueKind;
  /** Sessionstid (ms) då signalen ska låta. */
  atMs: number;
}

/** Hur sent en signal får spelas efter sin tidpunkt (t.ex. precis vid start/fortsätt). */
const LATE_TOLERANCE_MS = 60;
/** Hållningar minst så här långa får nedräkningsticks. */
export const HOLD_TICK_MIN_MS = 10_000;

/**
 * Ren funktion: vilka signaler ska läggas inom [elapsed, elapsed + lookahead]?
 * Signaler i nedräkningen (3-2-1) och slutsignalen räknas också med.
 */
export function planCues(
  timeline: Timeline,
  elapsedMs: number,
  lookaheadMs: number,
  already: ReadonlySet<string>,
): PlannedCue[] {
  const from = elapsedMs - LATE_TOLERANCE_MS;
  const to = elapsedMs + lookaheadMs;
  const out: PlannedCue[] = [];
  const add = (key: string, kind: CueKind, atMs: number) => {
    if (atMs >= from && atMs < to && !already.has(key)) out.push({ key, kind, atMs });
  };

  for (const p of timeline.phases) {
    if (p.endMs < from) continue;
    if (p.startMs >= to) break;
    if (p.kind === 'prepare') {
      // Tick varje hel sekund i nedräkningen.
      for (let t = p.startMs; t < p.endMs; t += 1000) add(`tick-${t}`, 'tick', t);
      continue;
    }
    const kind = cueForPhase(p.kind);
    if (kind) add(`phase-${p.index}`, kind, p.startMs);
    // Långa hållningar: tick de sista tre sekunderna.
    if ((p.kind === 'holdIn' || p.kind === 'holdOut') && p.durationMs >= HOLD_TICK_MIN_MS) {
      for (let s = 3; s >= 1; s--) add(`hold-${p.index}-${s}`, 'tick', p.endMs - s * 1000);
    }
  }
  add('finish', 'finish', timeline.totalMs);
  return out;
}

/**
 * Lägger signaler på ljudklockan i förväg, så att de träffar fasbytet
 * exakt oavsett hur ojämnt animationsloopen går.
 */
export class CueScheduler {
  private scheduled = new Map<string, ScheduledCue>();
  private lookaheadMs = 1500;

  constructor(
    private readonly timeline: Timeline,
    private readonly engine: AudioEngine = audio,
  ) {}

  /** Anropas regelbundet medan sessionen går. */
  sync(elapsedMs: number): void {
    const ctx = this.engine.context;
    if (!ctx || ctx.state !== 'running') return;
    const nowS = ctx.currentTime;
    for (const cue of planCues(this.timeline, elapsedMs, this.lookaheadMs, new Set(this.scheduled.keys()))) {
      const at = nowS + (cue.atMs - elapsedMs) / 1000;
      const handle = this.engine.scheduleCue(cue.kind, at);
      if (handle) this.scheduled.set(cue.key, handle);
    }
    // Städa bort gamla handtag.
    for (const [key, h] of this.scheduled) if (h.at < nowS - 5) this.scheduled.delete(key);
  }

  /** Vid paus/avbryt: ta bort signaler som ännu inte spelats. */
  cancelPending(): void {
    const ctx = this.engine.context;
    if (!ctx) return;
    const nowS = ctx.currentTime;
    for (const [key, h] of this.scheduled) {
      if (h.at > nowS) {
        this.engine.cancelCue(h);
        this.scheduled.delete(key);
      }
    }
  }
}
