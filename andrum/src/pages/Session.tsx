import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BreathOrb } from '../components/BreathOrb';
import { PatternBar } from '../components/PatternBar';
import { RatingForm } from '../components/RatingForm';
import { SoundSettingsCollapsible } from '../components/SoundSettings';
import { Stepper } from '../components/Stepper';
import { BigButton, Card, HoldWarning } from '../components/ui';
import { rateSession, saveSession } from '../db/repo';
import type { Rating } from '../db/schema';
import { compileTimeline } from '../engine/timeline';
import type { Technique, Timeline } from '../engine/types';
import { useSession } from '../hooks/useSession';
import { formatClock, formatDuration } from '../lib/format';
import { getPrefs } from '../lib/prefs';
import { useTechnique } from '../techniques';
import { effectiveCycle, structureSummary } from '../techniques/describe';
import { clampSettings, settingsFromParams, toCompileOptions, type SessionSettings } from '../techniques/settings';
import { SITUATION_LABELS } from '../techniques/situations';

/**
 * /teknik/:id – förklaring, justering och start på samma sida,
 * sedan helskärmssession. Förinställda värden kan skickas i URL:en.
 */
export function SessionPage() {
  const { id = '' } = useParams();
  const { technique, loading } = useTechnique(id);
  if (loading) return null;
  if (!technique) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-lg">Hittade inte tekniken.</p>
        <Link to="/tekniker" className="min-h-12 text-accent underline">
          Visa alla tekniker
        </Link>
      </div>
    );
  }
  return <SessionForTechnique key={technique.id} technique={technique} />;
}

function SessionForTechnique({ technique }: { technique: Technique }) {
  const [params] = useSearchParams();
  const [settings, setSettings] = useState<SessionSettings>(() => {
    const fromUrl = settingsFromParams(params);
    // Standardlängd från Inställningar gäller när länken inte anger längd.
    const defaultMinutes = getPrefs().defaultMinutes;
    if (fromUrl.minutes === undefined && defaultMinutes !== null) fromUrl.minutes = defaultMinutes;
    return clampSettings(technique, fromUrl);
  });
  const timeline = useMemo(() => compileTimeline(technique, toCompileOptions(settings)), [technique, settings]);
  return (
    <SessionRunner
      technique={technique}
      timeline={timeline}
      settings={settings}
      onSettings={(patch) => setSettings((s) => clampSettings(technique, { ...s, ...patch }))}
    />
  );
}

function SessionRunner({
  technique,
  timeline,
  settings,
  onSettings,
}: {
  technique: Technique;
  timeline: Timeline;
  settings: SessionSettings;
  onSettings: (patch: Partial<SessionSettings>) => void;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const programId = params.get('program') ?? undefined;
  const programDay = Number(params.get('dag')) || undefined;
  const { view, orbRef, start, pause, resume, stop, actualMs, startedAt, started } = useSession(timeline);
  const ended = view.status === 'finished' || view.status === 'stopped';

  // Spara sessionen så fort den är slut (skattningen läggs till efteråt).
  const [savedId, setSavedId] = useState<number | null | undefined>(undefined);
  const saveStarted = useRef(false);
  useEffect(() => {
    if (!ended || saveStarted.current) return;
    saveStarted.current = true;
    const leadInMs = timeline.totalMs - timeline.breathingMs;
    saveSession({
      techniqueId: technique.id,
      techniqueName: technique.name,
      startedAt,
      endedAt: Date.now(),
      plannedSec: Math.round(timeline.breathingMs / 1000),
      actualSec: Math.round(Math.max(0, actualMs - leadInMs) / 1000),
      completed: view.status === 'finished',
      settings,
      ...(programId ? { programId, programDay } : {}),
    })
      .then(setSavedId)
      .catch(() => setSavedId(null));
  }, [ended, view.status, actualMs, startedAt, technique, timeline, settings, programId, programDay]);

  if (!started) {
    return (
      <ReadyScreen
        technique={technique}
        timeline={timeline}
        settings={settings}
        onSettings={onSettings}
        onStart={start}
        onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/tekniker'))}
      />
    );
  }

  if (ended) {
    return (
      <DoneScreen
        completed={view.status === 'finished'}
        breathingMs={Math.max(0, actualMs - (timeline.totalMs - timeline.breathingMs))}
        technique={technique}
        savedId={savedId}
        onDone={() => navigate('/')}
      />
    );
  }

  const paused = view.status === 'paused';
  const isHold = view.phaseKind === 'holdIn' || view.phaseKind === 'holdOut';

  return (
    <div className="safe-screen fixed inset-0 flex flex-col bg-ink">
      {/* Toppfält */}
      <header className="flex items-center justify-between px-6 pt-4 text-muted">
        <span className="truncate text-base">{technique.name}</span>
        <span className="tabular-nums text-lg">{formatClock(Math.min(view.remainingMs, timeline.breathingMs))}</span>
      </header>
      {timeline.roundCount > 1 && (
        <p className="px-6 pt-1 text-right text-sm text-muted">
          Runda {view.round + 1} av {timeline.roundCount}
        </p>
      )}

      {/* Cirkel + fas */}
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        <p
          key={view.phaseIndex}
          className="phase-label min-h-10 text-center text-3xl font-medium tracking-wide"
          aria-live="polite"
        >
          {view.label}
        </p>
        <BreathOrb kind={view.phaseKind} orbRef={orbRef}>
          <span className={`tabular-nums text-6xl font-light ${isHold ? 'text-ink' : 'text-ink/80'}`}>
            {view.phaseSecondsLeft > 0 ? view.phaseSecondsLeft : ''}
          </span>
        </BreathOrb>
      </main>

      {/* Kontroller */}
      <footer className="px-6 pb-6">
        {paused ? (
          <div className="flex flex-col gap-3">
            <BigButton onClick={resume}>Fortsätt</BigButton>
            <BigButton variant="danger" onClick={stop}>
              Avsluta session
            </BigButton>
          </div>
        ) : (
          <BigButton variant="secondary" onClick={pause} aria-label="Pausa">
            Paus
          </BigButton>
        )}
      </footer>

      {paused && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm uppercase tracking-[0.3em] text-muted">
          Pausad
        </div>
      )}
    </div>
  );
}

function ReadyScreen({
  technique,
  timeline,
  settings,
  onSettings,
  onStart,
  onBack,
}: {
  technique: Technique;
  timeline: Timeline;
  settings: SessionSettings;
  onSettings: (patch: Partial<SessionSettings>) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const a = technique.adjustable ?? {};
  const hasAdjust = Object.keys(settings).length > 0;

  return (
    <div className="safe-screen mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <button type="button" onClick={onBack} className="-ml-2 min-h-12 self-start px-2 text-muted">
        ← Tillbaka
      </button>

      <header>
        <h1 className="text-3xl font-semibold">{technique.name}</h1>
        <p className="mt-1 text-lg text-muted">{technique.purpose}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {technique.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
              {SITUATION_LABELS[tag]}
            </span>
          ))}
        </div>
      </header>

      <Card className="flex flex-col gap-4">
        <PatternBar cycle={effectiveCycle(technique, settings)} />
        <p className="text-sm text-muted">
          {structureSummary(technique, settings)} · {formatDuration(timeline.breathingMs)}
        </p>
      </Card>

      <p className="leading-relaxed text-text/90">{technique.description}</p>

      {hasAdjust && (
        <Card className="flex flex-col divide-y divide-line py-2">
          {a.breathsPerMinute && settings.bpm !== undefined && (
            <Stepper
              label="Tempo"
              unit="/min"
              value={settings.bpm}
              min={a.breathsPerMinute.min}
              max={a.breathsPerMinute.max}
              step={a.breathsPerMinute.step}
              onChange={(bpm) => onSettings({ bpm })}
            />
          )}
          {a.duration && settings.minutes !== undefined && (
            <Stepper
              label="Längd"
              unit="min"
              value={settings.minutes}
              min={a.duration.minMinutes}
              max={a.duration.maxMinutes}
              step={1}
              onChange={(minutes) => onSettings({ minutes })}
            />
          )}
          {a.cycles && settings.cycles !== undefined && (
            <Stepper
              label="Andetag"
              value={settings.cycles}
              min={a.cycles.min}
              max={a.cycles.max}
              step={1}
              onChange={(cycles) => onSettings({ cycles })}
            />
          )}
          {a.rounds && settings.rounds !== undefined && (
            <Stepper
              label="Rundor"
              value={settings.rounds}
              min={a.rounds.min}
              max={a.rounds.max}
              step={1}
              onChange={(rounds) => onSettings({ rounds })}
            />
          )}
          {a.holdSeconds && settings.hold !== undefined && (
            <Stepper
              label="Första hållning"
              unit="s"
              value={settings.hold}
              min={a.holdSeconds.min}
              max={a.holdSeconds.max}
              step={a.holdSeconds.step}
              onChange={(hold) => onSettings({ hold })}
            />
          )}
        </Card>
      )}

      {technique.hasBreathHold && <HoldWarning />}

      <SoundSettingsCollapsible />

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink via-ink to-ink/0 px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-6">
        <div className="mx-auto max-w-lg">
          <BigButton onClick={onStart} className="min-h-20 text-xl">
            Starta · {formatDuration(timeline.breathingMs)}
          </BigButton>
        </div>
      </div>
    </div>
  );
}

function DoneScreen({
  completed,
  breathingMs,
  technique,
  savedId,
  onDone,
}: {
  completed: boolean;
  breathingMs: number;
  technique: Technique;
  /** undefined = sparar, null = sparades inte (för kort eller fel), tal = id. */
  savedId: number | null | undefined;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const save = async (before: Rating, after: Rating) => {
    if (typeof savedId !== 'number') return onDone();
    setSaving(true);
    try {
      await rateSession(savedId, before, after);
    } finally {
      onDone();
    }
  };

  return (
    <div className="safe-screen mx-auto flex min-h-dvh max-w-lg flex-col items-center gap-6 px-5 pb-6 pt-10 text-center">
      <div className="h-16 w-16 rounded-full bg-accent/15 ring-1 ring-accent/40" />
      <div>
        <h1 className="text-3xl font-semibold">{completed ? 'Klart' : 'Avslutad'}</h1>
        <p className="mt-1 text-muted">
          {technique.name} · {formatClock(breathingMs)}
        </p>
      </div>

      {savedId === null ? (
        <>
          <p className="text-muted">Sessionen var för kort för att sparas.</p>
          <BigButton onClick={onDone} className="mt-auto">
            Till startsidan
          </BigButton>
        </>
      ) : (
        <Card className="w-full">
          <h2 className="mb-1 text-left text-lg font-medium">Hur kändes det?</h2>
          <p className="mb-4 text-left text-sm text-muted">Skatta före och efter, 1–10.</p>
          <RatingForm onSave={save} onSkip={onDone} saving={saving || savedId === undefined} />
        </Card>
      )}
    </div>
  );
}
