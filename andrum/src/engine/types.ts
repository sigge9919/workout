/**
 * Datamodell för tekniker och sessionsmotorn.
 * Tekniker är ren data: motorn kompilerar dem till en absolut tidslinje.
 */

export type PhaseKind =
  | 'prepare' // "Gör dig redo" före första andetaget
  | 'inhale'
  | 'inhale2' // extra påfyllning, t.ex. fysiologisk suck
  | 'holdIn' // håll med fulla lungor
  | 'exhale'
  | 'holdOut' // håll med tomma lungor
  | 'rest'; // fri andning mellan rundor

export type Situation = 'prematch' | 'break' | 'post' | 'sleep' | 'focus';

export interface PhaseSpec {
  kind: Exclude<PhaseKind, 'prepare' | 'rest'>;
  seconds: number;
  /** Överstyr standardtexten för fasen. */
  label?: string;
}

export type LengthSpec =
  | { mode: 'duration'; seconds: number }
  | { mode: 'cycles'; count: number };

export interface RoundsSpec {
  count: number;
  /** Antal andningscykler i varje runda innan hållningen. */
  cyclesPerRound: number;
  /** Andetagshållning i slutet av varje runda. */
  hold?: {
    after: 'inhale' | 'exhale';
    seconds: number;
    /** Ökning av hållningen per runda (progression). */
    incrementSeconds?: number;
  };
  /** Fri andning efter varje runda utom den sista. */
  restSeconds: number;
}

export interface Technique {
  id: string;
  name: string;
  /** En rad: vad den är bra för. */
  purpose: string;
  /** Vad den gör och när den passar. */
  description: string;
  tags: Situation[];
  /** Ett andetag / en cykel. */
  cycle: PhaseSpec[];
  /** Total längd. Ignoreras om `rounds` är satt. */
  length: LengthSpec;
  rounds?: RoundsSpec;
  adjustable?: {
    /** Tempo i andetag per minut. Cykelns proportioner behålls. */
    breathsPerMinute?: { min: number; max: number; step: number; default: number };
    /** Om längden (minuter) får ändras. */
    duration?: { minMinutes: number; maxMinutes: number };
  };
  /** Visar varningstext om andetagshållning. */
  hasBreathHold: boolean;
  builtin: boolean;
}

export interface CompileOptions {
  /** Överstyr tempot (kräver inte adjustable, men UI begränsar det). */
  breathsPerMinute?: number;
  /** Överstyr längden i sekunder (läge duration). */
  durationSeconds?: number;
  /** Överstyr antal cykler (läge cycles). */
  cycles?: number;
  /** Nedräkning innan start. Standard 3 s. */
  leadInSeconds?: number;
}

export interface TimelinePhase {
  index: number;
  kind: PhaseKind;
  label: string;
  /** Absolut start i ms från sessionens början (heltal). */
  startMs: number;
  /** Absolut slut i ms (exklusivt, heltal). */
  endMs: number;
  durationMs: number;
  /** Runda (0-baserad). 0 för tekniker utan rundor. */
  round: number;
  /** Andningscykel inom sessionen (0-baserad), -1 för prepare/rest. */
  cycle: number;
  /** Cirkelns storlek 0..1 vid fasens start resp. slut. */
  fromLevel: number;
  toLevel: number;
}

export interface Timeline {
  techniqueId: string;
  phases: TimelinePhase[];
  totalMs: number;
  /** Tid för själva andningen, utan nedräkningen. */
  breathingMs: number;
  roundCount: number;
}

export type EngineStatus = 'idle' | 'running' | 'paused' | 'finished' | 'stopped';

export interface EngineState {
  status: EngineStatus;
  elapsedMs: number;
  remainingMs: number;
  totalMs: number;
  /** Aktuell fas, null när sessionen är klar eller inte startad. */
  phase: TimelinePhase | null;
  phaseElapsedMs: number;
  phaseRemainingMs: number;
  /** 0..1 inom aktuell fas. */
  phaseProgress: number;
  /** Cirkelns nivå 0..1 (med easing). */
  level: number;
}
