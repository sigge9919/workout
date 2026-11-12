import type { SessionSettings } from '../techniques/settings';

export interface ProgramDay {
  /** Kort rubrik för dagen, t.ex. "Matchdag – aktivering". */
  title: string;
  techniqueId: string;
  /** Förinställda värden (samma som i URL:en: bpm, minutes, cycles, rounds, hold). */
  settings?: SessionSettings;
  note?: string;
  /** Påminn om BOLT-mätning den här dagen. */
  bolt?: boolean;
}

export interface Program {
  id: string;
  name: string;
  /** En rad. */
  summary: string;
  description: string;
  /** Veckor med exakt 7 dagar; null = vilodag. Dag 1 = startdatum. */
  weeks: Array<{ title: string; days: Array<ProgramDay | null> }>;
  /** Upprepas efter sista dagen (t.ex. matchvecka varje vecka). */
  repeat: boolean;
  /**
   * Programmet startas från en händelse i stället för ett startdatum.
   * Startdatum = händelsedatum − dayIndex.
   */
  anchor?: { label: string; dayIndex: number };
}
