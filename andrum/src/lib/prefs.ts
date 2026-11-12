import { useSyncExternalStore } from 'react';
import { loadSettings, saveSettings } from '../db/repo';
import { DEFAULT_SETTINGS, type AppSettings } from '../db/schema';

/**
 * Appinställningar. Läses från IndexedDB vid start och hålls i minnet så
 * att de kan läsas synkront (t.ex. i klicket som startar en session).
 * Varje ändring sparas direkt.
 */
let prefs: AppSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export async function initPrefs(): Promise<void> {
  try {
    prefs = await loadSettings();
    notify();
  } catch {
    /* IndexedDB otillgänglig (t.ex. privat läge) – standardvärden används */
  }
}

export function getPrefs(): AppSettings {
  return prefs;
}

export function setPrefs(patch: Partial<Omit<AppSettings, 'id'>>): void {
  prefs = { ...prefs, ...patch };
  notify();
  void saveSettings(prefs).catch(() => undefined);
}

/** Efter import av backup. */
export function replacePrefs(next: AppSettings): void {
  prefs = next;
  notify();
}

export function usePrefs(): AppSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getPrefs,
  );
}
