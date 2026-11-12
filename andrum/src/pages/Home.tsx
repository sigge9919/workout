import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui';
import { localDate } from '../db/repo';
import { db, type SessionRecord } from '../db/schema';
import { compileTimeline } from '../engine/timeline';
import type { Technique } from '../engine/types';
import { formatDuration } from '../lib/format';
import { localDateOf, parseLocalDate, streak } from '../lib/stats';
import { findProgram } from '../programs/builtin';
import { addDays, anchorDate, daysBetween, isDayDone, programPosition, sessionLink, suggestionForHour } from '../programs/today';
import type { Program, ProgramDay } from '../programs/types';
import { useAllTechniques } from '../techniques';
import { clampSettings, toCompileOptions } from '../techniques/settings';
import { SITUATIONS } from '../techniques/situations';

export function HomePage() {
  const state = useLiveQuery(() => db.programState.get('active'), [], null);
  const sessions = useLiveQuery(() => db.sessions.where('startedAt').above(Date.now() - 400 * 86_400_000).toArray(), []);
  const lastBolt = useLiveQuery(() => db.boltResults.orderBy('date').last(), []);
  const techniques = useAllTechniques();
  if (state === null || !sessions || !techniques) return null;

  const now = new Date();
  const today = localDate(now);
  const program = state ? findProgram(state.programId) : undefined;
  const st = streak(sessions, now.getTime());
  const boltToday = lastBolt && localDateOf(lastBolt.date) === today;

  return (
    <div className="safe-screen mx-auto flex max-w-lg flex-col gap-6 px-5 pb-6">
      <header className="flex items-end justify-between gap-4 pt-6">
        <div>
          <p className="text-sm text-muted">{capitalize(now.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          <h1 className="text-4xl font-semibold tracking-tight">Idag</h1>
        </div>
        {st.current > 0 && (
          <div className="rounded-2xl bg-surface px-3 py-2 text-right" aria-label={`Streak ${st.current} dagar`}>
            <div className="text-xl font-semibold tabular-nums">{st.current}</div>
            <div className="text-xs text-muted">{st.current === 1 ? 'dag i rad' : 'dagar i rad'}</div>
          </div>
        )}
      </header>

      {program && state ? (
        <ProgramToday
          program={program}
          startDate={state.startDate}
          today={today}
          sessions={sessions}
          techniques={techniques}
          boltToday={!!boltToday}
        />
      ) : (
        <Suggestion hour={now.getHours()} techniques={techniques} />
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-muted">Snabbval</h2>
        <ul className="grid grid-cols-2 gap-3">
          {SITUATIONS.map((s, i) => (
            <li key={s.id} className={i === 0 ? 'col-span-2' : ''}>
              <Link
                to={`/teknik/${s.techniqueId}`}
                className="flex min-h-24 flex-col justify-end rounded-3xl border border-line bg-surface p-4 active:bg-surface-2"
              >
                <span className="text-lg font-medium">{s.label}</span>
                <span className="text-sm text-muted">{s.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/program" className="flex min-h-14 items-center justify-center rounded-2xl border border-line text-muted active:bg-surface">
          Program
        </Link>
        <Link to="/tekniker" className="flex min-h-14 items-center justify-center rounded-2xl border border-line text-muted active:bg-surface">
          Alla tekniker
        </Link>
      </div>
    </div>
  );
}

function durationOf(t: Technique | undefined, day: ProgramDay): string {
  if (!t) return '';
  const s = clampSettings(t, day.settings ?? {});
  return formatDuration(compileTimeline(t, { ...toCompileOptions(s), leadInSeconds: 0 }).totalMs);
}

function ProgramToday({
  program,
  startDate,
  today,
  sessions,
  techniques,
  boltToday,
}: {
  program: Program;
  startDate: string;
  today: string;
  sessions: SessionRecord[];
  techniques: Technique[];
  boltToday: boolean;
}) {
  const pos = programPosition(program, startDate, today);
  const find = (id: string) => techniques.find((t) => t.id === id);

  if (pos.status === 'finished') {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-muted">{program.name}</p>
        <h2 className="text-2xl font-semibold">Programmet är klart</h2>
        <p className="text-muted">Snyggt jobbat. Mät BOLT och jämför med starten, och välj gärna ett nytt program.</p>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/bolt" className="flex min-h-14 items-center justify-center rounded-2xl bg-accent font-semibold text-ink">
            Mät BOLT
          </Link>
          <Link to="/program" className="flex min-h-14 items-center justify-center rounded-2xl border border-line">
            Välj program
          </Link>
        </div>
      </Card>
    );
  }

  if (pos.status === 'upcoming') {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-muted">{program.name}</p>
        <h2 className="text-2xl font-semibold">
          Startar om {pos.daysUntilStart} {pos.daysUntilStart === 1 ? 'dag' : 'dagar'}
        </h2>
        {pos.day && <p className="text-muted">Första dagen: {pos.day.title}</p>}
      </Card>
    );
  }

  const day = pos.day;
  const done = isDayDone(sessions, today, program.id, pos.dayNumber, day);
  const t = day ? find(day.techniqueId) : undefined;
  const match = anchorDate(program, startDate, today);
  const daysToMatch = match ? daysBetween(today, match) : null;

  return (
    <div className="flex flex-col gap-3">
      <Card className={`flex flex-col gap-4 ${done ? '' : 'border-accent/40'}`}>
        <div className="flex items-start justify-between gap-3 text-sm text-muted">
          <span>{program.name}</span>
          <span className="shrink-0 tabular-nums">
            {program.repeat ? (daysToMatch === 0 ? 'Matchdag' : daysToMatch! > 0 ? `${daysToMatch} d till match` : '') : `Dag ${pos.dayNumber}/${pos.totalDays}`}
          </span>
        </div>
        {day && t ? (
          <>
            <div>
              <h2 className="text-2xl font-semibold">{day.title}</h2>
              <p className="mt-1 text-muted">
                {t.name} · {durationOf(t, day)}
              </p>
              {day.note && <p className="mt-2 text-sm leading-relaxed text-text/80">{day.note}</p>}
            </div>
            {done ? (
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-accent">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15" aria-hidden="true">
                    ✓
                  </span>
                  Gjord idag
                </span>
                <Link to={sessionLink(day, program.id, pos.dayNumber)} className="min-h-12 px-3 py-3 text-sm text-muted">
                  Kör igen
                </Link>
              </div>
            ) : (
              <Link
                to={sessionLink(day, program.id, pos.dayNumber)}
                className="flex min-h-20 items-center justify-center rounded-2xl bg-accent text-xl font-semibold text-ink active:bg-accent/80"
              >
                Starta dagens session
              </Link>
            )}
          </>
        ) : (
          <div>
            <h2 className="text-2xl font-semibold">Vilodag</h2>
            <p className="mt-1 text-muted">Inget planerat. Använd snabbvalen om du behöver.</p>
          </div>
        )}
      </Card>

      {day?.bolt && !boltToday && (
        <Link to="/bolt" className="flex min-h-16 items-center justify-between rounded-2xl border border-line bg-surface px-5 active:bg-surface-2">
          <span>
            <span className="block">Mät BOLT idag</span>
            <span className="block text-sm text-muted">Helst före sessionen</span>
          </span>
          <span className="text-muted">→</span>
        </Link>
      )}

      <WeekStrip program={program} today={today} sessions={sessions} index={pos.index} />
    </div>
  );
}

/** Programmets aktuella vecka med markering för gjorda dagar. */
function WeekStrip({
  program,
  today,
  sessions,
  index,
}: {
  program: Program;
  today: string;
  sessions: SessionRecord[];
  index: number;
}) {
  const weekFirst = index - (index % 7);
  const offsetToday = index - weekFirst;
  // Programdag 1 i aktuellt varv (veckor ligger alltid inom ett varv).
  const lapStart = addDays(today, -index);
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="Veckans dagar">
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(today, i - offsetToday);
        const dayIndex = weekFirst + i;
        const day = program.weeks[Math.floor(dayIndex / 7)]?.days[dayIndex % 7] ?? null;
        const done = isDayDone(sessions, date, program.id, daysBetween(lapStart, date) + 1, day);
        const isToday = date === today;
        const isMatch = program.anchor?.dayIndex === dayIndex;
        const weekday = new Date(parseLocalDate(date)).toLocaleDateString('sv-SE', { weekday: 'narrow' });
        return (
          <li
            key={date}
            title={day?.title ?? 'Vila'}
            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-xs ${isToday ? 'bg-surface ring-1 ring-accent/50' : ''}`}
          >
            <span className="uppercase text-muted">{weekday}</span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] ${
                done ? 'bg-accent text-ink' : day ? 'border border-line text-muted' : 'text-muted'
              }`}
              aria-label={`${weekday}: ${day ? day.title : 'vila'}${done ? ', gjord' : ''}`}
            >
              {done ? '✓' : day ? '' : '–'}
            </span>
            {isMatch && <span className="text-[10px] leading-none text-accent">match</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Suggestion({ hour, techniques }: { hour: number; techniques: Technique[] }) {
  const s = suggestionForHour(hour);
  const t = techniques.find((x) => x.id === s.techniqueId);
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted">Förslag just nu · {s.reason.toLowerCase()}</p>
        <h2 className="mt-1 text-2xl font-semibold">{t?.name}</h2>
        <p className="mt-1 text-muted">{t?.purpose}</p>
      </div>
      <Link
        to={`/teknik/${s.techniqueId}`}
        className="flex min-h-20 items-center justify-center rounded-2xl bg-accent text-xl font-semibold text-ink active:bg-accent/80"
      >
        Starta
      </Link>
      <Link to="/program" className="min-h-12 self-start py-3 text-sm text-accent">
        Välj ett program för en plan dag för dag →
      </Link>
    </Card>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
