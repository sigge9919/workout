import { formatNumber } from '../lib/format';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}

/** −/+ med stora knappar. Lättare än ett reglage med svettiga fingrar. */
export function Stepper({ label, value, min, max, step, unit, onChange }: Props) {
  const set = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  return (
    <div className="flex min-h-16 items-center justify-between gap-3">
      <span className="text-base">{label}</span>
      <div className="flex items-center gap-2">
        <StepButton label={`Minska ${label.toLowerCase()}`} disabled={value <= min} onClick={() => set(value - step)}>
          −
        </StepButton>
        <span className="min-w-20 text-center text-xl font-medium tabular-nums">
          {formatNumber(value)}
          {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
        </span>
        <StepButton label={`Öka ${label.toLowerCase()}`} disabled={value >= max} onClick={() => set(value + step)}>
          +
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-2xl active:bg-line disabled:opacity-30"
    >
      {children}
    </button>
  );
}
