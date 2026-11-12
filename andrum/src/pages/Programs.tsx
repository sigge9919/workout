import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BigButton, Card } from '../components/ui';
import { clearActiveProgram, localDate, setActiveProgram } from '../db/repo';
import { db } from '../db/schema';
import { parseLocalDate } from '../lib/stats';
import { BUILTIN_PROGRAMS } from '../programs/builtin';
import { programLength, programPosition, startDateForAnchor } from '../programs/today';
import type { Program } from '../programs/types';
import { findTechnique } from '../techniques/builtin';

const formatDay = (date: string) =>
  new Date(parseLocalDate(date)).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });

export function ProgramsPage() {
  const state = useLiveQuery(() => db.programState.get('active'), [], null);
  const [open, setOpen] = useState<string | null>(null);
  if (state === null) return null;

  return (
    <div className="safe-screen mx-auto flex max-w-lg flex-col gap-5 px-5 pb-6">
      <header className="pt-6">
        <h1 className="text-3xl font-semibold tracking-tight">Program</h1>
        <p className="mt-1 text-muted">Ett aktivt program i taget. Dagens session visas under Idag.</p>
      </header>

      {BUILTIN_PROGRAMS.map((p) => (
        <ProgramCard
          key={p.id}
          program={p}
          active={state?.programId === p.id ? state.startDate : undefined}
          expanded={open === p.id}
          onToggle={() => setOpen(open === p.id ? null : p.id)}
        />
      ))}
    </div>
  );
}

function ProgramCard({
  program,
  active,
  expanded,
  onToggle,
}: {
  program: Program;
  /** Startdatum om programmet är aktivt. */
  active?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const today = localDate();
  const [date, setDate] = useState(today);
  const [confirmStop, setConfirmStop] = useState(false);
  const pos = active ? programPosition(program, active, today) : null;

  const start = async () => {
    const startDate = program.anchor ? startDateForAnchor(program, date) : date;
    await setActiveProgram(program.id, startDate);
    navigate('/');
  };

  return (
    <Card className={`flex flex-col gap-4 ${active ? 'border-accent/50' : ''}`}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">{program.name}</h2>
          {active && <span className="shrink-0 rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">Aktivt</span>}
        </div>
        <p className="mt-1 text-muted">{program.summary}</p>
        <p className="mt-1 text-sm text-muted">
          {program.repeat ? 'Upprepas varje vecka' : `${program.weeks.length} veckor · ${programLength(program)} dagar`}
        </p>
      </div>

      {pos && (
        <p className="text-sm">
          {pos.status === 'upcoming' && `Startar om ${pos.daysUntilStart} ${pos.daysUntilStart === 1 ? 'dag' : 'dagar'}.`}
          {pos.status === 'active' && `Dag ${pos.dayNumber} av ${pos.totalDays}.`}
          {pos.status === 'finished' && 'Programmet är genomfört.'}
        </p>
      )}

      <p className="text-sm leading-relaxed text-text/90">{program.description}</p>

      <button type="button" onClick={onToggle} className="min-h-12 self-start text-sm text-accent" aria-expanded={expanded}>
        {expanded ? 'Dölj schema ▴' : 'Visa schema ▾'}
      </button>
      {expanded && <Schedule program={program} highlight={pos?.status === 'active' ? pos.index : undefined} />}

      {active ? (
        <BigButton
          variant="danger"
          onClick={async () => {
            if (!confirmStop) return setConfirmStop(true);
            await clearActiveProgram();
            setConfirmStop(false);
          }}
        >
          {confirmStop ? 'Tryck igen för att avsluta' : 'Avsluta program'}
        </BigButton>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-2 block text-sm text-muted">{program.anchor ? `${program.anchor.label}` : 'Startdatum'}</span>
            <input
              type="date"
              value={date}
              min={program.anchor ? today : undefined}
              onChange={(e) => setDate(e.target.value || today)}
              className="min-h-14 w-full rounded-2xl border border-line bg-ink px-4 text-base text-text [color-scheme:dark]"
            />
          </label>
          {program.anchor && (
            <p className="text-sm text-muted">
              Veckan börjar {formatDay(startDateForAnchor(program, date))} och upprepas sedan varje vecka.
            </p>
          )}
          <BigButton onClick={start}>Starta programmet</BigButton>
        </div>
      )}
    </Card>
  );
}

function Schedule({ program, highlight }: { program: Program; highlight?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {program.weeks.map((w, wi) => (
        <div key={wi}>
          <h3 className="mb-2 text-xs uppercase tracking-widest text-muted">
            {program.weeks.length > 1 ? `Vecka ${wi + 1} · ` : ''}
            {w.title}
          </h3>
          <ol className="flex flex-col divide-y divide-line rounded-2xl bg-ink">
            {w.days.map((d, di) => {
              const index = wi * 7 + di;
              const isAnchor = program.anchor?.dayIndex === index;
              return (
                <li
                  key={di}
                  className={`flex min-h-12 items-center gap-3 px-3 py-2 text-sm ${highlight === index ? 'bg-accent/10' : ''}`}
                >
                  <span className="w-12 shrink-0 text-xs tabular-nums text-muted">
                    {program.anchor ? (isAnchor ? 'Match' : relativeLabel(index - program.anchor.dayIndex)) : `Dag ${index + 1}`}
                  </span>
                  <span className="min-w-0 flex-1">
                    {d ? (
                      <>
                        <span className="block truncate">{d.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {findTechnique(d.techniqueId)?.name}
                          {d.bolt ? ' · BOLT' : ''}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">Vila</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

function relativeLabel(diff: number): string {
  return diff < 0 ? `M${diff}` : `M+${diff}`;
}
