import { describe, expect, it } from 'vitest';
import { breathsPerMinute, compileTimeline, validateTechnique } from '../../engine/timeline';
import { BUILTIN_TECHNIQUES, findTechnique } from '../builtin';
import { SITUATIONS } from '../situations';
import {
  clampSettings,
  defaultSettings,
  settingsFromParams,
  settingsToParams,
  toCompileOptions,
} from '../settings';

const t = (id: string) => findTechnique(id)!;
const minutes = (id: string, s = defaultSettings(t(id))) =>
  compileTimeline(t(id), { ...toCompileOptions(s), leadInSeconds: 0 }).totalMs / 60000;

describe('inbyggda tekniker', () => {
  it('alla sju finns, är giltiga och har unika id', () => {
    expect(BUILTIN_TECHNIQUES.map((x) => x.id)).toEqual([
      'resonance', 'box', 'sigh', '478', 'activation', 'cooldown', 'co2',
    ]);
    for (const x of BUILTIN_TECHNIQUES) {
      expect(() => validateTechnique(x)).not.toThrow();
      expect(x.description.length).toBeGreaterThan(80);
      expect(x.tags.length).toBeGreaterThan(0);
    }
  });

  it('tekniker med hållningar har varningsflaggan', () => {
    for (const x of BUILTIN_TECHNIQUES) {
      const holds = x.cycle.some((p) => p.kind === 'holdIn' || p.kind === 'holdOut') || !!x.rounds?.hold;
      expect(x.hasBreathHold).toBe(holds);
    }
  });

  it('standardvärden ger rimliga längder', () => {
    expect(minutes('resonance')).toBeCloseTo(10, 5);
    expect(minutes('box')).toBe(4);
    expect(minutes('sigh')).toBe(0.75); // 5 × 9 s
    expect(minutes('478')).toBeCloseTo(76 / 60, 5); // 4 × 19 s
    expect(minutes('cooldown')).toBe(5);
    expect(minutes('activation')).toBeGreaterThan(2.5);
    expect(minutes('activation')).toBeLessThan(5);
    expect(minutes('co2')).toBeCloseTo((6 * 35 + 15 + 20 + 25 + 30 + 35 + 40) / 60, 5);
  });

  it('tempon: resonans 5,5/min, nedvarvning 1:2', () => {
    expect(breathsPerMinute(t('resonance').cycle)).toBeCloseTo(5.5, 10);
    const [inhale, exhale] = t('cooldown').cycle;
    expect(exhale.seconds / inhale.seconds).toBe(2);
    const tl = compileTimeline(t('cooldown'), { breathsPerMinute: 6, leadInSeconds: 0, durationSeconds: 60 });
    expect(tl.phases.slice(0, 2).map((p) => p.durationMs)).toEqual([10000 / 3, 20000 / 3].map(Math.round));
  });

  it('CO2: hållning efter utandning som ökar 5 s per runda', () => {
    const tl = compileTimeline(t('co2'), { leadInSeconds: 0 });
    expect(tl.phases.filter((p) => p.kind === 'holdOut').map((p) => p.durationMs / 1000)).toEqual([15, 20, 25, 30, 35, 40]);
  });

  it('aktivering: snabb rytm, hållning med fulla lungor, slutar på utandning', () => {
    const tl = compileTimeline(t('activation'), { leadInSeconds: 0 });
    expect(breathsPerMinute(t('activation').cycle)).toBe(20);
    expect(tl.phases.filter((p) => p.kind === 'holdIn').map((p) => p.durationMs / 1000)).toEqual([10, 15, 20]);
    expect(tl.phases.at(-1)!.kind).toBe('exhale');
  });

  it('varje snabbval pekar på en befintlig teknik med rätt tagg', () => {
    for (const s of SITUATIONS) {
      const x = findTechnique(s.techniqueId);
      expect(x, s.id).toBeDefined();
      expect(x!.tags).toContain(s.id);
    }
  });
});

describe('sessionsinställningar', () => {
  it('standard innehåller bara justerbara fält', () => {
    expect(defaultSettings(t('resonance'))).toEqual({ bpm: 5.5, minutes: 10 });
    expect(defaultSettings(t('box'))).toEqual({ minutes: 4 });
    expect(defaultSettings(t('478'))).toEqual({ cycles: 4 });
    expect(defaultSettings(t('co2'))).toEqual({ rounds: 6, hold: 15 });
  });

  it('klämmer och avrundar till tillåtna steg', () => {
    expect(clampSettings(t('resonance'), { bpm: 9, minutes: 100 })).toEqual({ bpm: 7, minutes: 30 });
    expect(clampSettings(t('resonance'), { bpm: 5.7, minutes: 0 })).toEqual({ bpm: 5.5, minutes: 2 });
    expect(clampSettings(t('co2'), { rounds: 20, hold: 17 })).toEqual({ rounds: 8, hold: 15 });
    expect(clampSettings(t('478'), { cycles: 1 })).toEqual({ cycles: 2 });
  });

  it('ignorerar fält som tekniken inte tillåter och ogiltiga värden', () => {
    expect(clampSettings(t('box'), { bpm: 6, cycles: 3, minutes: NaN })).toEqual({ minutes: 4 });
  });

  it('URL rundtur, inklusive decimalkomma', () => {
    const s = { bpm: 5.5, minutes: 12 };
    expect(settingsFromParams(new URLSearchParams(settingsToParams(s)))).toEqual(s);
    expect(settingsFromParams(new URLSearchParams('bpm=6,5&min=x'))).toEqual({ bpm: 6.5 });
    expect(settingsToParams({})).toBe('');
  });
});
