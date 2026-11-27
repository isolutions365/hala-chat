import { applyTypography, readTypography } from './lib/typography';
import { initThemeListener } from './lib/theme';
import { installAudioUnlockListeners } from './lib/sounds';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CompatibilityGate } from './components/CompatibilityGate';
import { initPwaUpdater } from './lib/pwaUpdate';
import App from './App.tsx';
import './index.css';

// Register Google Maps auth/quota listener before React renders
if (typeof window !== 'undefined') {
  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args.map((arg) => String(arg ?? '')).join(' ');
    if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
    if (
      msg.includes('@firebase/firestore') &&
      msg.includes('Could not reach Cloud Firestore backend')
    ) {
      console.warn(...args);
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

// Register PWA service worker with prompt-for-update banner flow
initPwaUpdater();

applyTypography(readTypography());
initThemeListener();
installAudioUnlockListeners();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <CompatibilityGate>
        <App />
      </CompatibilityGate>
    </ErrorBoundary>
  </StrictMode>,
);
