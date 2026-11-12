import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TabLayout } from './components/NavBar';
import { BoltTestPage } from './pages/BoltTest';
import { HomePage } from './pages/Home';
import { SessionPage } from './pages/Session';
import { SettingsPage } from './pages/Settings';
import { TechniquesPage } from './pages/Techniques';

// Diagramsidorna (Recharts) laddas först när de öppnas.
const MeasurePage = lazy(() => import('./pages/Measure').then((m) => ({ default: m.MeasurePage })));
const StatsPage = lazy(() => import('./pages/Stats').then((m) => ({ default: m.StatsPage })));

/** HashRouter: fungerar på GitHub Pages och offline utan serverkonfiguration. */
export function App() {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<TabLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/tekniker" element={<TechniquesPage />} />
            <Route path="/matning" element={<MeasurePage />} />
            <Route path="/statistik" element={<StatsPage />} />
            <Route path="/installningar" element={<SettingsPage />} />
          </Route>
          <Route path="/teknik/:id" element={<SessionPage />} />
          <Route path="/bolt" element={<BoltTestPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
