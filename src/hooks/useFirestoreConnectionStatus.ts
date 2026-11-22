import { useState, useEffect } from 'react';
import { getFirebaseDb } from '../lib/firebase';
import { doc, onSnapshot, onSnapshotsInSync } from 'firebase/firestore';

export interface FirestoreConnectionState {
  isOnline: boolean;
  isFirestoreConnected: boolean;
  isFromCache: boolean;
  status: 'online' | 'offline' | 'connecting';
  lastConnectedAt: number | null;
}

export function useFirestoreConnectionStatus(userId?: string): FirestoreConnectionState {
  const [state, setState] = useState<FirestoreConnectionState>(() => {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return {
      isOnline: online,
      isFirestoreConnected: online,
      isFromCache: false,
      status: online ? 'online' : 'offline',
      lastConnectedAt: online ? Date.now() : null,
    };
  });

  useEffect(() => {
    let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    let isFromCache = false;

    const updateState = (online: boolean, fromCache: boolean, connected: boolean) => {
      isOnline = online;
      isFromCache = fromCache;

      setState(prev => ({
        isOnline: online,
        isFirestoreConnected: connected,
        isFromCache: fromCache,
        status: !online ? 'offline' : (!connected || fromCache) ? 'offline' : 'online',
        lastConnectedAt: connected ? Date.now() : prev.lastConnectedAt,
      }));
    };

    const handleOnline = () => {
      updateState(true, isFromCache, !isFromCache);
    };

    const handleOffline = () => {
      updateState(false, true, false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    let unsubDoc: (() => void) | null = null;
    let unsubInSync: (() => void) | null = null;

    try {
      const db = getFirebaseDb();

      // Listen to in-sync events from Firestore
      unsubInSync = onSnapshotsInSync(db, () => {
        if (navigator.onLine) {
          updateState(true, isFromCache, !isFromCache);
        }
      });

      // Listen to user document with metadata changes to detect live server sync vs cache
      if (userId) {
        const userRef = doc(db, 'users', userId);
        unsubDoc = onSnapshot(
          userRef,
          { includeMetadataChanges: true },
          (snapshot) => {
            const fromCache = snapshot.metadata.fromCache;
            const connected = navigator.onLine && !fromCache;
            updateState(navigator.onLine, fromCache, connected);
          },
          (err) => {
            console.warn('[useFirestoreConnectionStatus] Firestore listener notice:', err);
            updateState(navigator.onLine, true, false);
          }
        );
      }
    } catch (e) {
      console.warn('[useFirestoreConnectionStatus] Initialization notice:', e);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      if (unsubDoc) unsubDoc();
      if (unsubInSync) unsubInSync();
    };
  }, [userId]);

  return state;
}
