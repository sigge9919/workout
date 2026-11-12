import { Link, useSearchParams } from 'react-router-dom';
import { PatternBar } from '../components/PatternBar';
import { Chips } from '../components/ui';
import { compileTimeline } from '../engine/timeline';
import type { Situation } from '../engine/types';
import { formatDuration } from '../lib/format';
import { useAllTechniques } from '../techniques';
import { SITUATIONS } from '../techniques/situations';

type Filter = Situation | 'all';

export function TechniquesPage() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get('lage') as Filter | null) ?? 'all';
  const all = useAllTechniques() ?? [];
  const list = filter === 'all' ? all : all.filter((t) => t.tags.includes(filter));

  const options: Array<{ value: Filter; label: string }> = [
    { value: 'all', label: 'Alla' },
    ...SITUATIONS.map((s) => ({ value: s.id as Filter, label: s.label })),
  ];

  return (
    <div className="safe-screen mx-auto flex max-w-lg flex-col gap-5 px-5 pb-6">
      <header className="pt-6">
        <h1 className="text-3xl font-semibold tracking-tight">Tekniker</h1>
      </header>

      <Chips
        options={options}
        value={filter}
        onChange={(v) => setParams(v === 'all' ? {} : { lage: v }, { replace: true })}
      />

      <ul className="flex flex-col gap-3">
        {list.map((t) => (
          <li key={t.id}>
            <Link
              to={`/teknik/${t.id}`}
              className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 active:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="block text-lg font-medium">
                    {t.name}
                    {!t.builtin && <span className="ml-2 align-middle text-xs font-normal text-accent">egen</span>}
                  </span>
                  <span className="block text-sm text-muted">{t.purpose}</span>
                </span>
                <span className="shrink-0 pt-1 text-sm tabular-nums text-muted">
                  {formatDuration(compileTimeline(t, { leadInSeconds: 0 }).totalMs)}
                </span>
              </div>
              <PatternBar cycle={t.cycle} compact />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
