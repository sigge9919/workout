import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { SoundControls } from '../components/SoundSettings';
import { Stepper } from '../components/Stepper';
import { BigButton, Card, Toggle } from '../components/ui';
import { exportBackup, importBackup, parseBackup, readJsonFile, saveBackupFile, type Backup } from '../db/backup';
import { deleteCustomTechnique, importCustomTechniques, loadSettings } from '../db/repo';
import { db } from '../db/schema';
import { plural } from '../lib/format';
import { replacePrefs, setPrefs, usePrefs } from '../lib/prefs';

const EXAMPLE = `{
  "id": "min-teknik",
  "name": "Min teknik",
  "purpose": "Kort syfte",
  "description": "Vad den gör och när den passar.",
  "tags": ["focus"],
  "cycle": [
    { "kind": "inhale", "seconds": 4 },
    { "kind": "holdIn", "seconds": 2 },
    { "kind": "exhale", "seconds": 6 }
  ],
  "length": { "mode": "duration", "seconds": 300 },
  "adjustable": { "duration": { "minMinutes": 2, "maxMinutes": 20 } }
}`;

export function SettingsPage() {
  return (
    <div className="safe-screen mx-auto flex max-w-lg flex-col gap-6 px-5 pb-6">
      <header className="pt-6">
        <h1 className="text-3xl font-semibold tracking-tight">Inställningar</h1>
      </header>
      <SessionSection />
      <Section title="Ljud och vibration">
        <Card>
          <SoundControls />
        </Card>
      </Section>
      <CustomTechniquesSection />
      <BackupSection />
      <Section title="Om">
        <Card className="text-sm leading-relaxed text-muted">
          Andrum är ett personligt träningsverktyg, inte medicinsk rådgivning. Gör aldrig andetagshållningar i eller
          nära vatten, under bilkörning eller där yrsel kan vara farligt. All data stannar på den här enheten.
        </Card>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-widest text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Message({ kind, children }: { kind: 'ok' | 'error'; children: React.ReactNode }) {
  return (
    <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${kind === 'ok' ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}`}>
      {children}
    </p>
  );
}

function SessionSection() {
  const prefs = usePrefs();
  const custom = prefs.defaultMinutes !== null;
  return (
    <Section title="Session">
      <Card className="flex flex-col divide-y divide-line py-2">
        <Toggle
          label="Egen standardlängd"
          hint={custom ? 'Gäller tekniker med justerbar längd' : 'Varje teknik använder sin egen längd'}
          checked={custom}
          onChange={(on) => setPrefs({ defaultMinutes: on ? 10 : null })}
        />
        {custom && (
          <Stepper
            label="Längd"
            unit="min"
            value={prefs.defaultMinutes!}
            min={1}
            max={30}
            step={1}
            onChange={(defaultMinutes) => setPrefs({ defaultMinutes })}
          />
        )}
      </Card>
    </Section>
  );
}

function CustomTechniquesSection() {
  const custom = useLiveQuery(() => db.customTechniques.toArray(), []) ?? [];
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doImport = async (json: unknown) => {
    try {
      const list = await importCustomTechniques(json);
      setMsg({ kind: 'ok', text: `Sparade ${list.map((t) => t.name).join(', ')}.` });
      setText('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Kunde inte läsa tekniken.' });
    }
  };

  const fromText = () => {
    try {
      void doImport(JSON.parse(text));
    } catch {
      setMsg({ kind: 'error', text: 'Texten är inte giltig JSON.' });
    }
  };

  return (
    <Section title="Egna tekniker">
      {custom.length > 0 && (
        <Card className="flex flex-col divide-y divide-line py-1">
          {custom.map((t) => (
            <div key={t.id} className="flex min-h-16 items-center justify-between gap-3">
              <span className="min-w-0 truncate">{t.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (confirmDelete === t.id) {
                    void deleteCustomTechnique(t.id);
                    setConfirmDelete(null);
                  } else setConfirmDelete(t.id);
                }}
                className={`min-h-12 shrink-0 rounded-xl px-4 text-sm ${confirmDelete === t.id ? 'bg-danger/15 text-danger' : 'text-muted'}`}
              >
                {confirmDelete === t.id ? 'Tryck igen för att ta bort' : 'Ta bort'}
              </button>
            </div>
          ))}
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Lägg till tekniker som JSON – ett objekt eller en lista. Samma id ersätter en befintlig egen teknik.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Klistra in JSON här"
          rows={5}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="w-full rounded-2xl border border-line bg-ink p-3 font-mono text-sm text-text placeholder:text-muted"
        />
        <div className="grid grid-cols-2 gap-3">
          <BigButton variant="secondary" disabled={!text.trim()} onClick={fromText}>
            Lägg till
          </BigButton>
          <BigButton variant="secondary" onClick={() => fileRef.current?.click()}>
            Från fil
          </BigButton>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              await doImport(await readJsonFile(f));
            } catch (err) {
              setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Kunde inte läsa filen.' });
            }
          }}
        />
        {msg && <Message kind={msg.kind}>{msg.text}</Message>}
        <details className="text-sm">
          <summary className="min-h-12 cursor-pointer py-3 text-muted">Visa format</summary>
          <pre className="overflow-x-auto rounded-2xl bg-ink p-3 text-xs leading-relaxed text-muted">{EXAMPLE}</pre>
          <p className="mt-2 leading-relaxed text-muted">
            Faser: <code>inhale</code>, <code>inhale2</code> (påfyllning), <code>holdIn</code>, <code>exhale</code>,{' '}
            <code>holdOut</code>. Längd: <code>{'{"mode":"duration","seconds":300}'}</code> eller{' '}
            <code>{'{"mode":"cycles","count":6}'}</code>. Rundor med hållning:{' '}
            <code>{'"rounds":{"count":4,"cyclesPerRound":5,"hold":{"after":"exhale","seconds":15,"incrementSeconds":5},"restSeconds":30}'}</code>
            . Situationer: prematch, break, post, sleep, focus.
          </p>
        </details>
      </Card>
    </Section>
  );
}

function BackupSection() {
  const [pending, setPending] = useState<Backup | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const counts = useLiveQuery(async () => ({ sessions: await db.sessions.count(), bolt: await db.boltResults.count() }), []);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  const doExport = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const result = await saveBackupFile(await exportBackup());
      if (result !== 'cancelled') setMsg({ kind: 'ok', text: result === 'shared' ? 'Backupen är delad.' : 'Backupen är nedladdad.' });
    } catch {
      setMsg({ kind: 'error', text: 'Kunde inte skapa backupen.' });
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await importBackup(pending, mode);
      replacePrefs(await loadSettings());
      setMsg({
        kind: 'ok',
        text: `${mode === 'replace' ? 'Ersatt' : 'Sammanslaget'}: ${plural(r.sessions, 'session', 'sessioner')}, ${r.boltResults} BOLT-resultat, ${plural(r.dailyMetrics, 'dagsvärde', 'dagsvärden')}, ${plural(r.customTechniques, 'egen teknik', 'egna tekniker')}.`,
      });
      setPending(null);
    } catch {
      setMsg({ kind: 'error', text: 'Importen misslyckades. Ingen data ändrades.' });
    } finally {
      setBusy(false);
      setConfirmReplace(false);
    }
  };

  return (
    <Section title="Backup">
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          All data finns bara på den här enheten
          {counts ? ` (${plural(counts.sessions, 'session', 'sessioner')}, ${counts.bolt} BOLT-resultat)` : ''}. Exportera en backup då och då,
          t.ex. till Filer eller iCloud Drive.
          {persisted === false && ' Webbläsaren har inte lovat att spara datan permanent – installera appen på hemskärmen och ta backup regelbundet.'}
        </p>
        <BigButton onClick={doExport} disabled={busy}>
          Exportera backup
        </BigButton>
        <BigButton variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          Importera backup
        </BigButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setMsg(null);
            try {
              setPending(parseBackup(await readJsonFile(f)));
            } catch (err) {
              setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Kunde inte läsa filen.' });
            }
          }}
        />

        {pending && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-ink p-4">
            <p className="text-sm">
              Backup{pending.exportedAt ? ` från ${new Date(pending.exportedAt).toLocaleString('sv-SE')}` : ''}:{' '}
              {plural(pending.data.sessions.length, 'session', 'sessioner')}, {pending.data.boltResults.length} BOLT-resultat,{' '}
              {plural(pending.data.dailyMetrics.length, 'dagsvärde', 'dagsvärden')},{' '}
              {plural(pending.data.customTechniques.length, 'egen teknik', 'egna tekniker')}.
            </p>
            <BigButton variant="secondary" disabled={busy} onClick={() => doImport('merge')}>
              Slå ihop med befintlig data
            </BigButton>
            <BigButton
              variant="danger"
              disabled={busy}
              onClick={() => (confirmReplace ? doImport('replace') : setConfirmReplace(true))}
            >
              {confirmReplace ? 'Tryck igen – all nuvarande data ersätts' : 'Ersätt all data'}
            </BigButton>
            <button
              type="button"
              className="min-h-12 text-muted"
              onClick={() => {
                setPending(null);
                setConfirmReplace(false);
              }}
            >
              Avbryt
            </button>
          </div>
        )}
        {msg && <Message kind={msg.kind}>{msg.text}</Message>}
      </Card>
    </Section>
  );
}
