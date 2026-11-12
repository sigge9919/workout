import type { PhaseSpec } from '../engine/types';
import { formatNumber } from '../lib/format';
import { SHORT_LABELS } from '../techniques/describe';
import { PHASE_COLORS } from './BreathOrb';

/** Visar en cykel som färgade segment i proportion till fasernas längd. */
export function PatternBar({ cycle, compact = false }: { cycle: PhaseSpec[]; compact?: boolean }) {
  const total = cycle.reduce((s, p) => s + p.seconds, 0);
  return (
    <div className="w-full" aria-label={cycle.map((p) => `${SHORT_LABELS[p.kind]} ${formatNumber(p.seconds)} sekunder`).join(', ')}>
      <div className={`flex w-full gap-1 ${compact ? 'h-1.5' : 'h-2.5'}`}>
        {cycle.map((p, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{ flexGrow: p.seconds / total, flexBasis: 0, backgroundColor: PHASE_COLORS[p.kind] }}
          />
        ))}
      </div>
      {!compact && (
        <div className="mt-2 flex w-full gap-1 text-xs text-muted">
          {cycle.map((p, i) => (
            <div key={i} className="min-w-0 truncate" style={{ flexGrow: p.seconds / total, flexBasis: 0 }}>
              {SHORT_LABELS[p.kind]} <span className="tabular-nums text-text">{formatNumber(p.seconds)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
