import { WEEK_PROGRAM, EXERCISES } from './exercises.js';

const TRANSITION_REST = 12; // seconds between exercises
const MAX_SESSION_SECONDS = 15 * 60;

export function getTodayProgram(date = new Date()) {
  return WEEK_PROGRAM[date.getDay()];
}

/**
 * Builds the ordered list of steps for today, substituting any leg-region
 * exercise for its low-fatigue alternative when the user has flagged legs
 * as fatigued (e.g. ran or did leg day already).
 */
export function buildSession({ date = new Date(), legsFatigued = false } = {}) {
  const day = getTodayProgram(date);
  const steps = [];

  for (const original of day.blocks) {
    const exercise = legsFatigued && original.region === 'legs' && original.sub
      ? EXERCISES[original.sub]
      : original;

    const sideCount = exercise.sides || 1;
    for (let side = 1; side <= sideCount; side++) {
      steps.push({
        exercise,
        sideLabel: sideCount === 2 ? (side === 1 ? 'Left / Side A' : 'Right / Side B') : null,
        work: exercise.work,
      });
    }
  }

  // Matches SessionRunner's phase layout: a rest gap follows every step
  // except the last, so this total is exactly what the timer will run.
  const totalWorkSeconds = steps.reduce((sum, s) => sum + s.work, 0);
  const totalSeconds = totalWorkSeconds + TRANSITION_REST * Math.max(0, steps.length - 1);

  return {
    theme: day.theme,
    subtitle: day.subtitle,
    steps,
    totalSeconds,
    totalWorkSeconds,
    withinBudget: totalSeconds <= MAX_SESSION_SECONDS,
    transitionRest: TRANSITION_REST,
  };
}

export function formatMinutes(totalSeconds) {
  const mins = Math.round(totalSeconds / 60);
  return `${mins} min`;
}
