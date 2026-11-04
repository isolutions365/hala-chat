import { useEffect, useRef } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '../lib/firebase';

/**
 * usePresenceHeartbeat
 * Single writer hook for user presence.
 * - Writes `lastSeen: serverTimestamp()` every 20 seconds while app is foreground & online.
 * - Immediately writes on foreground return.
 * - Stops heartbeat immediately when document is hidden / blurred / offline.
 * - NEVER writes "online: false" (offline is determined purely by lastSeen staleness > 55s).
 */
export function usePresenceHeartbeat(userId: string | null | undefined) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastWriteTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!userId) return;

    let isDisposed = false;

    const writeHeartbeat = async () => {
      if (isDisposed) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      // Throttle writes to at least 10 seconds between heartbeats
      const now = Date.now();
      if (now - lastWriteTimeRef.current < 10000) {
        return;
      }
      lastWriteTimeRef.current = now;

      try {
        const db = getFirebaseDb();
        const presenceRef = doc(db, 'presence', userId);
        await setDoc(
          presenceRef,
          {
            lastSeen: serverTimestamp(),
            online: true,
          },
          { merge: true }
        );
      } catch (err) {
        // Non-fatal presence heartbeat failure (e.g. temporary network offline)
        console.warn('[usePresenceHeartbeat] Heartbeat write failed:', err);
      }
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      void writeHeartbeat();
      timerRef.current = setInterval(() => {
        void writeHeartbeat();
      }, 20000);
    };

    const stopHeartbeat = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
    };

    const handleOnline = () => {
      if (document.visibilityState === 'visible') {
        startHeartbeat();
      }
    };

    const handleOffline = () => {
      stopHeartbeat();
    };

    // Initial start if page is visible
    if (document.visibilityState === 'visible') {
      startHeartbeat();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      isDisposed = true;
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [userId]);
}
