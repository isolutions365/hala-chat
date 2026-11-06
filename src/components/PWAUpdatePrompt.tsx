import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * Keeps service-worker updates under user control so an active chat or call
 * is not interrupted by an automatic page reload.
 */
export function PWAUpdatePrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showPrompt = () => setVisible(true);
    window.addEventListener('hala:pwa-update-available', showPrompt);
    return () => window.removeEventListener('hala:pwa-update-available', showPrompt);
  }, []);

  if (!visible) return null;

  const applyUpdate = () => {
    setVisible(false);
    window.dispatchEvent(new Event('hala:pwa-apply-update'));
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-teal-200 bg-white p-3 text-slate-900 shadow-xl sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[min(92vw,32rem)]"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">تحديث جديد متاح · New update available</p>
        <p className="mt-0.5 text-xs text-slate-600">
          Update when convenient. Your current chat will not be interrupted until you choose to reload.
        </p>
      </div>
      <button
        type="button"
        onClick={applyUpdate}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#087F75] px-3 py-2 text-xs font-bold text-white hover:bg-[#06685e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        <RefreshCw className="h-4 w-4" />
        Update now
      </button>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss update notice"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
