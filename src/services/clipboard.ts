/**
 * Pluggable Clipboard Service
 * Abstracts navigator.clipboard with fallback support.
 */

export interface ClipboardAdapter {
  writeText(text: string): Promise<boolean>;
}

export const webClipboardAdapter: ClipboardAdapter = {
  async writeText(text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    // Fallback textarea method for older webviews or restrictive permissions
    if (typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const success = document.execCommand('copy');
        textarea.remove();
        return success;
      } catch {}
    }
    return false;
  },
};

let activeClipboardAdapter: ClipboardAdapter = webClipboardAdapter;

export function setClipboardAdapter(adapter: ClipboardAdapter): void {
  activeClipboardAdapter = adapter;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  return await activeClipboardAdapter.writeText(text);
}
