import { BUILTIN_TECHNIQUES } from '../techniques/builtin';
import { parseTechniques } from '../techniques/parse';
import { localDate } from './repo';
import {
  DEFAULT_SETTINGS,
  db as defaultDb,
  type AndrumDB,
  type AppSettings,
  type BoltResult,
  type DailyMetric,
  type ProgramState,
  type SessionRecord,
} from './schema';
import type { Technique } from '../engine/types';

export const BACKUP_APP = 'andrum';
export const BACKUP_SCHEMA_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  data: {
    sessions: SessionRecord[];
    boltResults: BoltResult[];
    dailyMetrics: DailyMetric[];
    customTechniques: Technique[];
    programState: ProgramState[];
    settings: AppSettings[];
  };
}

export class BackupError extends Error {}

export async function exportBackup(d: AndrumDB = defaultDb, now = new Date()): Promise<Backup> {
  return d.transaction('r', d.tables, async () => ({
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: {
      sessions: await d.sessions.orderBy('startedAt').toArray(),
      boltResults: await d.boltResults.orderBy('date').toArray(),
      dailyMetrics: await d.dailyMetrics.toArray(),
      customTechniques: await d.customTechniques.toArray(),
      programState: await d.programState.toArray(),
      settings: await d.settings.toArray(),
    },
  }));
}

export function backupFilename(now = new Date()): string {
  return `andrum-backup-${localDate(now)}.json`;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRating = (v: unknown) =>
  v === undefined || (isObj(v) && ['energy', 'stress', 'focus'].every((k) => isNum(v[k]) && (v[k] as number) >= 1 && (v[k] as number) <= 10));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Kontrollerar en backupfil innan något skrivs. Kastar BackupError med förklaring. */
export function parseBackup(input: unknown): Backup {
  if (!isObj(input) || input.app !== BACKUP_APP) throw new BackupError('Filen är inte en backup från Andrum.');
  if (!isNum(input.schemaVersion) || input.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupError('Backupen kommer från en nyare version av appen. Uppdatera appen först.');
  }
  const data = input.data;
  if (!isObj(data)) throw new BackupError('Backupen saknar data.');
  const arr = (k: string): unknown[] => {
    const v = data[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new BackupError(`"${k}" måste vara en lista.`);
    return v;
  };
  const bad = (what: string, i: number): never => {
    throw new BackupError(`Ogiltig post i ${what} (nr ${i + 1}).`);
  };

  const sessions = arr('sessions').map((s, i) => {
    if (
      !isObj(s) ||
      typeof s.techniqueId !== 'string' ||
      typeof s.techniqueName !== 'string' ||
      !isNum(s.startedAt) ||
      !isNum(s.endedAt) ||
      !isNum(s.plannedSec) ||
      !isNum(s.actualSec) ||
      typeof s.completed !== 'boolean' ||
      !isRating(s.before) ||
      !isRating(s.after)
    ) {
      return bad('sessions', i);
    }
    return s as unknown as SessionRecord;
  });
  const boltResults = arr('boltResults').map((b, i) =>
    isObj(b) && isNum(b.date) && isNum(b.seconds) && b.seconds >= 0 ? (b as unknown as BoltResult) : bad('boltResults', i),
  );
  const dailyMetrics = arr('dailyMetrics').map((m, i) =>
    isObj(m) &&
    typeof m.date === 'string' &&
    DATE_RE.test(m.date) &&
    (m.restingHr === undefined || isNum(m.restingHr)) &&
    (m.hrv === undefined || isNum(m.hrv))
      ? (m as unknown as DailyMetric)
      : bad('dailyMetrics', i),
  );
  let customTechniques: Technique[] = [];
  const rawTechniques = arr('customTechniques');
  if (rawTechniques.length) {
    try {
      customTechniques = parseTechniques(rawTechniques, BUILTIN_TECHNIQUES.map((t) => t.id));
    } catch (e) {
      throw new BackupError(`Ogiltig egen teknik: ${e instanceof Error ? e.message : ''}`);
    }
  }
  const programState = arr('programState').map((p, i) =>
    isObj(p) && p.id === 'active' && typeof p.programId === 'string' && typeof p.startDate === 'string' && DATE_RE.test(p.startDate)
      ? (p as unknown as ProgramState)
      : bad('programState', i),
  );
  const settings = arr('settings').map((s, i) =>
    isObj(s) && s.id === 'app' ? ({ ...DEFAULT_SETTINGS, ...(s as object), id: 'app' } as AppSettings) : bad('settings', i),
  );

  return {
    app: BACKUP_APP,
    schemaVersion: input.schemaVersion,
    exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : '',
    data: { sessions, boltResults, dailyMetrics, customTechniques, programState, settings },
  };
}

export type ImportMode = 'replace' | 'merge';

export interface ImportResult {
  sessions: number;
  boltResults: number;
  dailyMetrics: number;
  customTechniques: number;
}

/**
 * replace: all befintlig data ersätts av backupen.
 * merge: sessioner och BOLT läggs till om de inte redan finns (samma
 * tidpunkt), dagsvärden och egna tekniker från backupen skriver över,
 * inställningar och aktivt program behålls.
 */
export async function importBackup(backup: Backup, mode: ImportMode, d: AndrumDB = defaultDb): Promise<ImportResult> {
  const { data } = backup;
  const stripId = <T extends { id?: number }>(x: T): T => {
    const { id: _id, ...rest } = x;
    return rest as T;
  };

  return d.transaction('rw', d.tables, async () => {
    if (mode === 'replace') {
      await Promise.all(d.tables.map((t) => t.clear()));
      await d.sessions.bulkAdd(data.sessions.map(stripId));
      await d.boltResults.bulkAdd(data.boltResults.map(stripId));
      await d.dailyMetrics.bulkPut(data.dailyMetrics);
      await d.customTechniques.bulkPut(data.customTechniques);
      await d.programState.bulkPut(data.programState);
      await d.settings.bulkPut(data.settings);
      return {
        sessions: data.sessions.length,
        boltResults: data.boltResults.length,
        dailyMetrics: data.dailyMetrics.length,
        customTechniques: data.customTechniques.length,
      };
    }

    const sessionKeys = new Set((await d.sessions.toArray()).map((s) => `${s.startedAt}|${s.techniqueId}`));
    const newSessions = data.sessions.filter((s) => !sessionKeys.has(`${s.startedAt}|${s.techniqueId}`));
    await d.sessions.bulkAdd(newSessions.map(stripId));

    const boltKeys = new Set((await d.boltResults.toArray()).map((b) => b.date));
    const newBolt = data.boltResults.filter((b) => !boltKeys.has(b.date));
    await d.boltResults.bulkAdd(newBolt.map(stripId));

    await d.dailyMetrics.bulkPut(data.dailyMetrics);
    await d.customTechniques.bulkPut(data.customTechniques);
    return {
      sessions: newSessions.length,
      boltResults: newBolt.length,
      dailyMetrics: data.dailyMetrics.length,
      customTechniques: data.customTechniques.length,
    };
  });
}

/** Läser en fil som JSON med begripligt fel. */
export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new BackupError('Filen innehåller inte giltig JSON.');
  }
}

/**
 * Sparar backupen. På iPhone öppnas delningsmenyn (spara i Filer, AirDrop,
 * mejl …), annars laddas filen ned.
 */
export async function saveBackupFile(backup: Backup): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = backupFilename();
  const json = JSON.stringify(backup, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Annars: fall tillbaka på nedladdning.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
