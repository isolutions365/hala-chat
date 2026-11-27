/**
 * Pluggable File Picker Service
 * Abstracts file selection behind an adapter interface for easy swapping
 * with Capacitor File Picker / Camera plugins or Electron dialogs.
 */

export interface FilePickerOptions {
  accept?: string;
  multiple?: boolean;
  capture?: 'user' | 'environment';
}

export interface FilePickerAdapter {
  pickFiles(options?: FilePickerOptions): Promise<File[]>;
}

export const webFilePickerAdapter: FilePickerAdapter = {
  pickFiles(options?: FilePickerOptions): Promise<File[]> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve([]);
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      if (options?.accept) input.accept = options.accept;
      if (options?.multiple) input.multiple = true;
      if (options?.capture) input.setAttribute('capture', options.capture);
      input.style.display = 'none';

      const handleChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const files = target.files ? Array.from(target.files) : [];
        cleanup();
        resolve(files);
      };

      const handleCancel = () => {
        // Fallback timeout or focus return
        setTimeout(() => {
          cleanup();
          resolve([]);
        }, 300);
      };

      const cleanup = () => {
        input.removeEventListener('change', handleChange);
        window.removeEventListener('focus', handleCancel);
        input.remove();
      };

      input.addEventListener('change', handleChange);
      window.addEventListener('focus', handleCancel, { once: true });

      document.body.appendChild(input);
      input.click();
    });
  },
};

let activeFilePickerAdapter: FilePickerAdapter = webFilePickerAdapter;

export function setFilePickerAdapter(adapter: FilePickerAdapter): void {
  activeFilePickerAdapter = adapter;
}

export async function pickAppFiles(options?: FilePickerOptions): Promise<File[]> {
  return await activeFilePickerAdapter.pickFiles(options);
}
