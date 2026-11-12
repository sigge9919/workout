import { useSyncExternalStore } from 'react';
import type { AmbientType } from '../audio/ambient';

/**
 * Ljud-/vibrationsinställningar. I steg 1 hålls de i minnet;
 * i steg 3 sparas de i IndexedDB.
 */
export interface SoundPrefs {
  soundOn: boolean;
  cueVolume: number;
  ambient: AmbientType;
  ambientVolume: number;
  vibration: boolean;
}

let prefs: SoundPrefs = {
  soundOn: true,
  cueVolume: 0.7,
  ambient: 'brown',
  ambientVolume: 0.35,
  vibration: true,
};

const listeners = new Set<() => void>();

export function getPrefs(): SoundPrefs {
  return prefs;
}

export function setPrefs(patch: Partial<SoundPrefs>): void {
  prefs = { ...prefs, ...patch };
  for (const l of listeners) l();
}

export function usePrefs(): SoundPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getPrefs,
  );
}
