import type { Technique } from '../engine/types';
import { BUILTIN_TECHNIQUES } from '../techniques/builtin';
import { parseTechniques } from '../techniques/parse';
import {
  DEFAULT_SETTINGS,
  db as defaultDb,
  type AndrumDB,
  type AppSettings,
  type DailyMetric,
  type Rating,
  type SessionRecord,
} from './schema';

/** Sessioner kortare än så här sparas inte (felstarter). */
export const MIN_SAVED_SESSION_SEC = 10;

export async function saveSession(rec: Omit<SessionRecord, 'id'>, d: AndrumDB = defaultDb): Promise<number | null> {
  if (rec.actualSec < MIN_SAVED_SESSION_SEC) return null;
  return (await d.sessions.add(rec)) as number;
}

export async function rateSession(id: number, before: Rating, after: Rating, d: AndrumDB = defaultDb): Promise<void> {
  await d.sessions.update(id, { before, after });
}

export async function loadSettings(d: AndrumDB = defaultDb): Promise<AppSettings> {
  const stored = await d.settings.get('app');
  // Nya fält i senare versioner får standardvärden.
  return { ...DEFAULT_SETTINGS, ...stored, id: 'app' };
}

export async function saveSettings(s: AppSettings, d: AndrumDB = defaultDb): Promise<void> {
  await d.settings.put({ ...s, id: 'app' });
}

/** Lägger till (eller ersätter) egna tekniker från JSON. Returnerar de som sparats. */
export async function importCustomTechniques(json: unknown, d: AndrumDB = defaultDb): Promise<Technique[]> {
  const list = parseTechniques(json, BUILTIN_TECHNIQUES.map((t) => t.id));
  await d.customTechniques.bulkPut(list);
  return list;
}

export async function deleteCustomTechnique(id: string, d: AndrumDB = defaultDb): Promise<void> {
  await d.customTechniques.delete(id);
}

/** Lokalt datum 'YYYY-MM-DD'. */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Be webbläsaren att inte rensa datan automatiskt (viktigt på iOS). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function saveBolt(seconds: number, note: string | undefined, date = Date.now(), d: AndrumDB = defaultDb): Promise<number> {
  return (await d.boltResults.add({ date, seconds, ...(note?.trim() ? { note: note.trim() } : {}) })) as number;
}

export async function deleteBolt(id: number, d: AndrumDB = defaultDb): Promise<void> {
  await d.boltResults.delete(id);
}

/** Ett dagsvärde per datum – sparar över befintligt. */
export async function saveDailyMetric(m: DailyMetric, d: AndrumDB = defaultDb): Promise<void> {
  await d.dailyMetrics.put(m);
}

export async function deleteDailyMetric(date: string, d: AndrumDB = defaultDb): Promise<void> {
  await d.dailyMetrics.delete(date);
}
