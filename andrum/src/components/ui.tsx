import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-ink active:bg-accent/80',
  secondary: 'bg-surface-2 text-text border border-line active:bg-line',
  ghost: 'bg-transparent text-muted active:bg-surface-2',
  danger: 'bg-transparent text-danger border border-danger/40 active:bg-danger/10',
};

/** Stor tryckyta (minst 64 px hög) – går att träffa med svettiga händer. */
export function BigButton({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`min-h-16 w-full rounded-2xl px-6 text-lg font-semibold transition-colors disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center justify-between gap-4 text-left"
    >
      <span>
        <span className="block text-base">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}>
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`}
        />
      </span>
    </button>
  );
}

export function Slider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`block py-2 ${disabled ? 'opacity-40' : ''}`}>
      <span className="mb-2 flex justify-between text-base">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{Math.round(value * 100)} %</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range w-full"
      />
    </label>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-12 rounded-full border px-4 text-base transition-colors ${
            o.value === value ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-surface-2 text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Kort säkerhetstext vid andetagshållningar. */
export function HoldWarning() {
  return (
    <div className="rounded-2xl border border-hold/30 bg-hold/10 p-4 text-sm leading-relaxed text-hold">
      <strong className="font-semibold">Andetagshållning.</strong> Gör aldrig övningen i eller nära vatten, under
      bilkörning eller i andra lägen där yrsel kan vara farligt. Avbryt om du blir yr eller mår dåligt. Det här är
      inte medicinsk rådgivning.
    </div>
  );
}
