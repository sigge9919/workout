import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackupError, exportBackup, importBackup, parseBackup } from '../backup';
import {
  deleteCustomTechnique,
  importCustomTechniques,
  loadSettings,
  localDate,
  rateSession,
  saveSession,
  saveSettings,
} from '../repo';
import { AndrumDB, DEFAULT_SETTINGS, type SessionRecord } from '../schema';
import { TechniqueError } from '../../engine/timeline';

let d: AndrumDB;
let n = 0;
beforeEach(() => {
  d = new AndrumDB(`test-${n++}`);
});
afterEach(async () => {
  await d.delete();
});

const session = (startedAt: number, extra: Partial<SessionRecord> = {}): Omit<SessionRecord, 'id'> => ({
  techniqueId: 'box',
  techniqueName: 'Box breathing',
  startedAt,
  endedAt: startedAt + 240_000,
  plannedSec: 240,
  actualSec: 240,
  completed: true,
  ...extra,
});

const custom = {
  id: 'min-teknik',
  name: 'Min teknik',
  cycle: [
    { kind: 'inhale', seconds: 3 },
    { kind: 'exhale', seconds: 6 },
  ],
  length: { mode: 'duration', seconds: 180 },
};

describe('sessioner', () => {
  it('sparar och skattar en session', async () => {
    const id = await saveSession(session(1000), d);
    expect(id).toBeTypeOf('number');
    await rateSession(id!, { energy: 4, stress: 7, focus: 5 }, { energy: 6, stress: 3, focus: 7 }, d);
    const rec = await d.sessions.get(id!);
    expect(rec).toMatchObject({ techniqueId: 'box', before: { stress: 7 }, after: { stress: 3 } });
  });

  it('sparar inte felstarter under 10 s', async () => {
    expect(await saveSession(session(1000, { actualSec: 4, completed: false }), d)).toBeNull();
    expect(await d.sessions.count()).toBe(0);
  });
});

describe('inställningar', () => {
  it('standardvärden när inget sparats, sedan sparade värden', async () => {
    expect(await loadSettings(d)).toEqual(DEFAULT_SETTINGS);
    await saveSettings({ ...DEFAULT_SETTINGS, soundOn: false, defaultMinutes: 8 }, d);
    expect(await loadSettings(d)).toMatchObject({ soundOn: false, defaultMinutes: 8, cueVolume: 0.7 });
  });

  it('nya fält får standardvärden om de saknas i lagrad data', async () => {
    await d.settings.put({ id: 'app', soundOn: false } as never);
    const s = await loadSettings(d);
    expect(s.soundOn).toBe(false);
    expect(s.ambient).toBe(DEFAULT_SETTINGS.ambient);
  });
});

describe('egna tekniker', () => {
  it('importerar, ersätter och tar bort', async () => {
    const [t] = await importCustomTechniques(custom, d);
    expect(t).toMatchObject({ id: 'min-teknik', builtin: false, hasBreathHold: false, tags: [] });
    await importCustomTechniques([{ ...custom, name: 'Ny' }], d);
    expect((await d.customTechniques.get('min-teknik'))!.name).toBe('Ny');
    await deleteCustomTechnique('min-teknik', d);
    expect(await d.customTechniques.count()).toBe(0);
  });

  it('sätter varningsflaggan när tekniken har hållningar', async () => {
    const [t] = await importCustomTechniques(
      { ...custom, cycle: [...custom.cycle, { kind: 'holdOut', seconds: 2 }] },
      d,
    );
    expect(t.hasBreathHold).toBe(true);
  });

  it('avvisar ogiltiga tekniker med begripligt fel', async () => {
    const bad = (x: unknown) => importCustomTechniques(x, d);
    await expect(bad({ ...custom, id: 'box' })).rejects.toThrow(/inbyggd/);
    await expect(bad({ ...custom, id: 'Med Mellanslag' })).rejects.toThrow(/"id"/);
    await expect(bad({ ...custom, cycle: [{ kind: 'andas', seconds: 3 }] })).rejects.toThrow(/kind/);
    await expect(bad({ ...custom, cycle: [{ kind: 'inhale', seconds: -1 }] })).rejects.toThrow(/seconds/);
    await expect(bad({ ...custom, cycle: [{ kind: 'exhale', seconds: 3 }] })).rejects.toThrow(TechniqueError);
    await expect(bad([custom, custom])).rejects.toThrow(/flera gånger/);
    expect(await d.customTechniques.count()).toBe(0);
  });
});

describe('backup', () => {
  async function seed() {
    const id = await saveSession(session(1000), d);
    await rateSession(id!, { energy: 4, stress: 7, focus: 5 }, { energy: 6, stress: 3, focus: 7 }, d);
    await saveSession(session(2000, { techniqueId: 'co2', techniqueName: 'CO2' }), d);
    await d.boltResults.add({ date: 5000, seconds: 24 });
    await d.dailyMetrics.put({ date: '2026-11-10', restingHr: 48, hrv: 72 });
    await importCustomTechniques(custom, d);
    await d.programState.put({ id: 'active', programId: 'base4', startDate: '2026-11-01' });
    await saveSettings({ ...DEFAULT_SETTINGS, ambient: 'drone' }, d);
  }

  it('export → JSON → import (ersätt) återställer all data', async () => {
    await seed();
    const backup = await exportBackup(d, new Date('2026-11-12T10:00:00Z'));
    const json = JSON.parse(JSON.stringify(backup));
    expect(json).toMatchObject({ app: 'andrum', schemaVersion: 1, exportedAt: '2026-11-12T10:00:00.000Z' });

    const other = new AndrumDB(`test-other-${n++}`);
    try {
      await other.sessions.add(session(9999)); // ska försvinna
      const result = await importBackup(parseBackup(json), 'replace', other);
      expect(result).toEqual({ sessions: 2, boltResults: 1, dailyMetrics: 1, customTechniques: 1 });
      const strip = <T,>(rows: T[]) => rows.map((r) => ({ ...r, id: undefined }));
      expect(strip(await other.sessions.orderBy('startedAt').toArray())).toEqual(strip(backup.data.sessions));
      expect(await other.dailyMetrics.toArray()).toEqual(backup.data.dailyMetrics);
      expect(await other.customTechniques.toArray()).toEqual(backup.data.customTechniques);
      expect(await other.programState.toArray()).toEqual(backup.data.programState);
      expect((await loadSettings(other)).ambient).toBe('drone');
    } finally {
      await other.delete();
    }
  });

  it('import (slå ihop) lägger bara till det som saknas och behåller inställningar', async () => {
    await seed();
    const backup = parseBackup(JSON.parse(JSON.stringify(await exportBackup(d))));
    await saveSettings({ ...DEFAULT_SETTINGS, ambient: 'pink' }, d);
    await d.sessions.add(session(3000));

    const result = await importBackup(backup, 'merge', d);
    expect(result.sessions).toBe(0);
    expect(result.boltResults).toBe(0);
    expect(await d.sessions.count()).toBe(3);
    expect((await loadSettings(d)).ambient).toBe('pink');

    // Ny session i backupen läggs till.
    backup.data.sessions.push({ ...backup.data.sessions[0], startedAt: 4000 });
    expect((await importBackup(backup, 'merge', d)).sessions).toBe(1);
    expect(await d.sessions.count()).toBe(4);
  });

  it('avvisar fel filer innan något skrivs', () => {
    const ok = { app: 'andrum', schemaVersion: 1, data: {} };
    expect(() => parseBackup({ foo: 1 })).toThrow(BackupError);
    expect(() => parseBackup({ ...ok, schemaVersion: 99 })).toThrow(/nyare version/);
    expect(() => parseBackup({ ...ok, data: { sessions: {} } })).toThrow(/lista/);
    expect(() => parseBackup({ ...ok, data: { sessions: [{ techniqueId: 'x' }] } })).toThrow(/sessions/);
    expect(() =>
      parseBackup({ ...ok, data: { sessions: [{ ...session(1), before: { energy: 11, stress: 1, focus: 1 } }] } }),
    ).toThrow(/sessions/);
    expect(() => parseBackup({ ...ok, data: { dailyMetrics: [{ date: '12/11' }] } })).toThrow(/dailyMetrics/);
    expect(parseBackup(ok).data.sessions).toEqual([]);
  });

  it('misslyckad import ändrar ingenting (transaktion)', async () => {
    await seed();
    const backup = parseBackup(JSON.parse(JSON.stringify(await exportBackup(d))));
    const before = await d.sessions.count();
    // Ogiltig primärnyckel → skrivningen misslyckas efter att tabellerna tömts.
    (backup.data as { dailyMetrics: unknown[] }).dailyMetrics = [{ date: undefined }];
    await expect(importBackup(backup, 'replace', d)).rejects.toThrow();
    expect(await d.sessions.count()).toBe(before);
    expect(await d.customTechniques.count()).toBe(1);
  });
});

describe('localDate', () => {
  it('lokalt datum med nollutfyllnad', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
