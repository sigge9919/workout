import { useEffect, useState } from 'react';
import { Workbox } from 'workbox-window';

let wb: Workbox | null = null;

/**
 * Registrerar service workern och visar en diskret banderoll när en ny
 * version finns. Uppdateringen sker bara när användaren trycker, så en
 * pågående session aldrig laddas om. Bara i byggd app (inte i dev).
 */
export function UpdatePrompt() {
  const [waiting, setWaiting] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || wb) return;
    wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
    wb.addEventListener('waiting', () => setWaiting(true));
    wb.addEventListener('controlling', () => window.location.reload());
    wb.addEventListener('installed', (e) => {
      if (!e.isUpdate) setOfflineReady(true);
    });
    void wb.register();
    // Leta efter uppdateringar när appen öppnas igen.
    const onVisible = () => document.visibilityState === 'visible' && void wb?.update();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    const id = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(id);
  }, [offlineReady]);

  if (!waiting && !offlineReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] z-50 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 shadow-xl"
    >
      {waiting ? (
        <>
          <span className="text-sm">Ny version av Andrum finns.</span>
          <span className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setWaiting(false)} className="min-h-12 px-3 text-sm text-muted">
              Senare
            </button>
            <button
              type="button"
              onClick={() => wb?.messageSkipWaiting()}
              className="min-h-12 rounded-xl bg-accent px-4 text-sm font-semibold text-ink"
            >
              Uppdatera
            </button>
          </span>
        </>
      ) : (
        <span className="py-2 text-sm">Appen fungerar nu offline.</span>
      )}
    </div>
  );
}
