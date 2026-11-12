import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WeekBucket } from '../lib/stats';

const CHART = 'var(--color-chart)';
const GRID = 'var(--color-line)';
const MUTED = 'var(--color-muted)';

/**
 * Sessioner per vecka. Staplar högst 24 px breda, 4 px rundade toppar,
 * raka mot baslinjen. Tryck på en stapel för antal och minuter.
 */
export function WeekChart({ data, height = 180 }: { data: WeekBucket[]; height?: number }) {
  const total = data.reduce((s, b) => s + b.count, 0);
  const max = Math.max(...data.map((b) => b.count), 0);
  return (
    <div role="img" aria-label={`Sessioner per vecka, ${data.length} veckor, totalt ${total}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            dataKey="week"
            tickFormatter={(w: number) => `v${w}`}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            allowDecimals={false}
            domain={[0, Math.max(3, max)]}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-2)' }}
            content={({ active, payload }) => {
              const b = active && (payload?.[0]?.payload as WeekBucket | undefined);
              if (!b) return null;
              const from = new Date(b.t).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
              return (
                <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm shadow-lg">
                  <div className="text-muted">
                    Vecka {b.week} · från {from}
                  </div>
                  <div className="font-medium text-text tabular-nums">
                    {b.count} {b.count === 1 ? 'session' : 'sessioner'} · {b.minutes} min
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="count" fill={CHART} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
