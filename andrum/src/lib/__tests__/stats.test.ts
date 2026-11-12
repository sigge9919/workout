import { describe, expect, it } from 'vitest';
import { boltLevel, dailyBolt, localDateOf, metricSeries, parseDailyMetric, parseLocalDate, summarize } from '../stats';

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
