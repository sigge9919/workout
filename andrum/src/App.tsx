import { HashRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/Home';
import { SessionPage } from './pages/Session';

/** HashRouter: fungerar på GitHub Pages och offline utan serverkonfiguration. */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/session/:id" element={<SessionPage />} />
      </Routes>
    </HashRouter>
  );
}
