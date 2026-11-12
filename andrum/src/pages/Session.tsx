import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AMBIENT_LABELS, type AmbientType } from '../audio/ambient';
import { BreathOrb } from '../components/BreathOrb';
import { BigButton, Card, Chips, HoldWarning, Slider, Toggle } from '../components/ui';
import { compileTimeline } from '../engine/timeline';
import type { Technique, Timeline } from '../engine/types';
import { useSession } from '../hooks/useSession';
import { formatClock, formatDuration } from '../lib/format';
import { vibrationSupported } from '../lib/haptics';
import { setPrefs, usePrefs } from '../lib/prefs';
import { findTechnique } from '../techniques/builtin';

export function SessionPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const technique = findTechnique(id);

  const timeline = useMemo(() => {
    if (!technique) return null;
    const min = Number(params.get('min'));
    const bpm = Number(params.get('bpm'));
    return compileTimeline(technique, {
      durationSeconds: min > 0 ? min * 60 : undefined,
      breathsPerMinute: bpm > 0 ? bpm : undefined,
    });
  }, [technique, params]);

  if (!technique || !timeline) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-lg">Hittade inte tekniken.</p>
        <Link to="/" className="text-accent underline">
          Till startsidan
        </Link>
      </div>
    );
  }
  return <SessionRunner technique={technique} timeline={timeline} />;
}

function SessionRunner({ technique, timeline }: { technique: Technique; timeline: Timeline }) {
  const navigate = useNavigate();
  const { view, orbRef, start, pause, resume, stop, actualMs, started } = useSession(timeline);

  if (!started) return <ReadyScreen technique={technique} timeline={timeline} onStart={start} onBack={() => navigate(-1)} />;

  if (view.status === 'finished' || view.status === 'stopped') {
    return (
      <DoneScreen
        completed={view.status === 'finished'}
        actualMs={actualMs}
        technique={technique}
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
  onStart,
  onBack,
}: {
  technique: Technique;
  timeline: Timeline;
  onStart: () => void;
  onBack: () => void;
}) {
  const prefs = usePrefs();
  const ambientOptions = (Object.keys(AMBIENT_LABELS) as AmbientType[]).map((v) => ({ value: v, label: AMBIENT_LABELS[v] }));

  return (
    <div className="safe-screen mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 pb-6">
      <button type="button" onClick={onBack} className="-ml-2 min-h-12 self-start px-2 text-muted">
        ← Tillbaka
      </button>
      <div>
        <h1 className="text-3xl font-semibold">{technique.name}</h1>
        <p className="mt-1 text-muted">
          {technique.purpose} · {formatDuration(timeline.breathingMs)}
        </p>
      </div>

      {technique.hasBreathHold && <HoldWarning />}

      <Card className="flex flex-col gap-1">
        <Toggle label="Ljud" checked={prefs.soundOn} onChange={(soundOn) => setPrefs({ soundOn })} />
        <Slider
          label="Signaler"
          value={prefs.cueVolume}
          disabled={!prefs.soundOn}
          onChange={(cueVolume) => setPrefs({ cueVolume })}
        />
        <div className={`py-2 ${prefs.soundOn ? '' : 'opacity-40'}`}>
          <p className="mb-2">Bakgrund</p>
          <Chips options={ambientOptions} value={prefs.ambient} onChange={(ambient) => setPrefs({ ambient })} />
        </div>
        <Slider
          label="Bakgrundsvolym"
          value={prefs.ambientVolume}
          disabled={!prefs.soundOn || prefs.ambient === 'off'}
          onChange={(ambientVolume) => setPrefs({ ambientVolume })}
        />
        {vibrationSupported && (
          <Toggle label="Vibration" checked={prefs.vibration} onChange={(vibration) => setPrefs({ vibration })} />
        )}
      </Card>

      <div className="mt-auto">
        <BigButton onClick={onStart} className="min-h-20 text-xl">
          Starta
        </BigButton>
      </div>
    </div>
  );
}

function DoneScreen({
  completed,
  actualMs,
  technique,
  onDone,
}: {
  completed: boolean;
  actualMs: number;
  technique: Technique;
  onDone: () => void;
}) {
  return (
    <div className="safe-screen mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="h-24 w-24 rounded-full bg-accent/15 ring-1 ring-accent/40" />
      <h1 className="text-3xl font-semibold">{completed ? 'Klart' : 'Avslutad'}</h1>
      <p className="text-muted">
        {technique.name} · {formatClock(actualMs)}
      </p>
      <BigButton onClick={onDone} className="mt-4">
        Till startsidan
      </BigButton>
    </div>
  );
}
