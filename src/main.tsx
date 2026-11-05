import { applyTypography, readTypography } from './lib/typography';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

// Register PWA service worker with loop guard (at most 1 reload per session)
const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');

registerSW({
  immediate: true,
  onNeedReload() {
    const RELOAD_KEY = 'hala_pwa_reloaded';
    let alreadyReloaded = false;
    try {
      alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === 'true';
    } catch {}

    if (isDebug) console.log('[Debug][SW] onNeedReload triggered. alreadyReloaded:', alreadyReloaded);

    if (!alreadyReloaded) {
      try { sessionStorage.setItem(RELOAD_KEY, 'true'); } catch {}
      window.location.reload();
    } else {
      if (isDebug) console.warn('[Debug][SW] Multiple reload attempts suppressed to prevent infinite reload loop.');
    }
  },
  onRegistered(r) {
    if (isDebug) console.log('[Debug][SW] Service worker registered:', r);
  },
  onRegisterError(err) {
    if (isDebug) console.error('[Debug][SW] Service worker registration error:', err);
  },
});

applyTypography(readTypography());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
