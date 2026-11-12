import { formatNumber } from '../lib/format';

interface Props {
  label: string;
  value: number | undefined;
  unit?: string;
  /** Förändring mot föregående period. */
  delta?: number;
  /** Om en ökning är bra (BOLT, HRV) eller dålig (vilopuls). */
  upIsGood?: boolean;
  deltaLabel?: string;
}

/** Nyckeltal: etikett, värde, valfri förändring med pil + text (aldrig bara färg). */
export function StatTile({ label, value, unit, delta, upIsGood = true, deltaLabel = 'mot veckan innan' }: Props) {
  const good = delta !== undefined && delta !== 0 && delta > 0 === upIsGood;
  return (
    <div className="min-w-0 rounded-2xl bg-surface-2 px-3 py-3">
      <div className="truncate text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value === undefined ? '–' : formatNumber(value)}
        {value !== undefined && unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </div>
      {delta !== undefined && (
        <div
          className={`mt-1 truncate text-xs ${delta === 0 ? 'text-muted' : good ? 'text-accent' : 'text-hold'}`}
          aria-label={`${delta > 0 ? 'Upp' : delta < 0 ? 'Ned' : 'Oförändrat'} ${formatNumber(Math.abs(delta))} ${deltaLabel}`}
        >
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {formatNumber(Math.abs(delta))}
          {deltaLabel && <span className="text-muted"> {deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}
