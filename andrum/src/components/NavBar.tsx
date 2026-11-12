import { NavLink, Outlet } from 'react-router-dom';
import { UpdatePrompt } from './UpdatePrompt';

const TABS = [
  { to: '/', label: 'Idag', icon: 'M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
  { to: '/tekniker', label: 'Tekniker', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/matning', label: 'Mätning', icon: 'M12 8v4l2.5 2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { to: '/statistik', label: 'Statistik', icon: 'M4 19V9m6 10V5m6 14v-7m4 7H3' },
  {
    to: '/installningar',
    label: 'Inställningar',
    icon: 'M4 7h10m4 0h2M4 17h4m4 0h8M14 5v4M8 15v4',
  },
];

/** Sidlayout med flikrad längst ned. Sessionsvyn ligger utanför (helskärm). */
export function TabLayout() {
  return (
    <div className="min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <Outlet />
      {/* Bara i flikvyerna – aldrig ovanpå en pågående session. */}
      <UpdatePrompt />
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto flex max-w-lg">
          {TABS.map((t) => (
            <li key={t.to} className="flex-1">
              <NavLink
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${isActive ? 'text-accent' : 'text-muted'}`
                }
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
