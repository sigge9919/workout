import { Link } from 'react-router-dom';
import { compileTimeline } from '../engine/timeline';
import { formatDuration } from '../lib/format';
import { BUILTIN_TECHNIQUES } from '../techniques/builtin';

/** Steg 1: enkel lista för att prova sessionerna. "Idag"-vyn kommer i steg 6. */
export function HomePage() {
  return (
    <div className="safe-screen mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-5 pb-8">
      <header className="pt-6">
        <h1 className="text-4xl font-semibold tracking-tight">Andrum</h1>
        <p className="mt-1 text-muted">Andning för träning, match och återhämtning</p>
      </header>

      <ul className="flex flex-col gap-3">
        {BUILTIN_TECHNIQUES.map((t) => (
          <li key={t.id}>
            <Link
              to={`/session/${t.id}`}
              className="flex min-h-20 items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-5 active:bg-surface-2"
            >
              <span>
                <span className="block text-lg font-medium">{t.name}</span>
                <span className="block text-sm text-muted">{t.purpose}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-muted">
                {formatDuration(compileTimeline(t, { leadInSeconds: 0 }).totalMs)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
