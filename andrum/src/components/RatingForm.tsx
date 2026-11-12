import { useState } from 'react';
import type { Rating } from '../db/schema';

const METRICS: Array<{ key: keyof Rating; label: string; low: string; high: string }> = [
  { key: 'energy', label: 'Energi', low: 'trött', high: 'pigg' },
  { key: 'stress', label: 'Stress', low: 'lugn', high: 'stressad' },
  { key: 'focus', label: 'Fokus', low: 'splittrad', high: 'skarp' },
];

const MID: Rating = { energy: 5, stress: 5, focus: 5 };

interface Props {
  onSave: (before: Rating, after: Rating) => void;
  onSkip: () => void;
  saving?: boolean;
}

/** Snabb skattning 1–10 före och efter. Stora −/+ så den funkar direkt efter passet. */
export function RatingForm({ onSave, onSkip, saving }: Props) {
  const [before, setBefore] = useState<Rating>(MID);
  const [after, setAfter] = useState<Rating>(MID);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col divide-y divide-line">
        {METRICS.map((m) => (
          <Row
            key={m.key}
            label={m.label}
            hint={`1 ${m.low} – 10 ${m.high}`}
            before={before[m.key]}
            after={after[m.key]}
            onBefore={(v) => setBefore((r) => ({ ...r, [m.key]: v }))}
            onAfter={(v) => setAfter((r) => ({ ...r, [m.key]: v }))}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(before, after)}
        className="min-h-16 w-full rounded-2xl bg-accent text-lg font-semibold text-ink active:bg-accent/80 disabled:opacity-40"
      >
        Spara skattning
      </button>
      <button type="button" onClick={onSkip} className="min-h-14 w-full rounded-2xl text-muted active:bg-surface-2">
        Hoppa över
      </button>
    </div>
  );
}

function Row(props: {
  label: string;
  hint: string;
  before: number;
  after: number;
  onBefore: (v: number) => void;
  onAfter: (v: number) => void;
}) {
  return (
    <div className="py-3 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-medium">{props.label}</span>
        <span className="text-xs text-muted">{props.hint}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <MiniStepper caption="Före" label={`${props.label} före`} value={props.before} onChange={props.onBefore} />
        <MiniStepper caption="Efter" label={`${props.label} efter`} value={props.after} onChange={props.onAfter} />
      </div>
    </div>
  );
}

function MiniStepper({
  caption,
  label,
  value,
  onChange,
}: {
  caption: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const btn =
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-xl active:bg-line disabled:opacity-30';
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Minska ${label}`} disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span className="flex flex-1 flex-col items-center leading-none">
        <span className="text-[10px] uppercase tracking-widest text-muted">{caption}</span>
        <span className="mt-1 text-xl font-medium tabular-nums" aria-live="polite">
          {value}
        </span>
      </span>
      <button type="button" className={btn} aria-label={`Öka ${label}`} disabled={value >= 10} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
