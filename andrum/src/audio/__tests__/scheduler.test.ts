import { describe, expect, it } from 'vitest';
import { compileTimeline } from '../../engine/timeline';
import { box } from '../../engine/__tests__/fixtures';
import { planCues } from '../scheduler';

describe('planCues', () => {
  const tl = compileTimeline(box); // 3 s nedräkning + 2 × 16 s

  it('nedräkningsticks och första inandningen vid start', () => {
    const cues = planCues(tl, 0, 3500, new Set());
    expect(cues.map((c) => `${c.kind}@${c.atMs}`)).toEqual(['tick@0', 'tick@1000', 'tick@2000', 'inhale@3000']);
  });

  it('signal ligger exakt på fasgränsen', () => {
    const cues = planCues(tl, 6000, 1500, new Set());
    expect(cues).toEqual([{ key: 'phase-2', kind: 'hold', atMs: 7000 }]);
    expect(tl.phases[2].startMs).toBe(7000);
  });

  it('lägger aldrig samma signal två gånger', () => {
    const first = planCues(tl, 6000, 1500, new Set());
    const again = planCues(tl, 6500, 1500, new Set(first.map((c) => c.key)));
    expect(again).toEqual([]);
  });

  it('tar med en signal som precis passerats (fortsätt efter paus på gränsen)', () => {
    const cues = planCues(tl, 7030, 100, new Set());
    expect(cues.map((c) => c.key)).toEqual(['phase-2']);
    expect(planCues(tl, 7200, 100, new Set())).toEqual([]);
  });

  it('slutsignal vid totalMs', () => {
    const cues = planCues(tl, tl.totalMs - 1000, 1500, new Set());
    expect(cues.at(-1)).toEqual({ key: 'finish', kind: 'finish', atMs: tl.totalMs });
  });

  it('en signal per fas över hela sessionen', () => {
    const seen = new Set<string>();
    for (let t = 0; t <= tl.totalMs; t += 250) {
      for (const c of planCues(tl, t, 1000, seen)) seen.add(c.key);
    }
    const phaseKeys = [...seen].filter((k) => k.startsWith('phase-'));
    expect(phaseKeys).toHaveLength(tl.phases.length - 1); // alla utom prepare
    expect(seen.has('finish')).toBe(true);
  });
});
