import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TabLayout } from './components/NavBar';
import { BoltTestPage } from './pages/BoltTest';
import { HomePage } from './pages/Home';
import { MeasurePage } from './pages/Measure';
import { SessionPage } from './pages/Session';
import { SettingsPage } from './pages/Settings';
import { TechniquesPage } from './pages/Techniques';

/** HashRouter: fungerar på GitHub Pages och offline utan serverkonfiguration. */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/tekniker" element={<TechniquesPage />} />
          <Route path="/matning" element={<MeasurePage />} />
          <Route path="/installningar" element={<SettingsPage />} />
        </Route>
        <Route path="/teknik/:id" element={<SessionPage />} />
        <Route path="/bolt" element={<BoltTestPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
