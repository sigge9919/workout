import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DayValue } from '../lib/stats';
import { formatNumber } from '../lib/format';

const CHART = 'var(--color-chart)';
const SURFACE = 'var(--color-surface)';
const GRID = 'var(--color-line)';
const MUTED = 'var(--color-muted)';

const DENSE_POINTS = 30;

const shortDate = (t: number) => new Date(t).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
const longDate = (t: number) => new Date(t).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'long' });

interface Props {
  data: DayValue[];
  unit: string;
  /** Beskrivning för skärmläsare. */
  label: string;
  height?: number;
}

/**
 * En serie över tid: 2 px linje, 8 px punkter med ring i ytans färg,
 * tunt rutnät, verktygstips vid tryck/hovring. Tidsaxeln är skalad så att
 * luckor mellan mätningar syns.
 */
export function TrendChart({ data, unit, label, height = 180 }: Props) {
  if (data.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        {data.length === 0 ? 'Inga mätningar än.' : 'Trenden visas när du har mätningar från minst två dagar.'}
      </p>
    );
  }
  const values = data.map((d) => d.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(2, (hi - lo) * 0.15);
  // Täta serier: bara linjen, plus en markör på senaste värdet.
  const dense = data.length > DENSE_POINTS;
  const lastIndex = data.length - 1;

  return (
    <div role="img" aria-label={`${label}: ${data.length} dagar, senast ${formatNumber(data[data.length - 1].value)} ${unit}`}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={shortDate}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={24}
          />
          <YAxis
            domain={[Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)]}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: MUTED, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload as DayValue | undefined;
              if (!p) return null;
              return (
                <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm shadow-lg">
                  <div className="text-muted">{longDate(p.t)}</div>
                  <div className="font-medium text-text tabular-nums">
                    {formatNumber(p.value)} {unit}
                  </div>
                </div>
              );
            }}
          />
          <Line
            type={dense ? "linear" : "monotone"}
            dataKey="value"
            stroke={CHART}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={
              dense
                ? (props: { cx?: number; cy?: number; index?: number }) =>
                    props.index === lastIndex && props.cx !== undefined && props.cy !== undefined ? (
                      <circle key="last" cx={props.cx} cy={props.cy} r={4} fill={CHART} stroke={SURFACE} strokeWidth={2} />
                    ) : (
                      <g key={props.index} />
                    )
                : { r: 4, fill: CHART, stroke: SURFACE, strokeWidth: 2 }
            }
            activeDot={{ r: 6, fill: CHART, stroke: SURFACE, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
