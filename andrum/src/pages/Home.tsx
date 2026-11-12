import { Link } from 'react-router-dom';
import { SITUATIONS } from '../techniques/situations';

/** Startsida. "Idag" med dagens programsession läggs till i steg 6. */
export function HomePage() {
  return (
    <div className="safe-screen mx-auto flex max-w-lg flex-col gap-6 px-5 pb-6">
      <header className="pt-6">
        <h1 className="text-4xl font-semibold tracking-tight">Andrum</h1>
        <p className="mt-1 text-muted">Andning för träning, match och återhämtning</p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-muted">Snabbval</h2>
        <ul className="grid grid-cols-2 gap-3">
          {SITUATIONS.map((s, i) => (
            <li key={s.id} className={i === 0 ? 'col-span-2' : ''}>
              <Link
                to={`/teknik/${s.techniqueId}`}
                className="flex min-h-28 flex-col justify-end rounded-3xl border border-line bg-surface p-4 active:bg-surface-2"
              >
                <span className="text-lg font-medium">{s.label}</span>
                <span className="text-sm text-muted">{s.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link to="/tekniker" className="flex min-h-14 items-center justify-center rounded-2xl border border-line text-muted active:bg-surface">
        Alla tekniker →
      </Link>
    </div>
  );
}
