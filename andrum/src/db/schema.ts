import Dexie, { type EntityTable } from 'dexie';
import type { AmbientType } from '../audio/ambient';
import type { Technique } from '../engine/types';
import type { SessionSettings } from '../techniques/settings';

/** Skattning 1–10. */
export interface Rating {
  energy: number;
  stress: number;
  focus: number;
}

export interface SessionRecord {
  id?: number;
  techniqueId: string;
  /** Namnet sparas så historiken håller även om tekniken tas bort. */
  techniqueName: string;
  /** Epok-ms. */
  startedAt: number;
  endedAt: number;
  /** Planerad andningstid (s), utan nedräkning. */
  plannedSec: number;
  /** Faktisk andningstid (s), utan nedräkning och pauser. */
  actualSec: number;
  completed: boolean;
  settings?: SessionSettings;
  programId?: string;
  programDay?: number;
  before?: Rating;
  after?: Rating;
}

export interface BoltResult {
  id?: number;
  /** Epok-ms. */
  date: number;
  seconds: number;
  note?: string;
}

export interface DailyMetric {
  /** Lokalt datum 'YYYY-MM-DD' – en rad per dag. */
  date: string;
  restingHr?: number;
  hrv?: number;
}

export interface ProgramState {
  id: 'active';
  programId: string;
  /** Lokalt datum 'YYYY-MM-DD' då programmet startade. */
  startDate: string;
}

export interface AppSettings {
  id: 'app';
  soundOn: boolean;
  cueVolume: number;
  ambient: AmbientType;
  ambientVolume: number;
  vibration: boolean;
  /** Standardlängd i minuter för tekniker med tidslängd. null = teknikens egen. */
  defaultMinutes: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  soundOn: true,
  cueVolume: 0.7,
  ambient: 'brown',
  ambientVolume: 0.35,
  vibration: true,
  defaultMinutes: null,
};

export class AndrumDB extends Dexie {
  sessions!: EntityTable<SessionRecord, 'id'>;
  boltResults!: EntityTable<BoltResult, 'id'>;
  dailyMetrics!: EntityTable<DailyMetric, 'date'>;
  customTechniques!: EntityTable<Technique, 'id'>;
  programState!: EntityTable<ProgramState, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;

  constructor(name = 'andrum') {
    super(name);
    // Nya versioner läggs till nedanför – ändra aldrig en befintlig.
    this.version(1).stores({
      sessions: '++id, startedAt, techniqueId',
      boltResults: '++id, date',
      dailyMetrics: '&date',
      customTechniques: '&id',
      programState: '&id',
      settings: '&id',
    });
  }
}

export const db = new AndrumDB();

export const TABLES = ['sessions', 'boltResults', 'dailyMetrics', 'customTechniques', 'programState', 'settings'] as const;
export type TableName = (typeof TABLES)[number];
