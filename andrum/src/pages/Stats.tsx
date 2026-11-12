import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { StatTile } from '../components/StatTile';
import { TrendChart } from '../components/TrendChart';
import { WeekChart } from '../components/WeekChart';
import { Card, Chips } from '../components/ui';
import { db, type SessionRecord } from '../db/schema';
import { formatClock, formatNumber, plural } from '../lib/format';
import {
  dailyBolt,
  metricSeries,
  ratingEffect,
  sessionsPerWeek,
  streak,
  summarize,
  type DayValue,
} from '../lib/stats';

type Period = '30' | '90' | '365' | 'all';
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: '30', label: '30 dagar' },
  { value: '90', label: '90 dagar' },
  { value: '365', label: '1 år' },
  { value: 'all', label: 'Allt' },
];
const DAY_MS = 86_400_000;

export function StatsPage() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').toArray(), []);
  const bolt = useLiveQuery(() => db.boltResults.toArray(), []);
  const metrics = useLiveQuery(() => db.dailyMetrics.toArray(), []);
  const [period, setPeriod] = useState<Period>('90');
  const now = Date.now();
  const from = period === 'all' ? -Infinity : now - Number(period) * DAY_MS;

  const all = useMemo(() => sessions ?? [], [sessions]);
  const st = streak(all, now);
  const weeks = sessionsPerWeek(all, now, 12);
  const thisWeek = weeks[weeks.length - 1];
  const inPeriod = all.filter((s) => s.startedAt > from);
  const inRange = (d: DayValue[]) => d.filter((p) => p.t > from);

  const boltDays = inRange(dailyBolt(bolt ?? []));
  const hrv = inRange(metricSeries(metrics ?? [], 'hrv'));
  const hr = inRange(metricSeries(metrics ?? [], 'restingHr'));

  if (!sessions || !bolt || !metrics) return null;

  return (
    <div className="safe-screen mx-auto flex max-w-lg flex-col gap-6 px-5 pb-6">
      <header className="pt-6">
        <h1 className="text-3xl font-semibold tracking-tight">Statistik</h1>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Streak" value={st.current} unit={st.current === 1 ? 'dag' : 'dagar'} />
        <StatTile label="Längsta streak" value={st.longest} unit={st.longest === 1 ? 'dag' : 'dagar'} />
        <StatTile label="Sessioner denna vecka" value={thisWeek.count} />
        <StatTile label="Minuter denna vecka" value={thisWeek.minutes} unit="min" />
      </div>
      {!st.doneToday && st.current > 0 && (
        <p className="-mt-3 text-sm text-muted">Gör en session idag för att hålla streaken vid liv.</p>
      )}

      <Section title="Sessioner per vecka">
        <Card>
          <p className="mb-2 text-sm text-muted">Antal sessioner, senaste 12 veckorna</p>
          <WeekChart data={weeks} />
        </Card>
      </Section>

      <div className="sticky top-0 z-10 -mx-5 bg-ink/95 px-5 py-2 backdrop-blur">
        <Chips options={PERIODS} value={period} onChange={setPeriod} />
      </div>

      <TrendSection title="BOLT" unit="s" data={boltDays} higherIsBetter description="BOLT per dag, sekunder" />
      <TrendSection title="HRV" unit="ms" data={hrv} higherIsBetter description="HRV per dag, millisekunder" />
      <TrendSection title="Vilopuls" unit="bpm" data={hr} higherIsBetter={false} description="Vilopuls per dag, slag per minut" />

      <RatingSection sessions={inPeriod} />
      <TechniqueTable sessions={inPeriod} />
      <RecentSessions sessions={all} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-widest text-muted">{title}</h2>
      {children}
    </section>
  );
}

function TrendSection({
  title,
  unit,
  data,
  higherIsBetter,
  description,
}: {
  title: string;
  unit: string;
  data: DayValue[];
  higherIsBetter: boolean;
  description: string;
}) {
  const s = summarize(data, Date.now(), higherIsBetter);
  const first = data[0]?.value;
  const last = data[data.length - 1]?.value;
  const change = data.length >= 2 ? Math.round((last - first) * 10) / 10 : undefined;
  return (
    <Section title={title}>
      <Card className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Senaste" value={s.latest?.value} unit={unit} />
          <StatTile label={higherIsBetter ? 'Bästa' : 'Lägsta'} value={s.best} unit={unit} />
          <StatTile label="Förändring" value={change} unit={unit} />
        </div>
        <p className="text-sm text-muted">{description}</p>
        <TrendChart data={data} unit={unit} label={description} />
      </Card>
    </Section>
  );
}

const EFFECTS: Array<{ key: 'energy' | 'stress' | 'focus'; label: string; up: string; down: string; upIsGood: boolean }> = [
  { key: 'energy', label: 'Energi', up: 'piggare', down: 'tröttare', upIsGood: true },
  { key: 'stress', label: 'Stress', up: 'mer stressad', down: 'lugnare', upIsGood: false },
  { key: 'focus', label: 'Fokus', up: 'skarpare', down: 'mer splittrad', upIsGood: true },
];

function RatingSection({ sessions }: { sessions: SessionRecord[] }) {
  const effect = ratingEffect(sessions);
  return (
    <Section title="Skattning före → efter">
      <Card className="flex flex-col gap-3">
        {effect.n === 0 ? (
          <p className="text-sm text-muted">Inga skattade sessioner i perioden. Skatta efter nästa session så syns effekten här.</p>
        ) : (
          <>
            <p className="text-sm text-muted">Genomsnittlig förändring per session, {plural(effect.n, 'skattad session', 'skattade sessioner')}.</p>
            <div className="grid grid-cols-3 gap-2">
              {EFFECTS.map((e) => {
                const v = effect[e.key]!;
                const good = v !== 0 && v > 0 === e.upIsGood;
                return (
                  <div key={e.key} className="min-w-0 rounded-2xl bg-surface-2 px-3 py-3">
                    <div className="text-xs text-muted">{e.label}</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {v > 0 ? '+' : v < 0 ? '−' : '±'}
                      {formatNumber(Math.abs(v))}
                    </div>
                    <div className={`mt-1 truncate text-xs ${v === 0 ? 'text-muted' : good ? 'text-accent' : 'text-hold'}`}>
                      {v === 0 ? 'oförändrat' : v > 0 ? e.up : e.down}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </Section>
  );
}

function TechniqueTable({ sessions }: { sessions: SessionRecord[] }) {
  const rows = useMemo(() => {
    const by = new Map<string, SessionRecord[]>();
    for (const s of sessions) by.set(s.techniqueId, [...(by.get(s.techniqueId) ?? []), s]);
    return [...by.values()]
      .map((list) => ({
        name: list[list.length - 1].techniqueName,
        count: list.length,
        minutes: Math.round(list.reduce((a, s) => a + s.actualSec, 0) / 60),
        stress: ratingEffect(list).stress,
      }))
      .sort((a, b) => b.count - a.count);
  }, [sessions]);

  if (!rows.length) return null;
  return (
    <Section title="Per teknik">
      <Card className="overflow-x-auto py-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 font-normal">Teknik</th>
              <th className="py-2 text-right font-normal">Antal</th>
              <th className="py-2 text-right font-normal">Min</th>
              <th className="py-2 text-right font-normal">Stress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="py-3 pr-2">{r.name}</td>
                <td className="py-3 text-right tabular-nums">{r.count}</td>
                <td className="py-3 text-right tabular-nums">{r.minutes}</td>
                <td className="py-3 text-right tabular-nums">
                  {r.stress === undefined ? '–' : `${r.stress > 0 ? '+' : r.stress < 0 ? '−' : '±'}${formatNumber(Math.abs(r.stress))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pt-2 text-xs text-muted">Stress = snittförändring efter − före (negativt = lugnare).</p>
      </Card>
    </Section>
  );
}

function RecentSessions({ sessions }: { sessions: SessionRecord[] }) {
  const recent = [...sessions].reverse().slice(0, 10);
  if (!recent.length) {
    return (
      <Section title="Senaste sessioner">
        <Card>
          <p className="text-sm text-muted">Inga sessioner än.</p>
        </Card>
      </Section>
    );
  }
  return (
    <Section title="Senaste sessioner">
      <Card className="py-1">
        <ul className="divide-y divide-line">
          {recent.map((s) => (
            <li key={s.id} className="flex min-h-16 items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">
                  {s.techniqueName}
                  {!s.completed && <span className="ml-2 text-xs text-muted">avbruten</span>}
                </span>
                <span className="block text-xs text-muted">
                  {new Date(s.startedAt).toLocaleString('sv-SE', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {s.before && s.after && ` · stress ${s.before.stress}→${s.after.stress}`}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-muted">{formatClock(s.actualSec * 1000)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}
