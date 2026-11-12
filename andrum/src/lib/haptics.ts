import type { PhaseKind } from '../engine/types';

/** Vibration stöds i Android/Chrome. iOS Safari saknar API:t – då händer inget. */
export const vibrationSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

const PATTERNS: Partial<Record<PhaseKind, number | number[]>> = {
  inhale: 40,
  inhale2: 25,
  exhale: [20, 60, 20],
  holdIn: [10, 40, 10, 40, 10],
  holdOut: [10, 40, 10, 40, 10],
  rest: 80,
};

export function vibrateForPhase(kind: PhaseKind): void {
  const p = PATTERNS[kind];
  if (vibrationSupported && p !== undefined) navigator.vibrate(p);
}
