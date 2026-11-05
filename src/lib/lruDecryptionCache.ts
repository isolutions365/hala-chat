export class DecryptionCacheService {
  private capacity: number;
  private cache: Map<string, string>;
  private storageKey = 'hala_whatsapp_speed_cache_v1';

  constructor(capacity = 50) {
    this.capacity = Math.max(1, capacity);
    this.cache = new Map();
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed) as [string, string][]) {
          this.cache.set(k, v);
        }
      }
    } catch {}
  }

  private saveToStorage() {
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of this.cache.entries()) {
        obj[k] = v;
      }
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch {}
  }

  public get(messageId: string): string | null {
    if (!this.cache.has(messageId)) return null;
    const value = this.cache.get(messageId)!;
    this.cache.delete(messageId);
    this.cache.set(messageId, value);
    return value;
  }

  public set(messageId: string, text: string): void {
    if (this.cache.has(messageId)) {
      this.cache.delete(messageId);
    } else if (this.cache.size >= this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(messageId, text);
    this.saveToStorage();
  }

  public size(): number {
    return this.cache.size;
  }

  public clear(): void {
    this.cache.clear();
    try {
      localStorage.removeItem(this.storageKey);
    } catch {}
  }
}

export const decryptionCacheService = new DecryptionCacheService(50);
