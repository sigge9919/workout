import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatTile } from '../components/StatTile';
import { TrendChart } from '../components/TrendChart';
import { BigButton, Card } from '../components/ui';
import { deleteBolt, deleteDailyMetric, localDate, saveDailyMetric } from '../db/repo';
import { db, type DailyMetric } from '../db/schema';
import { dailyBolt, metricSeries, parseDailyMetric, parseLocalDate, summarize } from '../lib/stats';

const DAY_MS = 86_400_000;
const CHART_DAYS = 90;

export function MeasurePage() {
  return (
    <div className="safe-screen mx-auto flex max-w-lg flex-col gap-6 px-5 pb-6">
      <header className="pt-6">
        <h1 className="text-3xl font-semibold tracking-tight">Mätning</h1>
      </header>
      <BoltSection />
      <DailySection />
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

function BoltSection() {
  const results = useLiveQuery(() => db.boltResults.orderBy('date').toArray(), []);
  const [confirm, setConfirm] = useState<number | null>(null);
  const now = Date.now();
  const days = useMemo(() => dailyBolt(results ?? []), [results]);
  const summary = summarize(days, now);
  const chartData = days.filter((d) => d.t > now - CHART_DAYS * DAY_MS);
  const recent = [...(results ?? [])].reverse().slice(0, 10);

  return (
    <Section title="BOLT">
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Senaste" value={summary.latest?.value} unit="s" />
          <StatTile label="Snitt 7 dagar" value={summary.avg7} unit="s" delta={summary.delta7} deltaLabel="v/v" />
          <StatTile label="Bästa" value={summary.best} unit="s" />
        </div>
        <div>
          <p className="mb-2 text-sm text-muted">BOLT per dag, sekunder (senaste {CHART_DAYS} dagarna)</p>
          <TrendChart data={chartData} unit="s" label="BOLT per dag" />
        </div>
        <Link
          to="/bolt"
          className="flex min-h-16 items-center justify-center rounded-2xl bg-accent text-lg font-semibold text-ink active:bg-accent/80"
        >
          Gör BOLT-test
        </Link>
      </Card>

      {recent.length > 0 && (
        <Card className="py-1">
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id} className="flex min-h-16 items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm">
                    {new Date(r.date).toLocaleString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {r.note && <span className="block truncate text-xs text-muted">{r.note}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-lg font-medium tabular-nums">{r.seconds} s</span>
                  <DeleteButton
                    armed={confirm === r.id}
                    onClick={() => {
                      if (confirm === r.id) {
                        void deleteBolt(r.id!);
                        setConfirm(null);
                      } else setConfirm(r.id!);
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Section>
  );
}

function DeleteButton({ armed, onClick }: { armed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={armed ? 'Tryck igen för att ta bort' : 'Ta bort'}
      className={`min-h-12 min-w-12 rounded-xl px-3 text-sm ${armed ? 'bg-danger/15 text-danger' : 'text-muted'}`}
    >
      {armed ? 'Ta bort?' : '✕'}
    </button>
  );
}

function DailySection() {
  const metrics = useLiveQuery(() => db.dailyMetrics.toArray(), []);
  const today = localDate();
  const [date, setDate] = useState(today);
  const existing = metrics?.find((m) => m.date === date);
  const [draft, setDraft] = useState<{ date: string; restingHr: string; hrv: string } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  // Formuläret visar sparat värde för valt datum tills användaren skriver.
  const form =
    draft && draft.date === date
      ? draft
      : { date, restingHr: existing?.restingHr?.toString() ?? '', hrv: existing?.hrv?.toString() ?? '' };
  const edit = (patch: Partial<{ restingHr: string; hrv: string }>) => {
    setMsg(null);
    setDraft({ ...form, ...patch });
  };

  const save = async () => {
    try {
      const m = parseDailyMetric(form);
      await saveDailyMetric(m);
      setDraft(null);
      setMsg({ kind: 'ok', text: date === today ? 'Sparat för idag.' : `Sparat för ${formatDay(date)}.` });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Kunde inte spara.' });
    }
  };

  const now = Date.now();
  const hrv = metricSeries(metrics ?? [], 'hrv');
  const hr = metricSeries(metrics ?? [], 'restingHr');
  const hrvSum = summarize(hrv, now);
  const hrSum = summarize(hr, now, false);
  const recent = [...(metrics ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  return (
    <Section title="Vilopuls och HRV">
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-muted">Från din klocka, helst samma mått varje morgon.</p>
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Datum</span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              setDate(e.target.value || today);
              setMsg(null);
            }}
            className="min-h-14 w-full rounded-2xl border border-line bg-ink px-4 text-base text-text [color-scheme:dark]"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Vilopuls" unit="slag/min" value={form.restingHr} onChange={(restingHr) => edit({ restingHr })} />
          <NumberField label="HRV" unit="ms" value={form.hrv} onChange={(hrv) => edit({ hrv })} />
        </div>
        <BigButton onClick={save}>{existing ? 'Uppdatera' : 'Spara'}</BigButton>
        {msg && (
          <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${msg.kind === 'ok' ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}`}>
            {msg.text}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="HRV snitt 7 dagar" value={hrvSum.avg7} unit="ms" delta={hrvSum.delta7} deltaLabel="mot veckan innan" />
          <StatTile
            label="Vilopuls snitt 7 dagar"
            value={hrSum.avg7}
            unit="bpm"
            delta={hrSum.delta7}
            upIsGood={false}
            deltaLabel="mot veckan innan"
          />
        </div>
        <p className="text-sm text-muted">Fullständiga grafer finns under Statistik (steg 5).</p>
      </Card>

      {recent.length > 0 && (
        <Card className="py-1">
          <ul className="divide-y divide-line">
            {recent.map((m: DailyMetric) => (
              <li key={m.date} className="flex min-h-16 items-center justify-between gap-3">
                <button type="button" onClick={() => setDate(m.date)} className="min-h-12 flex-1 text-left text-sm">
                  {formatDay(m.date)}
                </button>
                <span className="flex shrink-0 items-center gap-3 text-sm tabular-nums">
                  <span>{m.restingHr ?? '–'} <span className="text-muted">bpm</span></span>
                  <span>{m.hrv ?? '–'} <span className="text-muted">ms</span></span>
                  <DeleteButton
                    armed={confirm === m.date}
                    onClick={() => {
                      if (confirm === m.date) {
                        void deleteDailyMetric(m.date);
                        setConfirm(null);
                      } else setConfirm(m.date);
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Section>
  );
}

function NumberField({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-muted">
        {label} <span className="text-xs">({unit})</span>
      </span>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9,.]/g, ''))}
        className="min-h-16 w-full rounded-2xl border border-line bg-ink px-4 text-2xl tabular-nums text-text"
      />
    </label>
  );
}

function formatDay(date: string): string {
  return new Date(parseLocalDate(date)).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
}
