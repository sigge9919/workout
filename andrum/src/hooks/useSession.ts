import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../audio/AudioEngine';
import { CueScheduler } from '../audio/scheduler';
import { orbScale } from '../components/BreathOrb';
import { SessionEngine, stateAt } from '../engine/engine';
import type { EngineState, EngineStatus, PhaseKind, Timeline } from '../engine/types';
import { vibrateForPhase } from '../lib/haptics';
import { getPrefs } from '../lib/prefs';
import { ScreenWakeLock } from '../lib/wakeLock';

/** Det som visas som text – uppdateras bara när något synligt ändras. */
export interface SessionView {
  status: EngineStatus;
  phaseIndex: number;
  phaseKind: PhaseKind;
  label: string;
  /** Hela sekunder kvar i fasen (nedräkning). */
  phaseSecondsLeft: number;
  remainingMs: number;
  elapsedMs: number;
  round: number;
}

function toView(s: EngineState): SessionView {
  return {
    status: s.status,
    phaseIndex: s.phase?.index ?? -1,
    phaseKind: s.phase?.kind ?? 'exhale',
    label: s.phase?.label ?? '',
    phaseSecondsLeft: Math.ceil(s.phaseRemainingMs / 1000),
    // Avrunda till hel sekund så att vyn inte renderas varje frame.
    remainingMs: Math.ceil(s.remainingMs / 1000) * 1000,
    elapsedMs: Math.floor(s.elapsedMs / 1000) * 1000,
    round: s.phase?.round ?? 0,
  };
}

function sameView(a: SessionView, b: SessionView): boolean {
  return (
    a.status === b.status &&
    a.phaseIndex === b.phaseIndex &&
    a.phaseSecondsLeft === b.phaseSecondsLeft &&
    a.remainingMs === b.remainingMs
  );
}

/**
 * Kör en session: motor + animationsloop (rAF) + ljudschemaläggning
 * (intervall, fortsätter även när rAF stryps) + wake lock + vibration.
 */
export function useSession(timeline: Timeline) {
  const orbRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SessionEngine | null>(null);
  const schedulerRef = useRef<CueScheduler | null>(null);
  const wakeLockRef = useRef(new ScreenWakeLock());
  const [view, setView] = useState<SessionView>(() => toView(stateAt(timeline, 0, 'idle')));
  const [actualMs, setActualMs] = useState(0);

  const publish = useCallback((s: EngineState) => {
    setView((prev) => {
      const next = toView(s);
      return sameView(prev, next) ? prev : next;
    });
  }, []);

  const finishSideEffects = useCallback(() => {
    schedulerRef.current?.cancelPending();
    audio.stopAmbient(3);
    void wakeLockRef.current.release();
  }, []);

  const startingRef = useRef(false);

  const start = useCallback(async () => {
    if (engineRef.current || startingRef.current) return;
    startingRef.current = true;
    const prefs = getPrefs();
    // Allt som kräver en användargest görs här, synkront i klicket.
    const unlocked = audio.unlock();
    void wakeLockRef.current.acquire();
    audio.setEnabled(prefs.soundOn);
    audio.setCueVolume(prefs.cueVolume);
    audio.setAmbientVolume(prefs.ambientVolume);
    audio.setAmbient(prefs.ambient);
    await unlocked;
    audio.startAmbient();

    const engine = new SessionEngine(timeline);
    const scheduler = new CueScheduler(timeline);
    engine.on((e) => {
      if (e.type === 'phase' && getPrefs().vibration && e.phase.kind !== 'prepare') vibrateForPhase(e.phase.kind);
      if (e.type === 'status' && e.status === 'finished') {
        setActualMs(engine.elapsed());
        finishSideEffects();
      }
    });
    engineRef.current = engine;
    schedulerRef.current = scheduler;
    engine.start();
    scheduler.sync(engine.elapsed());
    publish(engine.tick());
  }, [timeline, publish, finishSideEffects]);

  const pause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.pause();
    schedulerRef.current?.cancelPending();
    audio.duckAmbient(true);
    publish(engine.tick());
  }, [publish]);

  const resume = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await audio.unlock(); // iOS kan ha stängt av ljudet under pausen
    audio.duckAmbient(false);
    engine.resume();
    schedulerRef.current?.sync(engine.elapsed());
    publish(engine.tick());
  }, [publish]);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.stop();
    setActualMs(engine.elapsed());
    finishSideEffects();
    publish(engine.tick());
  }, [publish, finishSideEffects]);

  // Animationsloop: cirkeln uppdateras direkt i DOM varje frame.
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const engine = engineRef.current;
      if (engine) {
        const s = engine.tick();
        if (orbRef.current) orbRef.current.style.transform = `scale(${orbScale(s.level)})`;
        publish(s);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [publish]);

  // Ljudschemaläggning på intervall – oberoende av bildfrekvensen.
  useEffect(() => {
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.tick();
      if (engine.getStatus() === 'running') schedulerRef.current?.sync(engine.elapsed());
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  // Städa om användaren lämnar sidan mitt i.
  useEffect(() => {
    const wakeLock = wakeLockRef.current;
    return () => {
      const engine = engineRef.current;
      if (engine && (engine.getStatus() === 'running' || engine.getStatus() === 'paused')) engine.stop();
      schedulerRef.current?.cancelPending();
      audio.stopAmbient(0.8);
      void wakeLock.release();
    };
  }, []);

  return { view, orbRef, start, pause, resume, stop, actualMs, started: view.status !== 'idle' };
}
