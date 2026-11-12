type MediaCacheRecord = {
  key: string;
  bytes: ArrayBuffer;
  size: number;
  lastAccessedAt: number;
};

const DB_NAME = 'HalaEncryptedMediaCache';
const DB_VERSION = 1;
const STORE_NAME = 'media';
const MAX_CACHE_BYTES = 80 * 1024 * 1024;
const MAX_CACHE_ITEMS = 80;
const MAX_SINGLE_ITEM_BYTES = 25 * 1024 * 1024;

function openMediaCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open media cache'));
    request.onblocked = () => reject(new Error('Media cache database is blocked'));
  });
}

/**
 * Derive a stable, non-reversible cache key from the message identity and its
 * current storage reference. The cache stores encrypted bytes only.
 */
export async function createEncryptedMediaCacheKey(identity: string): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(identity)
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

export async function getEncryptedMediaBytes(key: string): Promise<ArrayBuffer | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openMediaCacheDb();
    return await new Promise((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      let bytes: ArrayBuffer | null = null;

      request.onsuccess = () => {
        const record = request.result as MediaCacheRecord | undefined;
        if (record?.bytes instanceof ArrayBuffer) {
          bytes = record.bytes;
          store.put({ ...record, lastAccessedAt: Date.now() });
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(bytes);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Media cache read aborted'));
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function putEncryptedMediaBytes(key: string, bytes: ArrayBuffer): Promise<void> {
  if (!key || !(bytes instanceof ArrayBuffer) || bytes.byteLength < 16 || bytes.byteLength > MAX_SINGLE_ITEM_BYTES) {
    return;
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openMediaCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        key,
        bytes: bytes.slice(0),
        size: bytes.byteLength,
        lastAccessedAt: Date.now(),
      } satisfies MediaCacheRecord);

      const entries: Array<{ key: string; size: number; lastAccessedAt: number }> = [];
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const value = cursor.value as MediaCacheRecord;
          entries.push({
            key: value.key,
            size: Number(value.size) || value.bytes?.byteLength || 0,
            lastAccessedAt: Number(value.lastAccessedAt) || 0,
          });
          cursor.continue();
          return;
        }

        let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
        let itemCount = entries.length;
        entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
        for (const entry of entries) {
          if (totalBytes <= MAX_CACHE_BYTES && itemCount <= MAX_CACHE_ITEMS) break;
          if (entry.key === key && entries.length === 1) continue;
          store.delete(entry.key);
          totalBytes -= entry.size;
          itemCount -= 1;
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Media cache write aborted'));
    });
  } catch {
    // Persistent caching is an optimization only. Storage/quota failures must
    // never prevent a message attachment from loading normally.
  } finally {
    db?.close();
  }
}
