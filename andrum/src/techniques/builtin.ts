import type { Technique } from '../engine/types';

/**
 * Inbyggda tekniker. Lägg till egna genom att lägga ett objekt i listan
 * (eller importera JSON i Inställningar, från steg 3). Formatet beskrivs
 * av typen `Technique` i src/engine/types.ts.
 */
export const BUILTIN_TECHNIQUES: Technique[] = [
  {
    id: 'resonance',
    name: 'Resonansandning',
    purpose: 'Lugn, balans och daglig återhämtning',
    description:
      'Jämnt och lugnt tempo kring 5,5 andetag per minut, lika lång in- som utandning. Vid det tempot brukar puls och andning samverka som tydligast, vilket ger en stabil, lugn känsla utan att bli sömnig. Passar som daglig grundträning, på vilodagar och för att varva ned efter en stressig dag. Prova att justera tempot mellan 5 och 6,5 för att hitta det som känns lättast.',
    tags: ['focus', 'post', 'break'],
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
      'Fyra lika långa faser: in, håll, ut, håll – fyra sekunder vardera. Den fasta rytmen ger hjärnan något konkret att följa och gör det lättare att släppa oro och brus. Bra före en prestation, inför en straff eller ett avgörande moment, eller när tankarna springer iväg.',
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
    purpose: 'Snabbast möjliga nedvarvning',
    description:
      'En full inandning genom näsan, en kort extra påfyllning ovanpå, och sedan en lång, avslappnad utandning genom munnen. Påfyllningen öppnar lungorna helt och den långa utandningen bromsar pulsen. Redan ett par andetag märks. Perfekt i en periodvila, ett byte eller direkt efter en tung insats.',
    tags: ['break', 'post'],
    cycle: [
      { kind: 'inhale', seconds: 2, label: 'Andas in (näsan)' },
      { kind: 'inhale2', seconds: 1, label: 'Fyll på' },
      { kind: 'exhale', seconds: 6, label: 'Lång utandning' },
    ],
    length: { mode: 'cycles', count: 5 },
    adjustable: { cycles: { min: 1, max: 15 } },
    hasBreathHold: false,
    builtin: true,
  },
  {
    id: '478',
    name: '4-7-8',
    purpose: 'Inför sömn',
    description:
      'Andas in i fyra sekunder, håll i sju och andas ut långsamt i åtta. Den långa hållningen och ännu längre utandningen saktar ner allt och gör det lättare att somna. Gör den i sängen med släckt lampa. Fyra varv räcker ofta – öka gradvis om det känns bra. Känns hållningen jobbig, korta den hellre än att pressa.',
    tags: ['sleep'],
    cycle: [
      { kind: 'inhale', seconds: 4, label: 'Andas in (näsan)' },
      { kind: 'holdIn', seconds: 7 },
      { kind: 'exhale', seconds: 8, label: 'Andas ut (munnen)' },
    ],
    length: { mode: 'cycles', count: 4 },
    adjustable: { cycles: { min: 2, max: 10 } },
    hasBreathHold: true,
    builtin: true,
  },
  {
    id: 'activation',
    name: 'Aktivering före match',
    purpose: 'Vakna, höj energin och skärp fokus',
    description:
      'Rundor med snabbare, kraftfull andning följt av en kort hållning med fulla lungor och fri andning emellan. Den högre rytmen höjer pulsen och vaksamheten lite grann – som en uppvärmning för nervsystemet. Gör den 10–30 minuter före start, sittande eller stående. Det är normalt att det pirrar lite; blir du yr, sakta ner eller avbryt.',
    tags: ['prematch'],
    cycle: [
      { kind: 'inhale', seconds: 1.5, label: 'Snabbt in' },
      { kind: 'exhale', seconds: 1.5, label: 'Släpp ut' },
    ],
    length: { mode: 'cycles', count: 1 },
    rounds: {
      count: 3,
      cyclesPerRound: 15,
      hold: { after: 'inhale', seconds: 10, incrementSeconds: 5 },
      restSeconds: 15,
    },
    adjustable: {
      rounds: { min: 1, max: 5 },
      holdSeconds: { min: 5, max: 20, step: 5 },
    },
    hasBreathHold: true,
    builtin: true,
  },
  {
    id: 'cooldown',
    name: 'Nedvarvning efter träning',
    purpose: 'Från kamp till återhämtning',
    description:
      'Andas in i fyra sekunder och ut i åtta. När utandningen är dubbelt så lång som inandningen skiftar kroppen snabbare från påslag till vila, och pulsen hittar ner. Gör den direkt efter passet – gärna liggande med benen upp – eller i bilen på väg hem (med ögonen öppna). Justera tempot om 4/8 känns för långt.',
    tags: ['post', 'sleep'],
    cycle: [
      { kind: 'inhale', seconds: 4, label: 'Andas in (näsan)' },
      { kind: 'exhale', seconds: 8, label: 'Långsamt ut' },
    ],
    length: { mode: 'duration', seconds: 5 * 60 },
    adjustable: {
      breathsPerMinute: { min: 4, max: 7, step: 0.5, default: 5 },
      duration: { minMinutes: 2, maxMinutes: 20 },
    },
    hasBreathHold: false,
    builtin: true,
  },
  {
    id: 'co2',
    name: 'CO2-tolerans',
    purpose: 'Bygg tålighet mot lufthunger',
    description:
      'Lugn näsandning, sedan en hållning efter en normal utandning. Hållningen blir fem sekunder längre för varje runda. Målet är att vänja sig vid känslan av lufthunger och hålla andningen lugn även när det tar emot – något som märks i slutet av ett byte eller en spurt. Håll till tydlig lufthunger, inte till max. Andas lugnt genom näsan direkt efteråt. Kör den vilad, inte direkt efter hård träning.',
    tags: ['focus'],
    cycle: [
      { kind: 'inhale', seconds: 3, label: 'Lugnt in (näsan)' },
      { kind: 'exhale', seconds: 4, label: 'Lugnt ut' },
    ],
    length: { mode: 'cycles', count: 1 },
    rounds: {
      count: 6,
      cyclesPerRound: 5,
      hold: { after: 'exhale', seconds: 15, incrementSeconds: 5 },
      restSeconds: 0,
    },
    adjustable: {
      rounds: { min: 3, max: 8 },
      holdSeconds: { min: 5, max: 40, step: 5 },
    },
    hasBreathHold: true,
    builtin: true,
  },
];

export function findTechnique(id: string): Technique | undefined {
  return BUILTIN_TECHNIQUES.find((t) => t.id === id);
}
