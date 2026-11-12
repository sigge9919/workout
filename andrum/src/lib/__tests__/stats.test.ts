import { describe, expect, it } from 'vitest';
import {
  boltLevel,
  dailyBolt,
  isoWeek,
  localDateOf,
  metricSeries,
  parseDailyMetric,
  parseLocalDate,
  ratingEffect,
  sessionsPerWeek,
  streak,
  summarize,
  weekStart,
} from '../stats';

const at = (y: number, m: number, d: number, h = 8) => new Date(y, m - 1, d, h).getTime();

describe('dailyBolt', () => {
  it('medel per lokal dag, äldst först', () => {
    const days = dailyBolt([
      { date: at(2026, 11, 10, 7), seconds: 20 },
      { date: at(2026, 11, 9), seconds: 18 },
      { date: at(2026, 11, 10, 21), seconds: 25 },
    ]);
    expect(days.map((d) => [d.date, d.value])).toEqual([
      ['2026-11-09', 18],
      ['2026-11-10', 22.5],
    ]);
    expect(days[0].t).toBe(parseLocalDate('2026-11-09'));
  });

  it('sena kvällsmätningar hamnar på rätt lokala dag', () => {
    expect(localDateOf(at(2026, 11, 10, 23))).toBe('2026-11-10');
    expect(localDateOf(at(2026, 11, 11, 0))).toBe('2026-11-11');
  });
});

describe('summarize', () => {
  const now = at(2026, 11, 20, 12);
  const pts = [
    { t: at(2026, 11, 8), value: 20 }, // föregående 7 dygn
    { t: at(2026, 11, 10), value: 22 }, // föregående 7 dygn
    { t: at(2026, 11, 15), value: 24 },
    { t: at(2026, 11, 19), value: 28 },
  ];

  it('senaste, bästa, snitt 7 dygn och förändring', () => {
    expect(summarize(pts, now)).toEqual({
      latest: { value: 28, t: at(2026, 11, 19) },
      best: 28,
      avg7: 26,
      delta7: 5,
      count: 4,
    });
  });

  it('lägre är bättre (vilopuls)', () => {
    expect(summarize(pts, now, false).best).toBe(20);
  });

  it('utan data i perioderna saknas snitt och förändring', () => {
    const s = summarize([{ t: at(2026, 10, 1), value: 30 }], now);
    expect(s.avg7).toBeUndefined();
    expect(s.delta7).toBeUndefined();
    expect(s.latest!.value).toBe(30);
    expect(summarize([], now)).toEqual({ count: 0 });
  });
});

describe('metricSeries', () => {
  it('plockar ett fält och hoppar över dagar utan värde', () => {
    const s = metricSeries(
      [
        { date: '2026-11-12', hrv: 70 },
        { date: '2026-11-10', restingHr: 50, hrv: 65 },
        { date: '2026-11-11', restingHr: 48 },
      ],
      'hrv',
    );
    expect(s.map((p) => [p.date, p.value])).toEqual([
      ['2026-11-10', 65],
      ['2026-11-12', 70],
    ]);
  });
});

describe('parseDailyMetric', () => {
  it('tolkar text, decimalkomma och tomma fält', () => {
    expect(parseDailyMetric({ date: '2026-11-12', restingHr: '48', hrv: '' })).toEqual({ date: '2026-11-12', restingHr: 48 });
    expect(parseDailyMetric({ date: '2026-11-12', hrv: '71,6' })).toEqual({ date: '2026-11-12', hrv: 72 });
  });

  it('avvisar orimliga värden och tomt formulär', () => {
    expect(() => parseDailyMetric({ date: '2026-11-12' })).toThrow(/båda/);
    expect(() => parseDailyMetric({ date: '2026-11-12', restingHr: '400' })).toThrow(/Vilopuls/);
    expect(() => parseDailyMetric({ date: '2026-11-12', hrv: 'abc' })).toThrow(/HRV/);
    expect(() => parseDailyMetric({ date: '', hrv: 50 })).toThrow(/datum/);
  });
});

describe('boltLevel', () => {
  it('gränser', () => {
    expect([9, 10, 19, 20, 30, 40].map((s) => boltLevel(s).label)).toEqual([
      'Låg', 'Under medel', 'Under medel', 'Medel', 'Bra', 'Mycket bra',
    ]);
  });
});


describe('veckor', () => {
  it('weekStart ger måndag 00:00', () => {
    const t = weekStart(at(2026, 11, 12, 15)); // torsdag
    expect(new Date(t)).toEqual(new Date(2026, 10, 9, 0, 0));
    expect(weekStart(at(2026, 11, 15, 23))).toBe(t); // söndag
    expect(weekStart(at(2026, 11, 16, 0))).not.toBe(t); // måndag nästa vecka
  });

  it('ISO-veckonummer, även kring årsskiften', () => {
    expect(isoWeek(at(2026, 11, 12))).toBe(46);
    expect(isoWeek(at(2026, 1, 1))).toBe(1);
    expect(isoWeek(at(2027, 1, 1))).toBe(53);
    expect(isoWeek(at(2024, 12, 30))).toBe(1);
  });

  it('sessioner och minuter per vecka med tomma veckor', () => {
    const now = at(2026, 11, 12);
    const w = sessionsPerWeek(
      [
        { startedAt: at(2026, 11, 9), actualSec: 600 },
        { startedAt: at(2026, 11, 12), actualSec: 300 },
        { startedAt: at(2026, 10, 27), actualSec: 120 },
        { startedAt: at(2025, 1, 1), actualSec: 120 }, // utanför
      ],
      now,
      4,
    );
    expect(w.map((b) => [b.week, b.count, b.minutes])).toEqual([
      [43, 0, 0],
      [44, 1, 2],
      [45, 0, 0],
      [46, 2, 15],
    ]);
  });

  it('veckor över sommartidsskifte hamnar rätt', () => {
    const w = sessionsPerWeek([{ startedAt: at(2026, 3, 30, 9), actualSec: 60 }], at(2026, 4, 2), 3);
    expect(w.map((b) => b.count)).toEqual([0, 0, 1]);
    expect(new Date(w[1].t).getDay()).toBe(1);
  });
});

describe('streak', () => {
  const s = (y: number, m: number, d: number) => ({ startedAt: at(y, m, d), actualSec: 60 });

  it('räknar dagar i rad fram till idag', () => {
    const r = streak([s(2026, 11, 10), s(2026, 11, 11), s(2026, 11, 12), s(2026, 11, 12)], at(2026, 11, 12, 20));
    expect(r).toEqual({ current: 3, longest: 3, doneToday: true });
  });

  it('streaken lever kvar om igår gjordes men inte idag än', () => {
    expect(streak([s(2026, 11, 10), s(2026, 11, 11)], at(2026, 11, 12, 9))).toEqual({ current: 2, longest: 2, doneToday: false });
  });

  it('bruten streak och längsta svit', () => {
    const r = streak([s(2026, 11, 1), s(2026, 11, 2), s(2026, 11, 3), s(2026, 11, 4), s(2026, 11, 8)], at(2026, 11, 12));
    expect(r).toEqual({ current: 0, longest: 4, doneToday: false });
  });

  it('över månadsskifte', () => {
    expect(streak([s(2026, 10, 31), s(2026, 11, 1)], at(2026, 11, 1)).current).toBe(2);
    expect(streak([], at(2026, 11, 1))).toEqual({ current: 0, longest: 0, doneToday: false });
  });
});

describe('ratingEffect', () => {
  it('medel av efter − före, bara skattade sessioner', () => {
    const r = ratingEffect([
      { before: { energy: 4, stress: 8, focus: 5 }, after: { energy: 6, stress: 4, focus: 7 } },
      { before: { energy: 5, stress: 6, focus: 5 }, after: { energy: 6, stress: 5, focus: 6 } },
      {},
    ]);
    expect(r).toEqual({ n: 2, energy: 1.5, stress: -2.5, focus: 1.5 });
    expect(ratingEffect([{}])).toEqual({ n: 0 });
  });
});
