/**
 * Safe Local Storage & Firebase Storage error handling and disposable cache management.
 * 
 * SAFE DATA INVARIANTS:
 * - Never clears all Local Storage or any user-created content.
 * - Never deletes messages, user-uploaded media, encryption keys, authentication/session state, or user preferences.
 * - Only cleans strictly disposable temporary caches (translation snippets, LRU text caches, excess recent emoji history).
 */

export function isStorageQuotaError(err: unknown): boolean {
  if (!err) return false;
  const e = err as any;
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    (typeof e.message === 'string' && (
      e.message.toLowerCase().includes('quota') ||
      e.message.toLowerCase().includes('storage full') ||
      e.message.toLowerCase().includes('exceeded the quota')
    ))
  );
}

export function isFirebaseStorageNonRetryableError(err: unknown): boolean {
  if (!err) return false;
  const code = (err as any)?.code || '';
  const message = String((err as any)?.message || '').toLowerCase();
  return (
    code === 'storage/quota-exceeded' ||
    code === 'storage/unauthorized' ||
    code === 'storage/object-not-found' ||
    code === 'storage/canceled' ||
    code === 'storage/invalid-checksum' ||
    code === 'storage/retry-limit-exceeded' ||
    message.includes('permission') ||
    message.includes('quota') ||
    message.includes('unauthorized') ||
    message.includes('decryption returned null') ||
    message.includes('operationerror') ||
    message.includes('retry-limit-exceeded')
  );
}

export function isFirebaseStorageQuotaError(err: unknown): boolean {
  if (!err) return false;
  const code = (err as any)?.code || '';
  const message = String((err as any)?.message || '').toLowerCase();
  return (
    code === 'storage/quota-exceeded' ||
    code === 'storage/project-quota-exceeded' ||
    message.includes('quota') ||
    message.includes('exceeded quota')
  );
}

export function getSafeStorageErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (isFirebaseStorageQuotaError(err)) {
    return 'Cloud storage quota exceeded. Please contact support or free up space.';
  }
  const code = (err as any)?.code;
  if (code === 'storage/unauthorized') {
    return 'Permission denied. Please ensure you are logged in.';
  }
  if (code === 'storage/canceled') {
    return 'Upload canceled.';
  }
  return fallback;
}

/**
 * Bounded cleanup of clearly disposable cache entries when space is needed.
 * Returns the number of disposable keys removed.
 */
export function cleanupDisposableStorage(targetKeysToFree = 20): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  
  let freedCount = 0;
  try {
    const keysToRemove: string[] = [];
    const translationKeys: string[] = [];
    const peerKeyKeys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // 1. Translation cache is completely disposable
      if (key.startsWith('hala_trans_v1_')) {
        translationKeys.push(key);
      }
      // 2. Peer public key cache is re-fetchable from Firestore
      else if (key.startsWith('hala_peer_pubkey_')) {
        peerKeyKeys.push(key);
      }
      // 3. LRU text decryption cache is disposable
      else if (key === 'hala_whatsapp_speed_cache_v1') {
        keysToRemove.push(key);
      }
    }

    // Prioritize oldest translation keys
    keysToRemove.push(...translationKeys.slice(0, targetKeysToFree));

    // If still need space, prune excess peer public keys (keep last 5)
    if (keysToRemove.length < targetKeysToFree && peerKeyKeys.length > 5) {
      keysToRemove.push(...peerKeyKeys.slice(0, peerKeyKeys.length - 5));
    }

    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
        freedCount++;
      } catch {}
    }

    // Prune recent emojis to 12 if present
    try {
      const recent = localStorage.getItem('hala_recent_emojis');
      if (recent) {
        const parsed = JSON.parse(recent);
        if (Array.isArray(parsed) && parsed.length > 12) {
          localStorage.setItem('hala_recent_emojis', JSON.stringify(parsed.slice(0, 12)));
        }
      }
    } catch {}
  } catch (e) {
    console.warn('[safeStorage] Cleanup encountered notice:', e);
  }

  return freedCount;
}

/**
 * Safely sets an item in Local Storage with quota protection, payload size guards, and disposable fallback cleanup.
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  const storage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : (typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null);
  if (!storage) return false;

  // Prevent large media/base64 payloads (> 64KB) from polluting Local Storage
  if (value.length > 65536 && (value.includes('data:image/') || value.includes('data:audio/') || value.includes('data:video/'))) {
    console.warn(`[safeStorage] Rejected writing large media payload to localStorage for key: "${key}" (${value.length} bytes)`);
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch (err) {
    if (isStorageQuotaError(err)) {
      console.warn(`[safeStorage] LocalStorage quota exceeded writing "${key}". Cleaning disposable cache...`);
      cleanupDisposableStorage(30);
      try {
        storage.setItem(key, value);
        return true;
      } catch (retryErr) {
        console.error(`[safeStorage] Write failed after quota cleanup for key: "${key}"`, retryErr);
        return false;
      }
    }
    console.warn(`[safeStorage] Failed to set localStorage key "${key}":`, err);
    return false;
  }
}
