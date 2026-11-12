import { describe, expect, it } from 'vitest';
import {
  TechniqueError,
  breathsPerMinute,
  compileTimeline,
  phaseIndexAt,
  scaleCycle,
} from '../timeline';
import type { Technique } from '../types';
import { box, co2, resonance, sigh } from './fixtures';

const noLeadIn = { leadInSeconds: 0 };

describe('compileTimeline', () => {
  it('box 4-4-4-4: exakta gränser var 4000:e ms', () => {
    const tl = compileTimeline(box, noLeadIn);
    expect(tl.phases.map((p) => p.kind)).toEqual([
      'inhale', 'holdIn', 'exhale', 'holdOut',
      'inhale', 'holdIn', 'exhale', 'holdOut',
    ]);
    expect(tl.phases.map((p) => p.startMs)).toEqual([0, 4000, 8000, 12000, 16000, 20000, 24000, 28000]);
    expect(tl.phases.map((p) => p.endMs)).toEqual([4000, 8000, 12000, 16000, 20000, 24000, 28000, 32000]);
    expect(tl.totalMs).toBe(32000);
    expect(tl.breathingMs).toBe(32000);
  });

  it('faserna ligger kant i kant utan glapp eller överlapp', () => {
    for (const t of [box, resonance, sigh, co2]) {
      const tl = compileTimeline(t);
      expect(tl.phases[0].startMs).toBe(0);
      for (let i = 1; i < tl.phases.length; i++) {
        expect(tl.phases[i].startMs).toBe(tl.phases[i - 1].endMs);
        expect(tl.phases[i].index).toBe(i);
      }
      for (const p of tl.phases) {
        expect(Number.isInteger(p.startMs)).toBe(true);
        expect(Number.isInteger(p.endMs)).toBe(true);
        expect(p.durationMs).toBe(p.endMs - p.startMs);
        expect(p.durationMs).toBeGreaterThan(0);
      }
    }
  });

  it('lägger till nedräkning (3 s som standard) före första andetaget', () => {
    const tl = compileTimeline(box);
    expect(tl.phases[0]).toMatchObject({ kind: 'prepare', startMs: 0, endMs: 3000, cycle: -1 });
    expect(tl.phases[1]).toMatchObject({ kind: 'inhale', startMs: 3000, endMs: 7000 });
    expect(tl.totalMs).toBe(35000);
    expect(tl.breathingMs).toBe(32000);
  });

  it('resonans 5,5/min i 10 min: 55 andetag, ingen ackumulerad drift', () => {
    const tl = compileTimeline(resonance, noLeadIn);
    const cycleMs = 60000 / 5.5;
    expect(tl.phases).toHaveLength(110);
    // Varje gräns ligger högst 0,5 ms från sin exakta position.
    tl.phases.forEach((p, i) => {
      const exactStart = (i * cycleMs) / 2;
      expect(Math.abs(p.startMs - exactStart)).toBeLessThanOrEqual(0.5);
    });
    expect(tl.totalMs).toBe(600000);
    // Fasernas längd skiljer högst 1 ms (5454 eller 5455).
    const durations = new Set(tl.phases.map((p) => p.durationMs));
    expect([...durations].every((d) => d === 5454 || d === 5455)).toBe(true);
  });

  it('läget "duration" ger hela cykler (slutar alltid på utandning)', () => {
    const tl = compileTimeline(resonance, { ...noLeadIn, durationSeconds: 65 });
    // 65 s / 10,909 s ≈ 5,96 → 6 cykler
    expect(tl.phases).toHaveLength(12);
    expect(tl.phases.at(-1)!.kind).toBe('exhale');
  });

  it('kortaste längd ger minst en cykel', () => {
    const tl = compileTimeline(resonance, { ...noLeadIn, durationSeconds: 1 });
    expect(tl.phases).toHaveLength(2);
  });

  it('överstyrt tempo behåller proportionerna', () => {
    const tl = compileTimeline(resonance, { ...noLeadIn, breathsPerMinute: 6, durationSeconds: 60 });
    expect(tl.phases).toHaveLength(12);
    expect(tl.phases[0].durationMs).toBe(5000);
    expect(tl.phases[1].durationMs).toBe(5000);
    expect(tl.totalMs).toBe(60000);
  });

  it('scaleCycle behåller förhållandet 1:2', () => {
    const scaled = scaleCycle(
      [
        { kind: 'inhale', seconds: 4 },
        { kind: 'exhale', seconds: 8 },
      ],
      6,
    );
    expect(scaled[0].seconds).toBeCloseTo(10 / 3, 10);
    expect(scaled[1].seconds).toBeCloseTo(20 / 3, 10);
    expect(breathsPerMinute(scaled)).toBeCloseTo(6, 10);
  });

  it('cykelnummer räknas upp per andetag', () => {
    const tl = compileTimeline(box, noLeadIn);
    expect(tl.phases.map((p) => p.cycle)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('rundor: andning, hållning med progression, vila mellan (inte efter sista)', () => {
    const tl = compileTimeline(co2, noLeadIn);
    const summary = tl.phases.map((p) => `${p.round}:${p.kind}:${p.durationMs}`);
    expect(summary).toEqual([
      '0:inhale:3000', '0:exhale:3000', '0:inhale:3000', '0:exhale:3000', '0:holdOut:15000', '0:rest:30000',
      '1:inhale:3000', '1:exhale:3000', '1:inhale:3000', '1:exhale:3000', '1:holdOut:20000', '1:rest:30000',
      '2:inhale:3000', '2:exhale:3000', '2:inhale:3000', '2:exhale:3000', '2:holdOut:25000',
    ]);
    expect(tl.roundCount).toBe(3);
    expect(tl.totalMs).toBe(3 * 12000 + 15000 + 20000 + 25000 + 2 * 30000);
  });

  it('rundor och hållning kan överstyras', () => {
    const tl = compileTimeline(co2, { ...noLeadIn, rounds: 2, holdSeconds: 10 });
    expect(tl.roundCount).toBe(2);
    const holds = tl.phases.filter((p) => p.kind === 'holdOut').map((p) => p.durationMs);
    expect(holds).toEqual([10000, 15000]);
    expect(() => compileTimeline(co2, { holdSeconds: 0 })).toThrow(TechniqueError);
  });

  it('antal cykler kan överstyras', () => {
    expect(compileTimeline(box, { ...noLeadIn, cycles: 5 }).phases).toHaveLength(20);
  });

  it('hållning efter inandning lägger in djup inandning och avslutande utandning', () => {
    const t: Technique = {
      ...co2,
      rounds: { count: 2, cyclesPerRound: 1, hold: { after: 'inhale', seconds: 10 }, restSeconds: 20 },
    };
    const tl = compileTimeline(t, noLeadIn);
    expect(tl.phases.map((p) => p.kind)).toEqual([
      'inhale', 'exhale', 'inhale', 'holdIn', 'rest',
      'inhale', 'exhale', 'inhale', 'holdIn', 'exhale',
    ]);
    expect(tl.phases.at(-1)!.toLevel).toBe(0);
  });

  it('cirkelns nivåer: växer vid in, står vid håll, krymper vid ut, kontinuerligt', () => {
    const tl = compileTimeline(box, noLeadIn);
    const [inhale, holdIn, exhale, holdOut] = tl.phases;
    expect([inhale.fromLevel, inhale.toLevel]).toEqual([0, 1]);
    expect([holdIn.fromLevel, holdIn.toLevel]).toEqual([1, 1]);
    expect([exhale.fromLevel, exhale.toLevel]).toEqual([1, 0]);
    expect([holdOut.fromLevel, holdOut.toLevel]).toEqual([0, 0]);
    for (const t of [box, sigh, co2, resonance]) {
      const phases = compileTimeline(t).phases;
      for (let i = 1; i < phases.length; i++) expect(phases[i].fromLevel).toBe(phases[i - 1].toLevel);
    }
  });

  it('fysiologisk suck: första inandningen fyller delvis, påfyllningen till max', () => {
    const tl = compileTimeline(sigh, noLeadIn);
    expect(tl.phases[0].toLevel).toBeGreaterThan(0.5);
    expect(tl.phases[0].toLevel).toBeLessThan(1);
    expect(tl.phases[1]).toMatchObject({ kind: 'inhale2', toLevel: 1, label: 'Fyll på' });
    expect(tl.phases[2]).toMatchObject({ kind: 'exhale', toLevel: 0 });
  });

  it('använder egen etikett om den finns', () => {
    const t: Technique = { ...box, cycle: [{ kind: 'inhale', seconds: 2, label: 'Näsan' }, { kind: 'exhale', seconds: 2 }] };
    expect(compileTimeline(t, noLeadIn).phases[0].label).toBe('Näsan');
  });

  it('avvisar ogiltiga tekniker', () => {
    const bad = (patch: Partial<Technique>) => () => compileTimeline({ ...box, ...patch });
    expect(bad({ cycle: [] })).toThrow(TechniqueError);
    expect(bad({ cycle: [{ kind: 'inhale', seconds: 0 }, { kind: 'exhale', seconds: 4 }] })).toThrow(TechniqueError);
    expect(bad({ cycle: [{ kind: 'exhale', seconds: 4 }] })).toThrow(TechniqueError);
    expect(bad({ cycle: [{ kind: 'inhale', seconds: 4 }] })).toThrow(TechniqueError);
    expect(bad({ length: { mode: 'cycles', count: 0 } })).toThrow(TechniqueError);
    expect(() => compileTimeline(box, { breathsPerMinute: 0 })).toThrow(TechniqueError);
  });
});

describe('phaseIndexAt', () => {
  const tl = compileTimeline(box, noLeadIn);

  it('start är inklusiv, slut exklusivt – exakt på gränsen', () => {
    expect(phaseIndexAt(tl, 0)).toBe(0);
    expect(phaseIndexAt(tl, 3999)).toBe(0);
    expect(phaseIndexAt(tl, 3999.999)).toBe(0);
    expect(phaseIndexAt(tl, 4000)).toBe(1);
    expect(phaseIndexAt(tl, 15999)).toBe(3);
    expect(phaseIndexAt(tl, 16000)).toBe(4);
    expect(phaseIndexAt(tl, 31999)).toBe(7);
  });

  it('utanför tidslinjen', () => {
    expect(phaseIndexAt(tl, -1)).toBe(-1);
    expect(phaseIndexAt(tl, 32000)).toBe(8);
    expect(phaseIndexAt(tl, 99999)).toBe(8);
  });

  it('stämmer med linjär sökning för varje ms i en lång session', () => {
    const long = compileTimeline(resonance, { durationSeconds: 120 });
    let expected = 0;
    for (let t = 0; t < long.totalMs; t += 7) {
      while (long.phases[expected].endMs <= t) expected++;
      expect(phaseIndexAt(long, t)).toBe(expected);
    }
  });
});
