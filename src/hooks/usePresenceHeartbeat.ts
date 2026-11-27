import { useEffect, useRef } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '../lib/firebase';

/**
 * usePresenceHeartbeat
 * Single writer hook for user presence.
 * - Writes `lastSeen: serverTimestamp(), online: true` every 60 seconds while app is foreground & online.
 * - Immediately writes `online: true` on foreground return.
 * - Immediately writes `online: false` when app is backgrounded or closed (while keeping 120s staleness fallback if connection drops).
 */
export function usePresenceHeartbeat(userId: string | null | undefined) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastWriteTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!userId) return;

    let isDisposed = false;

    const writeHeartbeat = async (force = false) => {
      if (isDisposed) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      // Throttle periodic writes to at least 10 seconds unless forced (e.g., foreground resume)
      const now = Date.now();
      if (!force && now - lastWriteTimeRef.current < 10000) {
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

    const writeOffline = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      lastWriteTimeRef.current = 0;
      try {
        const db = getFirebaseDb();
        const presenceRef = doc(db, 'presence', userId);
        void setDoc(
          presenceRef,
          {
            lastSeen: serverTimestamp(),
            online: false,
          },
          { merge: true }
        ).catch(() => {});
      } catch {
        // Non-fatal offline presence write error
      }
    };

    const startHeartbeat = (force = false) => {
      stopHeartbeat();
      void writeHeartbeat(force);
      timerRef.current = setInterval(() => {
        void writeHeartbeat(false);
      }, 60000);
    };

    const stopHeartbeat = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startHeartbeat(true);
      } else {
        stopHeartbeat();
        writeOffline();
      }
    };

    const handlePageHide = () => {
      stopHeartbeat();
      writeOffline();
    };

    const handleOnline = () => {
      if (document.visibilityState === 'visible') {
        startHeartbeat(true);
      }
    };

    const handleOffline = () => {
      stopHeartbeat();
    };

    // Initial start if page is visible
    if (document.visibilityState === 'visible') {
      startHeartbeat(true);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      isDisposed = true;
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [userId]);
}
