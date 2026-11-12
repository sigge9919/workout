import type { Technique } from '../engine/types';

/**
 * Inbyggda tekniker. Steg 1: tre stycken för att prova motorn.
 * Resten (4-7-8, aktivering, nedvarvning, CO2-tolerans) läggs till i steg 2.
 */
export const BUILTIN_TECHNIQUES: Technique[] = [
  {
    id: 'resonance',
    name: 'Resonansandning',
    purpose: 'Lugn, balans och återhämtning',
    description:
      'Jämnt tempo kring 5,5 andetag per minut, lika lång in- som utandning. Tempot ligger nära många personers resonansfrekvens, där puls och andning samverkar som bäst. Passar som daglig rutin, före sömn eller för att varva ned mellan pass.',
    tags: ['post', 'focus', 'break'],
    cycle: [
      { kind: 'inhale', seconds: 60 / 5.5 / 2 },
      { kind: 'exhale', seconds: 60 / 5.5 / 2 },
    ],
    length: { mode: 'duration', seconds: 10 * 60 },
    adjustable: {
      breathsPerMinute: { min: 4.5, max: 7, step: 0.5, default: 5.5 },
      duration: { minMinutes: 2, maxMinutes: 30 },
    },
    hasBreathHold: false,
    builtin: true,
  },
  {
    id: 'box',
    name: 'Box breathing',
    purpose: 'Fokus och kontroll under press',
    description:
      'Fyra lika långa faser: in, håll, ut, håll. Den fasta rytmen ger något konkret att fästa uppmärksamheten på och stabiliserar andningen. Bra före en prestation eller när tankarna springer iväg.',
    tags: ['focus', 'prematch'],
    cycle: [
      { kind: 'inhale', seconds: 4 },
      { kind: 'holdIn', seconds: 4 },
      { kind: 'exhale', seconds: 4 },
      { kind: 'holdOut', seconds: 4 },
    ],
    length: { mode: 'duration', seconds: 4 * 60 },
    adjustable: { duration: { minMinutes: 1, maxMinutes: 15 } },
    hasBreathHold: true,
    builtin: true,
  },
  {
    id: 'sigh',
    name: 'Fysiologisk suck',
    purpose: 'Snabb nedvarvning på under en minut',
    description:
      'Två inandningar genom näsan – en full och en kort påfyllning – följt av en lång, avslappnad utandning genom munnen. Den dubbla inandningen öppnar lungorna och den långa utandningen sänker pulsen. Fungerar direkt efter en tung insats eller i en periodvila.',
    tags: ['break', 'post'],
    cycle: [
      { kind: 'inhale', seconds: 2, label: 'Andas in (näsan)' },
      { kind: 'inhale2', seconds: 1, label: 'Fyll på' },
      { kind: 'exhale', seconds: 6, label: 'Lång utandning' },
    ],
    length: { mode: 'cycles', count: 5 },
    hasBreathHold: false,
    builtin: true,
  },
];

export function findTechnique(id: string): Technique | undefined {
  return BUILTIN_TECHNIQUES.find((t) => t.id === id);
}
