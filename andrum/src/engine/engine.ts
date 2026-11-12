import { systemClock, type Clock } from './clock';
import { levelAt } from './easing';
import { phaseIndexAt } from './timeline';
import type { EngineState, EngineStatus, Timeline, TimelinePhase } from './types';

/**
 * Ren funktion: sessionens tillstånd vid en given förfluten tid.
 * All visning (text, nedräkning, cirkel) härleds härifrån – inga
 * intervalltimrar som kan glida isär.
 */
export function stateAt(timeline: Timeline, elapsedMs: number, status: EngineStatus = 'running'): EngineState {
  const totalMs = timeline.totalMs;
  const elapsed = Math.min(Math.max(elapsedMs, 0), totalMs);
  const idx = phaseIndexAt(timeline, elapsed);
  const phase = idx >= 0 && idx < timeline.phases.length ? timeline.phases[idx] : null;

  if (!phase) {
    const lastLevel = timeline.phases.at(-1)?.toLevel ?? 0;
    return {
      status: elapsed >= totalMs && status === 'running' ? 'finished' : status,
      elapsedMs: elapsed,
      remainingMs: totalMs - elapsed,
      totalMs,
      phase: null,
      phaseElapsedMs: 0,
      phaseRemainingMs: 0,
      phaseProgress: 1,
      level: lastLevel,
    };
  }

  const phaseElapsedMs = elapsed - phase.startMs;
  const phaseProgress = phase.durationMs > 0 ? phaseElapsedMs / phase.durationMs : 1;
  return {
    status,
    elapsedMs: elapsed,
    remainingMs: totalMs - elapsed,
    totalMs,
    phase,
    phaseElapsedMs,
    phaseRemainingMs: phase.endMs - elapsed,
    phaseProgress,
    level: levelAt(phase, phaseProgress),
  };
}

export type EngineEvent =
  | { type: 'phase'; phase: TimelinePhase; previous: TimelinePhase | null }
  | { type: 'status'; status: EngineStatus };

type Listener = (event: EngineEvent) => void;

/**
 * Sessionsmotor. Tid = klockans nu − starttid − total paustid.
 * `tick()` anropas från en animationsloop (eller i tester) och skickar
 * händelser när fasen byts. Själva tillståndet beror bara på tiden.
 */
export class SessionEngine {
  private status: EngineStatus = 'idle';
  private startedAt = 0;
  private pausedAt = 0;
  private pausedTotal = 0;
  private lastPhaseIndex = -1;
  private listeners = new Set<Listener>();

  constructor(
    readonly timeline: Timeline,
    private readonly clock: Clock = systemClock,
  ) {}

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  /** Förfluten sessionstid i ms (står still under paus). */
  elapsed(): number {
    switch (this.status) {
      case 'idle':
        return 0;
      case 'paused':
      case 'stopped':
        return Math.min(this.pausedAt - this.startedAt - this.pausedTotal, this.timeline.totalMs);
      case 'finished':
        return this.timeline.totalMs;
      case 'running':
        return Math.min(this.clock.now() - this.startedAt - this.pausedTotal, this.timeline.totalMs);
    }
  }

  start(): void {
    if (this.status !== 'idle') return;
    this.startedAt = this.clock.now();
    this.pausedTotal = 0;
    this.setStatus('running');
    this.tick();
  }

  pause(): void {
    if (this.status !== 'running') return;
    // Kör ikapp först så att inga fasbyten före pausen tappas.
    this.tick();
    if (this.status !== 'running') return;
    this.pausedAt = this.clock.now();
    this.setStatus('paused');
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.pausedTotal += this.clock.now() - this.pausedAt;
    this.setStatus('running');
    this.tick();
  }

  stop(): void {
    if (this.status === 'idle' || this.status === 'finished' || this.status === 'stopped') return;
    if (this.status === 'running') this.pausedAt = this.clock.now();
    this.setStatus('stopped');
  }

  /** Aktuellt tillstånd. Skickar fas-/statushändelser vid behov. */
  tick(): EngineState {
    const elapsed = this.elapsed();
    const state = stateAt(this.timeline, elapsed, this.status);

    if (this.status === 'running') {
      const idx = state.phase ? state.phase.index : this.timeline.phases.length;
      if (idx !== this.lastPhaseIndex) {
        const previous = this.lastPhaseIndex >= 0 ? this.timeline.phases[this.lastPhaseIndex] ?? null : null;
        this.lastPhaseIndex = idx;
        if (state.phase) this.emit({ type: 'phase', phase: state.phase, previous });
      }
      if (elapsed >= this.timeline.totalMs) {
        this.setStatus('finished');
        return { ...state, status: 'finished' };
      }
    }
    return state;
  }

  private setStatus(status: EngineStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit({ type: 'status', status });
  }

  private emit(event: EngineEvent): void {
    for (const l of this.listeners) l(event);
  }
}
