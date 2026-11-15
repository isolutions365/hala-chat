import { registerSW } from 'virtual:pwa-register';

type UpdateListener = (needRefresh: boolean) => void;

let needRefreshState = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
let initialized = false;
const listeners = new Set<UpdateListener>();

function notifyListeners() {
  listeners.forEach((listener) => listener(needRefreshState));
}

export function initPwaUpdater(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const isDebug = window.location.search.includes('debug=1');
  const isSecureHttp = window.location.protocol.startsWith('http');
  const isNativeWebview = Boolean((window as any).Capacitor || navigator.userAgent?.includes('Electron'));

  if (!isSecureHttp || isNativeWebview) return;

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (isDebug) console.log('[Debug][SW] New version available (onNeedRefresh)');
      needRefreshState = true;
      notifyListeners();
    },
    onRegisteredSW(swUrl, registration) {
      if (isDebug) console.log('[Debug][SW] Registered:', swUrl, registration);
      if (!registration) return;

      // Check for updates periodically and when returning to the app
      const checkUpdate = () => {
        registration.update().catch(() => {});
      };
      setInterval(checkUpdate, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkUpdate();
        }
      });
    },
    onRegisterError(err) {
      if (isDebug) console.error('[Debug][SW] Service worker registration error:', err);
    },
  });
}

export function subscribeToPwaUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(needRefreshState);
  return () => {
    listeners.delete(listener);
  };
}

export async function applyPwaUpdate(): Promise<void> {
  if (updateServiceWorker) {
    await updateServiceWorker(true);
  } else if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
