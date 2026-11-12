import type { Program, ProgramDay } from './types';

const res = (minutes: number, title = 'Resonansandning', extra: Partial<ProgramDay> = {}): ProgramDay => ({
  title,
  techniqueId: 'resonance',
  settings: { minutes },
  ...extra,
});
const box = (minutes: number): ProgramDay => ({ title: 'Fokus under kontroll', techniqueId: 'box', settings: { minutes } });
const co2 = (rounds: number, hold: number): ProgramDay => ({
  title: 'CO2-tolerans',
  techniqueId: 'co2',
  settings: { rounds, hold },
  note: 'Håll till tydlig lufthunger, inte max. Vilad, inte direkt efter hård träning.',
});
const cooldown = (minutes: number, title = 'Nedvarvning'): ProgramDay => ({
  title,
  techniqueId: 'cooldown',
  settings: { minutes },
  note: 'Gärna direkt efter dagens träning.',
});

export const BUILTIN_PROGRAMS: Program[] = [
  {
    id: 'base4',
    name: 'Grundperiod 4 veckor',
    summary: 'Bygg vanan och höj BOLT steg för steg',
    description:
      'En session om dagen. Resonansandning är grunden och blir gradvis längre, box breathing tränar kontroll och från vecka 2 kommer CO2-tolerans två gånger i veckan. BOLT mäts första dagen varje vecka och sista dagen, så att du ser utvecklingen.',
    repeat: false,
    weeks: [
      {
        title: 'Vänja in',
        days: [
          res(5, 'Start – resonans', { bolt: true, note: 'Mät BOLT på morgonen innan sessionen.' }),
          res(5),
          box(3),
          res(6),
          cooldown(5),
          res(6),
          { title: 'Lätt dag', techniqueId: 'sigh', settings: { cycles: 5 } },
        ],
      },
      {
        title: 'Lägg till CO2',
        days: [
          res(8, 'Resonansandning', { bolt: true }),
          co2(4, 10),
          res(8),
          box(4),
          co2(4, 10),
          res(10),
          cooldown(6),
        ],
      },
      {
        title: 'Öka',
        days: [res(10, 'Resonansandning', { bolt: true }), co2(5, 15), res(10), box(5), co2(6, 15), res(12), cooldown(8)],
      },
      {
        title: 'Befäst',
        days: [
          res(12, 'Resonansandning', { bolt: true }),
          co2(6, 20),
          res(12),
          box(6),
          co2(6, 20),
          res(15),
          res(10, 'Avslutning', { bolt: true, note: 'Mät BOLT och jämför med dag 1.' }),
        ],
      },
    ],
  },
  {
    id: 'matchweek',
    name: 'Matchvecka',
    summary: 'Uppladdning mot matchdagen och återhämtning efteråt',
    description:
      'Sju dagar räknade från matchen: lugn grund och CO2-träning tidigt i veckan, fokus och sömn de sista dagarna, aktivering på matchdagen och nedvarvning dagen efter. Upprepas varje vecka på samma veckodag – byt matchdag när spelschemat ändras.',
    repeat: true,
    anchor: { label: 'Matchdag', dayIndex: 5 },
    weeks: [
      {
        title: 'Matchvecka',
        days: [
          res(10, '5 dagar kvar – bygg bas'),
          { ...co2(5, 15), title: '4 dagar kvar – CO2-tolerans' },
          { ...box(5), title: '3 dagar kvar – fokus' },
          res(10, '2 dagar kvar – lugn grund'),
          {
            title: 'Dagen före – sömn',
            techniqueId: '478',
            settings: { cycles: 6 },
            note: 'Gör den i sängen med släckt lampa.',
          },
          {
            title: 'Matchdag – aktivering',
            techniqueId: 'activation',
            settings: { rounds: 3, hold: 10 },
            note: '10–30 minuter före uppvärmning. Använd fysiologisk suck i pauser och byten.',
          },
          cooldown(10, 'Dagen efter – återhämtning'),
        ],
      },
    ],
  },
  {
    id: 'recovery2',
    name: 'Sömn och återhämtning 2 veckor',
    summary: 'Kvällsrutin för tunga träningsperioder',
    description:
      'Korta kvällssessioner som hjälper kroppen att växla över till vila: lång utandning, 4-7-8 och lugn resonansandning omväxlande. Passar under hårda träningsblock eller när sömnen strular. Gör sessionen den sista halvtimmen före sänggåendet.',
    repeat: false,
    weeks: [
      {
        title: 'Hitta rutinen',
        days: [
          { title: 'Kväll – 4-7-8', techniqueId: '478', settings: { cycles: 4 }, bolt: true },
          cooldown(6, 'Kväll – lång utandning'),
          { ...res(8, 'Kväll – resonans'), settings: { minutes: 8, bpm: 5 } },
          { title: 'Kväll – 4-7-8', techniqueId: '478', settings: { cycles: 5 } },
          cooldown(8, 'Kväll – lång utandning'),
          { ...res(10, 'Kväll – resonans'), settings: { minutes: 10, bpm: 5 } },
          { title: 'Kväll – 4-7-8', techniqueId: '478', settings: { cycles: 6 } },
        ],
      },
      {
        title: 'Fördjupa',
        days: [
          cooldown(10, 'Kväll – lång utandning'),
          { ...res(12, 'Kväll – resonans'), settings: { minutes: 12, bpm: 5 } },
          { title: 'Kväll – 4-7-8', techniqueId: '478', settings: { cycles: 6 } },
          cooldown(10, 'Kväll – lång utandning'),
          { ...res(12, 'Kväll – resonans'), settings: { minutes: 12, bpm: 4.5 } },
          { title: 'Kväll – 4-7-8', techniqueId: '478', settings: { cycles: 8 } },
          { ...res(15, 'Kväll – resonans'), settings: { minutes: 15, bpm: 5 }, bolt: true },
        ],
      },
    ],
  },
];

export function findProgram(id: string): Program | undefined {
  return BUILTIN_PROGRAMS.find((p) => p.id === id);
}
