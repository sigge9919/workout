import type { Technique } from '../types';

const base = {
  purpose: '',
  description: '',
  tags: [],
  hasBreathHold: false,
  builtin: true,
} satisfies Partial<Technique>;

export const box: Technique = {
  ...base,
  id: 'box',
  name: 'Box',
  cycle: [
    { kind: 'inhale', seconds: 4 },
    { kind: 'holdIn', seconds: 4 },
    { kind: 'exhale', seconds: 4 },
    { kind: 'holdOut', seconds: 4 },
  ],
  length: { mode: 'cycles', count: 2 },
  hasBreathHold: true,
};

/** 5,5 andetag/min: 60 / 5,5 / 2 = 5,4545… s per halvcykel. */
export const resonance: Technique = {
  ...base,
  id: 'resonance',
  name: 'Resonans',
  cycle: [
    { kind: 'inhale', seconds: 60 / 5.5 / 2 },
    { kind: 'exhale', seconds: 60 / 5.5 / 2 },
  ],
  length: { mode: 'duration', seconds: 600 },
};

export const sigh: Technique = {
  ...base,
  id: 'sigh',
  name: 'Suck',
  cycle: [
    { kind: 'inhale', seconds: 2 },
    { kind: 'inhale2', seconds: 1 },
    { kind: 'exhale', seconds: 6 },
  ],
  length: { mode: 'cycles', count: 3 },
};

export const co2: Technique = {
  ...base,
  id: 'co2',
  name: 'CO2',
  cycle: [
    { kind: 'inhale', seconds: 3 },
    { kind: 'exhale', seconds: 3 },
  ],
  length: { mode: 'cycles', count: 1 },
  rounds: {
    count: 3,
    cyclesPerRound: 2,
    hold: { after: 'exhale', seconds: 15, incrementSeconds: 5 },
    restSeconds: 30,
  },
  hasBreathHold: true,
};
