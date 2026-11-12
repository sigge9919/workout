import { describe, expect, it } from 'vitest';
import { compileTimeline } from '../../engine/timeline';
import { findTechnique } from '../../techniques/builtin';
import { clampSettings, defaultSettings, settingsFromParams, toCompileOptions } from '../../techniques/settings';
import { BUILTIN_PROGRAMS, findProgram } from '../builtin';
import {
  addDays,
  anchorDate,
  daysBetween,
  isDayDone,
  programPosition,
  sessionLink,
  startDateForAnchor,
  suggestionForHour,
} from '../today';

const base4 = findProgram('base4')!;
const match = findProgram('matchweek')!;
const at = (date: string, h = 12) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, h).getTime();
};

describe('inbyggda program', () => {
  it('veckor har 7 dagar och alla tekniker finns', () => {
    expect(BUILTIN_PROGRAMS.map((p) => p.id)).toEqual(['base4', 'matchweek', 'recovery2']);
    for (const p of BUILTIN_PROGRAMS) {
      for (const w of p.weeks) {
        expect(w.days, `${p.id}/${w.title}`).toHaveLength(7);
        for (const d of w.days) if (d) expect(findTechnique(d.techniqueId), d.techniqueId).toBeDefined();
      }
    }
  });

  it('förvalen ligger inom teknikernas gränser och ger rimliga längder', () => {
    for (const p of BUILTIN_PROGRAMS) {
      for (const w of p.weeks) {
        for (const d of w.days) {
          if (!d) continue;
          const t = findTechnique(d.techniqueId)!;
          const wanted = { ...defaultSettings(t), ...d.settings };
          // Inga värden får klämmas eller ignoreras.
          expect(clampSettings(t, d.settings ?? {}), `${p.id}: ${d.title}`).toEqual(wanted);
          const min = compileTimeline(t, { ...toCompileOptions(wanted), leadInSeconds: 0 }).totalMs / 60000;
          expect(min).toBeGreaterThan(0.5);
          expect(min).toBeLessThanOrEqual(16);
        }
      }
    }
  });

  it('grundperioden: 28 dagar, BOLT första dagen varje vecka och sista dagen', () => {
    const boltDays = base4.weeks.flatMap((w, wi) => w.days.map((d, di) => (d?.bolt ? wi * 7 + di + 1 : null))).filter(Boolean);
    expect(boltDays).toEqual([1, 8, 15, 22, 28]);
  });

  it('matchveckan: aktivering på matchdagen, nedvarvning dagen efter', () => {
    const days = match.weeks[0].days;
    expect(days[match.anchor!.dayIndex]!.techniqueId).toBe('activation');
    expect(days[match.anchor!.dayIndex + 1]!.techniqueId).toBe('cooldown');
    expect(days[match.anchor!.dayIndex - 1]!.techniqueId).toBe('478');
  });
});

describe('datum', () => {
  it('daysBetween och addDays över sommartid och månadsskifte', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // sommartid 29 mars
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2); // vintertid 25 okt
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-29', -1)).toBe('2026-03-28');
    expect(daysBetween('2026-11-12', '2026-11-10')).toBe(-2);
  });
});

describe('programPosition', () => {
  it('dag 1 på startdatumet, vecka 2 dag 8', () => {
    expect(programPosition(base4, '2026-11-01', '2026-11-01')).toMatchObject({ status: 'active', dayNumber: 1, week: 1 });
    const p = programPosition(base4, '2026-11-01', '2026-11-08');
    expect(p).toMatchObject({ status: 'active', dayNumber: 8, week: 2 });
    expect(p.day).toBe(base4.weeks[1].days[0]);
  });

  it('före start och efter slut', () => {
    expect(programPosition(base4, '2026-11-10', '2026-11-08')).toMatchObject({ status: 'upcoming', daysUntilStart: 2 });
    expect(programPosition(base4, '2026-11-01', '2026-11-28')).toMatchObject({ status: 'active', dayNumber: 28 });
    expect(programPosition(base4, '2026-11-01', '2026-11-29')).toMatchObject({ status: 'finished', day: null });
  });

  it('upprepade program börjar om varje varv', () => {
    const p = programPosition(match, '2026-11-02', '2026-11-16'); // två veckor senare
    expect(p).toMatchObject({ status: 'active', dayNumber: 1, lap: 2 });
  });
});

describe('matchdag som förankring', () => {
  it('startdatum räknas bakåt från matchen och matchdagen hamnar rätt', () => {
    const start = startDateForAnchor(match, '2026-11-14'); // lördag
    expect(start).toBe('2026-11-09');
    expect(programPosition(match, start, '2026-11-14').day!.techniqueId).toBe('activation');
    expect(programPosition(match, start, '2026-11-15').day!.techniqueId).toBe('cooldown');
    expect(anchorDate(match, start, '2026-11-12')).toBe('2026-11-14');
    // Nästa vecka: nästa lördag.
    expect(anchorDate(match, start, '2026-11-16')).toBe('2026-11-21');
    expect(programPosition(match, start, '2026-11-21').day!.techniqueId).toBe('activation');
  });
});

describe('sessionLink', () => {
  it('innehåller förval och programinfo som sessionen kan läsa', () => {
    const link = sessionLink({ title: 'x', techniqueId: 'co2', settings: { rounds: 4, hold: 10 } }, 'base4', 9);
    expect(link.startsWith('/teknik/co2?')).toBe(true);
    const params = new URLSearchParams(link.split('?')[1]);
    expect(settingsFromParams(params)).toEqual({ rounds: 4, hold: 10 });
    expect(params.get('program')).toBe('base4');
    expect(params.get('dag')).toBe('9');
  });
});

describe('isDayDone', () => {
  const day = base4.weeks[0].days[0]!; // resonans
  const s = (date: string, extra = {}) => ({ startedAt: at(date), techniqueId: 'box', completed: true, ...extra });

  it('programsession eller samma teknik samma dag räknas', () => {
    expect(isDayDone([s('2026-11-01', { programId: 'base4', programDay: 1 })], '2026-11-01', 'base4', 1, day)).toBe(true);
    expect(isDayDone([s('2026-11-01', { techniqueId: 'resonance' })], '2026-11-01', 'base4', 1, day)).toBe(true);
  });

  it('annan dag, annan teknik eller avbruten räknas inte', () => {
    expect(isDayDone([s('2026-10-31', { techniqueId: 'resonance' })], '2026-11-01', 'base4', 1, day)).toBe(false);
    expect(isDayDone([s('2026-11-01')], '2026-11-01', 'base4', 1, day)).toBe(false);
    expect(isDayDone([s('2026-11-01', { techniqueId: 'resonance', completed: false })], '2026-11-01', 'base4', 1, day)).toBe(false);
    expect(isDayDone([], '2026-11-01', 'base4', 1, null)).toBe(false);
  });
});

describe('suggestionForHour', () => {
  it('morgon, dag, kväll, natt', () => {
    expect([7, 12, 19, 22].map((h) => suggestionForHour(h).techniqueId)).toEqual(['resonance', 'box', 'cooldown', '478']);
  });
});
