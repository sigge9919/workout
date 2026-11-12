import { describe, expect, it } from 'vitest';
import { FakeClock } from '../clock';
import { SessionEngine, stateAt, type EngineEvent } from '../engine';
import { compileTimeline } from '../timeline';
import { box, sigh } from './fixtures';

function setup(t = box, leadInSeconds = 0) {
  const clock = new FakeClock(1_000_000); // godtycklig startpunkt
  const timeline = compileTimeline(t, { leadInSeconds });
  const engine = new SessionEngine(timeline, clock);
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  const phaseEvents = () =>
    events.filter((e): e is Extract<EngineEvent, { type: 'phase' }> => e.type === 'phase').map((e) => e.phase.index);
  const statusEvents = () =>
    events.filter((e): e is Extract<EngineEvent, { type: 'status' }> => e.type === 'status').map((e) => e.status);
  return { clock, timeline, engine, events, phaseEvents, statusEvents };
}

describe('stateAt', () => {
  const tl = compileTimeline(box, { leadInSeconds: 0 });

  it('nedräkning och kvarvarande tid', () => {
    const s = stateAt(tl, 2500);
    expect(s.phase!.kind).toBe('inhale');
    expect(s.phaseElapsedMs).toBe(2500);
    expect(s.phaseRemainingMs).toBe(1500);
    expect(s.phaseProgress).toBeCloseTo(0.625, 10);
    expect(s.remainingMs).toBe(29500);
  });

  it('cirkeln: halvvägs i inandning = 0,5, stilla vid håll, 0 efter utandning', () => {
    expect(stateAt(tl, 0).level).toBe(0);
    expect(stateAt(tl, 2000).level).toBeCloseTo(0.5, 10);
    expect(stateAt(tl, 4000).level).toBe(1);
    expect(stateAt(tl, 6000).level).toBe(1);
    expect(stateAt(tl, 10000).level).toBeCloseTo(0.5, 10);
    expect(stateAt(tl, 12000).level).toBe(0);
    expect(stateAt(tl, 14000).level).toBe(0);
  });

  it('cirkeln är kontinuerlig över varje fasgräns', () => {
    const t2 = compileTimeline(sigh, {});
    for (const p of t2.phases.slice(1)) {
      const before = stateAt(t2, p.startMs - 0.001).level;
      const at = stateAt(t2, p.startMs).level;
      expect(Math.abs(before - at)).toBeLessThan(1e-6);
    }
  });

  it('efter slutet: ingen fas, status finished', () => {
    const s = stateAt(tl, 40000);
    expect(s.phase).toBeNull();
    expect(s.status).toBe('finished');
    expect(s.elapsedMs).toBe(32000);
    expect(s.remainingMs).toBe(0);
  });
});

describe('SessionEngine', () => {
  it('fasbyten sker exakt på gränsen, inte en ms före', () => {
    const { clock, engine, phaseEvents } = setup();
    engine.start();
    expect(phaseEvents()).toEqual([0]);

    clock.advance(3999);
    expect(engine.tick().phase!.index).toBe(0);
    expect(phaseEvents()).toEqual([0]);

    clock.advance(1);
    expect(engine.tick().phase!.index).toBe(1);
    expect(phaseEvents()).toEqual([0, 1]);
    expect(engine.tick().phaseElapsedMs).toBe(0);
  });

  it('alla fasbyten i ordning med tick varje 16 ms (60 fps)', () => {
    const { clock, engine, timeline, phaseEvents, statusEvents } = setup();
    const changes: Array<{ index: number; at: number }> = [];
    engine.on((e) => {
      if (e.type === 'phase') changes.push({ index: e.phase.index, at: engine.elapsed() });
    });
    engine.start();
    while (engine.getStatus() === 'running') {
      clock.advance(16);
      engine.tick();
    }
    expect(phaseEvents()).toEqual(timeline.phases.map((p) => p.index));
    // Fasbytet upptäcks inom en frame efter gränsen, aldrig före.
    for (const c of changes.slice(1)) {
      const boundary = timeline.phases[c.index].startMs;
      expect(c.at).toBeGreaterThanOrEqual(boundary);
      expect(c.at - boundary).toBeLessThan(16);
    }
    expect(statusEvents()).toEqual(['running', 'finished']);
  });

  it('paus fryser tiden, fortsätt fortsätter exakt där den stod', () => {
    const { clock, engine } = setup();
    engine.start();
    clock.advance(2500);
    engine.pause();
    expect(engine.elapsed()).toBe(2500);

    clock.advance(60_000); // lång paus
    const paused = engine.tick();
    expect(paused.status).toBe('paused');
    expect(paused.elapsedMs).toBe(2500);
    expect(paused.phase!.index).toBe(0);

    engine.resume();
    expect(engine.elapsed()).toBe(2500);
    clock.advance(1500);
    const s = engine.tick();
    expect(s.elapsedMs).toBe(4000);
    expect(s.phase!.index).toBe(1);
    expect(s.phaseElapsedMs).toBe(0);
  });

  it('flera pauser summeras korrekt och total längd behålls', () => {
    const { clock, engine, timeline } = setup();
    engine.start();
    for (let i = 0; i < 5; i++) {
      clock.advance(1000);
      engine.pause();
      clock.advance(7777);
      engine.resume();
    }
    expect(engine.elapsed()).toBe(5000);
    clock.advance(timeline.totalMs - 5000 - 1);
    expect(engine.tick().status).toBe('running');
    clock.advance(1);
    expect(engine.tick().status).toBe('finished');
  });

  it('inga fasbyten under paus', () => {
    const { clock, engine, phaseEvents } = setup();
    engine.start();
    engine.pause();
    clock.advance(100_000);
    engine.tick();
    expect(phaseEvents()).toEqual([0]);
  });

  it('paus kör ikapp fasbyten som hann ske före pausen', () => {
    const { clock, engine, phaseEvents } = setup();
    engine.start();
    clock.advance(4100); // ingen tick emellan
    engine.pause();
    expect(phaseEvents()).toEqual([0, 1]);
    expect(engine.elapsed()).toBe(4100);
  });

  it('hoppad tid (bakgrund) ger bara aktuell fas, inte en storm av händelser', () => {
    const { clock, engine, phaseEvents } = setup();
    engine.start();
    clock.advance(13_000);
    engine.tick();
    expect(phaseEvents()).toEqual([0, 3]);
  });

  it('slutar exakt vid totalMs', () => {
    const { clock, engine, timeline, statusEvents } = setup(box, 3);
    engine.start();
    expect(engine.tick().phase!.kind).toBe('prepare');
    clock.advance(timeline.totalMs - 1);
    const s = engine.tick();
    expect(s.status).toBe('running');
    expect(s.remainingMs).toBe(1);
    clock.advance(1);
    const end = engine.tick();
    expect(end.status).toBe('finished');
    expect(end.remainingMs).toBe(0);
    expect(engine.elapsed()).toBe(timeline.totalMs);
    expect(statusEvents()).toEqual(['running', 'finished']);
    // Ingen ytterligare händelse efteråt.
    clock.advance(10_000);
    engine.tick();
    expect(statusEvents()).toEqual(['running', 'finished']);
  });

  it('avbryt fryser tiden och kan inte återupptas', () => {
    const { clock, engine } = setup();
    engine.start();
    clock.advance(5000);
    engine.stop();
    clock.advance(5000);
    expect(engine.getStatus()).toBe('stopped');
    expect(engine.elapsed()).toBe(5000);
    engine.resume();
    expect(engine.getStatus()).toBe('stopped');
  });

  it('avbryt under paus behåller tiden vid pausen', () => {
    const { clock, engine } = setup();
    engine.start();
    clock.advance(3000);
    engine.pause();
    clock.advance(9000);
    engine.stop();
    expect(engine.elapsed()).toBe(3000);
  });

  it('ignorerar ogiltiga övergångar', () => {
    const { engine, statusEvents } = setup();
    engine.pause();
    engine.resume();
    expect(engine.getStatus()).toBe('idle');
    engine.start();
    engine.start();
    engine.resume();
    expect(statusEvents()).toEqual(['running']);
  });
});
