import { registerSW } from 'virtual:pwa-register';
import { USER_SCOPED_CACHE_NAMES } from './workboxConfig';

type UpdateListener = (needRefresh: boolean) => void;
type OfflineReadyListener = (offlineReady: boolean) => void;

let needRefreshState = false;
let offlineReadyState = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
let initialized = false;
const listeners = new Set<UpdateListener>();
const offlineReadyListeners = new Set<OfflineReadyListener>();

function notifyListeners() {
  listeners.forEach((listener) => listener(needRefreshState));
}

function notifyOfflineReadyListeners() {
  offlineReadyListeners.forEach((listener) => listener(offlineReadyState));
}

export function initPwaUpdater(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const isDebug = window.location.search.includes('debug=1');
  const isSecureHttp = window.location.protocol.startsWith('http');
  const isNativeWebview = Boolean((window as any).Capacitor || navigator.userAgent?.includes('Electron'));

  if (!isSecureHttp || isNativeWebview) return;

  // Never register a PWA service worker in Vite dev mode (prevents stale HTML & HMR socket conflicts)
  if (import.meta.env.DEV) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          if (!reg.active?.scriptURL?.includes('firebase-messaging-sw.js')) {
            void reg.unregister();
          }
        }
      }).catch(() => {});
    }
    return;
  }

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (isDebug) console.log('[Debug][SW] New version available (onNeedRefresh)');
      needRefreshState = true;
      notifyListeners();
    },
    onOfflineReady() {
      if (isDebug) console.log('[Debug][SW] Static shell precached and ready for offline use');
      offlineReadyState = true;
      notifyOfflineReadyListeners();
    },
    onRegisteredSW(swUrl, registration) {
      if (isDebug) console.log('[Debug][SW] Registered:', swUrl, registration);
      if (!registration) return;

      // Check for updates periodically and when returning to the app / regaining connectivity
      const checkUpdate = () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        registration.update().catch(() => {});
      };
      setInterval(checkUpdate, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkUpdate();
        }
      });
      window.addEventListener('online', checkUpdate);
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

export function subscribeToPwaOfflineReady(listener: OfflineReadyListener): () => void {
  offlineReadyListeners.add(listener);
  listener(offlineReadyState);
  return () => {
    offlineReadyListeners.delete(listener);
  };
}

/**
 * Clears user-scoped Workbox runtime API/media caches (e.g., on explicit logout)
 * while preserving the static app shell, fonts, and map tiles for fast offline reload.
 */
export async function clearOfflineUserCaches(
  cacheStorage?: Pick<CacheStorage, 'keys' | 'delete'>
): Promise<string[]> {
  const storage = cacheStorage ?? (typeof window !== 'undefined' ? window.caches : undefined);
  if (!storage || typeof storage.keys !== 'function' || typeof storage.delete !== 'function') {
    return [];
  }

  const deleted: string[] = [];
  try {
    const keys = await storage.keys();
    for (const key of keys) {
      if (USER_SCOPED_CACHE_NAMES.includes(key)) {
        const ok = await storage.delete(key);
        if (ok) deleted.push(key);
      }
    }
  } catch (err) {
    console.warn('[SW] Failed clearing user-scoped runtime caches:', err);
  }
  return deleted;
}

export async function applyPwaUpdate(): Promise<void> {
  if (updateServiceWorker) {
    return new Promise(async (resolve, reject) => {
      let reloaded = false;
      const timer = setTimeout(async () => {
        if (!reloaded) {
          reloaded = true;
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
              const scriptUrl =
                reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
              if (scriptUrl.includes('firebase-messaging-sw.js')) {
                continue;
              }
              try {
                const url = new URL(reg.scope);
                if (url.pathname === '/') {
                  await reg.unregister();
                }
              } catch {
                if (reg.scope === window.location.origin + '/' || reg.scope === '/') {
                  await reg.unregister();
                }
              }
            }
          } catch (e) {
            console.warn('[SW] Unregister failed:', e);
          }
          try {
            if (window.caches && caches.keys) {
              const keys = await caches.keys();
              for (const key of keys) {
                await caches.delete(key);
              }
            }
          } catch (e) {
            console.warn('[SW] Cache clear failed:', e);
          }
          window.location.reload();
        }
      }, 4000);

      try {
        await updateServiceWorker(true);
      } catch (err) {
        clearTimeout(timer);
        if (!reloaded) {
          reloaded = true;
          reject(err);
        }
      }
    });
  } else if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

