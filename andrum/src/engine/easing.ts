import type { TimelinePhase } from './types';

/** Mjuk start och landning – känns som ett naturligt andetag. */
export function easeInOutSine(x: number): number {
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Cirkelns nivå 0..1 vid en given position i en fas. */
export function levelAt(phase: TimelinePhase, progress: number): number {
  const p = clamp01(progress);
  if (phase.fromLevel === phase.toLevel) return phase.fromLevel;
  return phase.fromLevel + (phase.toLevel - phase.fromLevel) * easeInOutSine(p);
}
