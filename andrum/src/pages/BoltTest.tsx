import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BigButton, Card, HoldWarning } from '../components/ui';
import { saveBolt } from '../db/repo';
import { vibrationSupported } from '../lib/haptics';
import { boltLevel } from '../lib/stats';
import { ScreenWakeLock } from '../lib/wakeLock';

type Phase = 'intro' | 'running' | 'result';

/** Tryck direkt efter start ignoreras (samma tryck som startade). */
const STOP_GUARD_MS = 600;

/**
 * BOLT-test: håll andan efter en normal utandning tills första tydliga
 * lufthunger. Hela skärmen är stoppknapp under testet.
 */
export function BoltTestPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('intro');
  const [result, setResult] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const startRef = useRef(0);
  const displayRef = useRef<HTMLSpanElement>(null);
  const wakeLock = useRef(new ScreenWakeLock());

  useEffect(() => {
    const wl = wakeLock.current;
    return () => void wl.release();
  }, []);

  // Uppdatera tiden direkt i DOM varje frame.
  useEffect(() => {
    if (phase !== 'running') return;
    let raf = 0;
    const frame = () => {
      const s = (performance.now() - startRef.current) / 1000;
      if (displayRef.current) displayRef.current.textContent = String(Math.floor(s));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const start = () => {
    void wakeLock.current.acquire();
    if (vibrationSupported) navigator.vibrate(30);
    startRef.current = performance.now();
    setPhase('running');
  };

  const stop = () => {
    const ms = performance.now() - startRef.current;
    if (ms < STOP_GUARD_MS) return;
    if (vibrationSupported) navigator.vibrate([20, 40, 20]);
    void wakeLock.current.release();
    setResult(Math.round(ms / 1000));
    setPhase('result');
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveBolt(result, note);
    } finally {
      navigate('/matning', { replace: true });
    }
  };

  if (phase === 'running') {
    return (
      <button
        type="button"
        onPointerDown={stop}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && stop()}
        aria-label="Stoppa – första tydliga lufthunger"
        className="safe-screen fixed inset-0 flex flex-col items-center justify-between bg-ink px-6 pb-10 pt-16 text-center"
      >
        <span className="text-lg text-muted">Håll andan efter en normal utandning</span>
        <span className="flex items-baseline gap-2">
          <span ref={displayRef} className="text-[9rem] font-extralight leading-none tabular-nums">
            0
          </span>
          <span className="text-2xl text-muted">s</span>
        </span>
        <span className="flex w-full flex-col items-center gap-3">
          <span className="flex min-h-24 w-full items-center justify-center rounded-3xl border border-accent/40 bg-accent/10 text-2xl font-semibold text-accent">
            Tryck vid första lufthunger
          </span>
          <span className="text-sm text-muted">Hela skärmen fungerar som stoppknapp</span>
        </span>
      </button>
    );
  }

  if (phase === 'result') {
    const level = boltLevel(result);
    return (
      <div className="safe-screen mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 pb-6 pt-10">
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-muted">Ditt BOLT</p>
          <p className="mt-2 text-8xl font-extralight tabular-nums">
            {result}
            <span className="ml-2 text-2xl text-muted">s</span>
          </p>
          <p className="mt-3 text-lg font-medium">{level.label}</p>
          <p className="mt-1 text-sm text-muted">{level.text}</p>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Anteckning (valfritt)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="t.ex. direkt efter uppvaknande"
            maxLength={120}
            className="min-h-14 w-full rounded-2xl border border-line bg-surface px-4 text-base text-text placeholder:text-muted"
          />
        </label>
        <p className="text-xs leading-relaxed text-muted">
          Riktvärdena är en grov vägledning, inte en medicinsk bedömning. Jämför helst med dig själv över tid, mätt vid
          samma tid på dygnet.
        </p>
        <div className="mt-auto flex flex-col gap-3">
          <BigButton onClick={save} disabled={saving}>
            Spara
          </BigButton>
          <BigButton variant="secondary" onClick={() => setPhase('intro')}>
            Gör om
          </BigButton>
          <button type="button" onClick={() => navigate('/matning')} className="min-h-12 text-muted">
            Kasta resultatet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="safe-screen mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 pb-6">
      <button type="button" onClick={() => navigate('/matning')} className="-ml-2 min-h-12 self-start px-2 text-muted">
        ← Tillbaka
      </button>
      <header>
        <h1 className="text-3xl font-semibold">BOLT-test</h1>
        <p className="mt-1 text-lg text-muted">Mäter hur kroppen tolererar koldioxid</p>
      </header>
      <Card>
        <ol className="flex list-decimal flex-col gap-3 pl-5 leading-relaxed">
          <li>Sitt ned och andas lugnt genom näsan i någon minut.</li>
          <li>Andas in normalt och andas ut normalt – inte djupt.</li>
          <li>Nyp om näsan och tryck Starta.</li>
          <li>
            Tryck var som helst på skärmen vid <strong>första tydliga lufthunger</strong> – den första
            impulsen att andas eller ofrivilliga sväljningar. Det är inte ett test av hur länge du kan hålla andan.
          </li>
          <li>Första andetaget efteråt ska kännas lugnt. Måste du flämta höll du för länge.</li>
        </ol>
      </Card>
      <p className="text-sm text-muted">
        Mät helst på morgonen, före träning och vid samma tid varje gång så att resultaten går att jämföra.
      </p>
      <HoldWarning />
      <div className="mt-auto">
        <BigButton onClick={start} className="min-h-24 text-2xl">
          Starta
        </BigButton>
      </div>
    </div>
  );
}
