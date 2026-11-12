import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { Technique } from '../engine/types';
import { BUILTIN_TECHNIQUES } from './builtin';

/** Inbyggda + egna tekniker. Undefined medan databasen läses. */
export function useAllTechniques(): Technique[] | undefined {
  const custom = useLiveQuery(() => db.customTechniques.toArray(), [], null);
  if (custom === null) return undefined;
  return [...BUILTIN_TECHNIQUES, ...custom.sort((a, b) => a.name.localeCompare(b.name, 'sv'))];
}

export function useTechnique(id: string): { technique: Technique | undefined; loading: boolean } {
  const all = useAllTechniques();
  return { technique: all?.find((t) => t.id === id), loading: all === undefined };
}
