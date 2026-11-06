import { applyTypography, readTypography } from './lib/typography';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App.tsx';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import './index.css';

// Register the PWA in prompt mode. A waiting update must never reload an active chat.
const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (isDebug) console.log('[Debug][SW] Update available; waiting for user confirmation.');
    window.dispatchEvent(new Event('hala:pwa-update-available'));
  },
  onRegistered(r) {
    if (isDebug) console.log('[Debug][SW] Service worker registered:', r);
  },
  onRegisterError(err) {
    console.error('[PWA] Service worker registration error:', err);
  },
});

// The UI dispatches this only after the user explicitly chooses “Update now”.
window.addEventListener('hala:pwa-apply-update', () => {
  void updateServiceWorker(true).catch((err) => {
    console.error('[PWA] Failed to apply service worker update:', err);
  });
});

applyTypography(readTypography());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <PWAUpdatePrompt />
    </ErrorBoundary>
  </StrictMode>,
);
