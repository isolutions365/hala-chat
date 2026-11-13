/**
 * Pluggable Share Service
 * Abstracts navigator.share and social share methods behind a clean adapter interface.
 */

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

export interface ShareAdapter {
  isSupported(): boolean;
  share(payload: SharePayload): Promise<boolean>;
}

export const webShareAdapter: ShareAdapter = {
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  },
  async share(payload: SharePayload): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      await navigator.share(payload);
      return true;
    } catch (err: any) {
      if (err?.name === 'AbortError') return false;
      console.warn('[ShareService] Share warning:', err);
      return false;
    }
  },
};

let activeShareAdapter: ShareAdapter = webShareAdapter;

export function setShareAdapter(adapter: ShareAdapter): void {
  activeShareAdapter = adapter;
}

export function isShareSupported(): boolean {
  return activeShareAdapter.isSupported();
}

export async function shareAppContent(payload: SharePayload): Promise<boolean> {
  return await activeShareAdapter.share(payload);
}
