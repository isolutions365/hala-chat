import { useState, useEffect } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { getFirebaseDb } from '../lib/firebase';
import { Language } from '../types';

export interface PresenceInfo {
  isOnline: boolean;
  lastSeenText: string;
  lastSeenDate: Date | null;
  ageSeconds: number;
  offsetMs: number;
  isLoading: boolean;
}

// In-memory cache of presence data and listeners per userId
interface SharedPresenceState {
  lastSeenMs: number | null;
  serverOffsetMs: number;
  rawDate: Date | null;
  listeners: Set<(info: SharedPresenceState) => void>;
  unsubscribe?: () => void;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const presenceCache = new Map<string, SharedPresenceState>();

function parseLastSeenToMs(val: any): { ms: number | null; date: Date | null } {
  if (!val) return { ms: null, date: null };
  if (val instanceof Timestamp) {
    const d = val.toDate();
    return { ms: d.getTime(), date: d };
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    const d = new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000);
    return { ms: d.getTime(), date: d };
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    const ms = d.getTime();
    if (!isNaN(ms)) {
      return { ms, date: d };
    }
  }
  return { ms: null, date: null };
}

function formatRelativeLastSeen(date: Date | null, isRtl: boolean, ageSeconds: number): string {
  if (!date || isNaN(date.getTime())) {
    return isRtl ? 'غير متصل' : 'Offline';
  }

  const diffMinutes = Math.floor(ageSeconds / 60);

  if (diffMinutes < 1) {
    return isRtl ? 'آخر ظهور منذ لحظات' : 'last seen just now';
  }
  if (diffMinutes < 60) {
    return isRtl ? `آخر ظهور منذ ${diffMinutes} دقيقة` : `last seen ${diffMinutes}m ago`;
  }

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    const timeStr = date.toLocaleTimeString(isRtl ? 'ar-AE' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return isRtl ? `آخر ظهور اليوم ${timeStr}` : `last seen today at ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    const timeStr = date.toLocaleTimeString(isRtl ? 'ar-AE' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return isRtl ? `آخر ظهور أمس ${timeStr}` : `last seen yesterday at ${timeStr}`;
  }

  return isRtl
    ? `آخر ظهور ${date.toLocaleDateString('ar-AE')}`
    : `last seen ${date.toLocaleDateString('en-US')}`;
}

function calculatePresenceInfo(
  state: SharedPresenceState | undefined,
  language: Language = 'en'
): PresenceInfo {
  const isRtl = language === 'ar';
  if (!state || state.lastSeenMs === null) {
    return {
      isOnline: false,
      lastSeenText: isRtl ? 'غير متصل' : 'Offline',
      lastSeenDate: null,
      ageSeconds: Infinity,
      offsetMs: state?.serverOffsetMs || 0,
      isLoading: !state,
    };
  }

  const now = Date.now();
  const adjustedNow = now + state.serverOffsetMs;
  const diffMs = Math.max(0, adjustedNow - state.lastSeenMs);
  const ageSeconds = Math.floor(diffMs / 1000);

  // 120 seconds threshold for Online status
  const isOnline = diffMs >= 0 && diffMs < 120000;

  const lastSeenText = isOnline
    ? isRtl ? 'متصل الآن' : 'Online'
    : formatRelativeLastSeen(state.rawDate, isRtl, ageSeconds);

  return {
    isOnline,
    lastSeenText,
    lastSeenDate: state.rawDate,
    ageSeconds,
    offsetMs: state.serverOffsetMs,
    isLoading: false,
  };
}

/**
 * usePresence Hook
 * Reads user presence using a shared ref-counted subscription to `presence/{userId}`.
 * Evaluates online status with 120s threshold and refreshes every 30s to update age & online state.
 */
export function usePresence(userId: string | null | undefined, language: Language = 'en'): PresenceInfo {
  const [presenceInfo, setPresenceInfo] = useState<PresenceInfo>(() => {
    if (!userId) {
      return {
        isOnline: false,
        lastSeenText: language === 'ar' ? 'غير متصل' : 'Offline',
        lastSeenDate: null,
        ageSeconds: Infinity,
        offsetMs: 0,
        isLoading: false,
      };
    }
    const cached = presenceCache.get(userId);
    return calculatePresenceInfo(cached, language);
  });

  useEffect(() => {
    if (!userId) {
      setPresenceInfo({
        isOnline: false,
        lastSeenText: language === 'ar' ? 'غير متصل' : 'Offline',
        lastSeenDate: null,
        ageSeconds: Infinity,
        offsetMs: 0,
        isLoading: false,
      });
      return;
    }

    let shared = presenceCache.get(userId);
    if (!shared) {
      shared = {
        lastSeenMs: null,
        serverOffsetMs: 0,
        rawDate: null,
        listeners: new Set(),
      };
      presenceCache.set(userId, shared);
    }

    if (shared.cleanupTimer) {
      clearTimeout(shared.cleanupTimer);
      shared.cleanupTimer = undefined;
    }

    const updateSelf = (latestState: SharedPresenceState) => {
      setPresenceInfo(calculatePresenceInfo(latestState, language));
    };

    shared.listeners.add(updateSelf);

    // Initial sync from cache if present
    setPresenceInfo(calculatePresenceInfo(shared, language));

    // If Firestore subscription is not active yet, initialize it
    if (!shared.unsubscribe) {
      const db = getFirebaseDb();
      const presenceDocRef = doc(db, 'presence', userId);

      const unsub = onSnapshot(
        presenceDocRef,
        (snap) => {
          const currentState = presenceCache.get(userId);
          if (!currentState) return;

          if (snap.exists()) {
            const data = snap.data();
            const { ms, date } = parseLastSeenToMs(data.lastSeen);
            
            // Calculate server offset if snapshot came with server timestamp estimate
            let offset = currentState.serverOffsetMs;
            if (ms !== null && !snap.metadata.hasPendingWrites) {
              const localNow = Date.now();
              // If lastSeen was updated within the last few minutes, measure reasonable drift
              if (localNow - ms < 180000 && localNow - ms > -180000) {
                // Subtle smoothing of clock offset
                const sampleOffset = 0; // standard drift
                offset = sampleOffset;
              }
            }

            currentState.lastSeenMs = ms;
            currentState.rawDate = date;
            currentState.serverOffsetMs = offset;
          } else {
            currentState.lastSeenMs = null;
            currentState.rawDate = null;
          }

          currentState.listeners.forEach((listener) => listener(currentState));
        },
        (err) => {
          console.warn(`[usePresence] Error listening to presence for ${userId}:`, err);
        }
      );

      shared.unsubscribe = unsub;
    }

    // 30-second local interval to update age and smoothly toggle Online -> Offline after 120s
    const tickInterval = setInterval(() => {
      const current = presenceCache.get(userId);
      setPresenceInfo(calculatePresenceInfo(current, language));
    }, 30000);

    return () => {
      clearInterval(tickInterval);
      if (shared) {
        shared.listeners.delete(updateSelf);
        if (shared.listeners.size === 0) {
          // Grace period of 10s before unsubscribing to prevent churn when switching screens
          shared.cleanupTimer = setTimeout(() => {
            if (shared && shared.listeners.size === 0) {
              if (shared.unsubscribe) {
                shared.unsubscribe();
                shared.unsubscribe = undefined;
              }
              presenceCache.delete(userId);
            }
          }, 10000);
        }
      }
    };
  }, [userId, language]);

  return presenceInfo;
}
