/**
 * IndexedDB-backed Media Vault for Hala Chat
 * Provides persistent offline caching of decrypted audio, images, and videos
 * across logout/login sessions, chat switches, and page refreshes.
 */

const DB_NAME = 'hala_media_vault_v3';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';

export interface StoredMediaItem {
  key: string;
  blob: Blob;
  mimeType: string;
  size: number;
  timestamp: number;
}

// In-memory hot cache for active blob: URLs owned by mediaCacheService for the session
const inMemoryBlobUrlCache = new Map<string, string>();
const ownedBlobUrls = new Set<string>();
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }

  return dbPromise;
}

export const mediaCacheService = {
  /**
   * Returns true if this blob URL is owned by the session-level mediaCacheService
   * and must NOT be revoked by component unmount hooks.
   */
  isOwnedUrl(url?: string | null): boolean {
    if (!url) return false;
    return ownedBlobUrls.has(url);
  },

  /**
   * Synchronous check against active session memory cache
   */
  getSync(key?: string | null): string | null {
    if (!key) return null;
    return inMemoryBlobUrlCache.get(key) || null;
  },

  /**
   * Register a local blob URL in memory cache for immediate access
   */
  registerSync(key: string, blobUrl: string): void {
    if (key && blobUrl) {
      inMemoryBlobUrlCache.set(key, blobUrl);
      if (blobUrl.startsWith('blob:')) {
        ownedBlobUrls.add(blobUrl);
      }
    }
  },

  /**
   * Asynchronously retrieve decrypted media blob from IndexedDB by any matching identifier
   * (message ID, encryption IV, or storage URL)
   */
  async getMediaBlob(
    messageId?: string | null,
    mediaIv?: string | null,
    contentUrl?: string | null
  ): Promise<Blob | null> {
    const keysToCheck = [messageId, mediaIv, contentUrl].filter(Boolean) as string[];
    if (keysToCheck.length === 0) return null;

    try {
      const db = await getDB();
      for (const key of keysToCheck) {
        const item = await new Promise<StoredMediaItem | null>((resolve) => {
          try {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });

        if (item && item.blob && item.blob.size > 0) {
          return item.blob;
        }
      }
    } catch (err) {
      console.warn('[MediaCache] IndexedDB read notice:', err);
    }

    return null;
  },

  /**
   * Retrieve or create a session-persistent Blob URL from IndexedDB
   */
  async getMediaBlobUrl(
    messageId?: string | null,
    mediaIv?: string | null,
    contentUrl?: string | null
  ): Promise<string | null> {
    const keysToCheck = [messageId, mediaIv, contentUrl].filter(Boolean) as string[];
    if (keysToCheck.length === 0) return null;

    // 1. Check in-memory URL cache first
    for (const key of keysToCheck) {
      const memUrl = inMemoryBlobUrlCache.get(key);
      if (memUrl) return memUrl;
    }

    // 2. Query IndexedDB
    const blob = await this.getMediaBlob(messageId, mediaIv, contentUrl);
    if (!blob) return null;

    try {
      const blobUrl = URL.createObjectURL(blob);
      ownedBlobUrls.add(blobUrl);
      for (const key of keysToCheck) {
        inMemoryBlobUrlCache.set(key, blobUrl);
      }
      return blobUrl;
    } catch {
      return null;
    }
  },

  /**
   * Save a decrypted media Blob to IndexedDB under multiple keys (message ID, IV, content URL).
   * Always binds a fresh or explicitly supplied live blobUrl so stale/revoked URLs are never reused.
   */
  async saveMediaBlob(
    keys: (string | undefined | null)[],
    blob: Blob,
    mimeType = 'audio/webm',
    preferredBlobUrl?: string
  ): Promise<string> {
    const validKeys = keys.filter(Boolean) as string[];
    if (validKeys.length === 0 || !blob || blob.size === 0) return '';

    const blobUrl = preferredBlobUrl || URL.createObjectURL(blob);
    if (blobUrl.startsWith('blob:')) {
      ownedBlobUrls.add(blobUrl);
    }

    for (const k of validKeys) {
      inMemoryBlobUrlCache.set(k, blobUrl);
    }

    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const timestamp = Date.now();

      for (const key of validKeys) {
        const item: StoredMediaItem = {
          key,
          blob,
          mimeType: blob.type || mimeType,
          size: blob.size,
          timestamp,
        };
        store.put(item);
      }
    } catch (err) {
      console.warn('[MediaCache] IndexedDB save notice:', err);
    }

    return blobUrl;
  },

  /**
   * Invalidate specific keys from both in-memory URL cache and IndexedDB (used on manual Retry)
   */
  async invalidateKeys(keys: (string | undefined | null)[]): Promise<void> {
    const validKeys = keys.filter(Boolean) as string[];
    if (validKeys.length === 0) return;

    const removedUrls = new Set<string>();
    for (const key of validKeys) {
      const url = inMemoryBlobUrlCache.get(key);
      if (url) {
        removedUrls.add(url);
        inMemoryBlobUrlCache.delete(key);
      }
    }

    // Revoke any URL that is no longer referenced by any remaining key
    const stillReferenced = new Set(inMemoryBlobUrlCache.values());
    removedUrls.forEach((url) => {
      if (!stillReferenced.has(url)) {
        ownedBlobUrls.delete(url);
        if (url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }
      }
    });

    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const key of validKeys) {
        store.delete(key);
      }
    } catch (err) {
      console.warn('[MediaCache] IndexedDB invalidate notice:', err);
    }
  },

  /**
   * Clear all stored blobs from IndexedDB and memory
   */
  async clearAll(): Promise<void> {
    ownedBlobUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    ownedBlobUrls.clear();
    inMemoryBlobUrlCache.clear();

    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    } catch {}
  },
};
