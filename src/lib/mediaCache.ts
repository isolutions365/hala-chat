import { safeLocalStorageSet } from './safeStorage';

const STORAGE_PREFIX = 'hala_media_cache_v1_';
const MAX_CACHED_ITEMS = 40;

export const mediaCacheService = {
  get(messageId: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(STORAGE_PREFIX + messageId);
    } catch {
      return null;
    }
  },
  set(messageId: string, dataUrl: string): void {
    if (typeof window === 'undefined') return;
    try {
      safeLocalStorageSet(STORAGE_PREFIX + messageId, dataUrl);
    } catch {
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
        if (keys.length > MAX_CACHED_ITEMS) {
          localStorage.removeItem(keys[0]);
          safeLocalStorageSet(STORAGE_PREFIX + messageId, dataUrl);
        }
      } catch {}
    }
  }
};

export function arrayBufferToBase64(buffer: ArrayBuffer, mimeType: string): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${window.btoa(binary)}`;
}
