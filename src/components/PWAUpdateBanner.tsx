import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Language } from '../types';
import {
  applyPwaUpdate,
  subscribeToPwaOfflineReady,
  subscribeToPwaUpdate,
} from '../lib/pwaUpdate';

interface PWAUpdateBannerProps {
  language: Language;
}

export const PWAUpdateBanner: React.FC<PWAUpdateBannerProps> = ({ language }) => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const unsubUpdate = subscribeToPwaUpdate(setNeedRefresh);
    const unsubOfflineReady = subscribeToPwaOfflineReady((ready) => {
      if (ready) {
        setOfflineReady(true);
      }
    });
    return () => {
      unsubUpdate();
      unsubOfflineReady();
    };
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(() => setOfflineReady(false), 4000);
    return () => window.clearTimeout(timer);
  }, [offlineReady]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let reconnectTimer: number | null = null;

    const handleOffline = () => {
      wasOfflineRef.current = true;
      setIsOnline(false);
      setJustReconnected(false);
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setJustReconnected(true);
        reconnectTimer = window.setTimeout(() => {
          setJustReconnected(false);
          reconnectTimer = null;
        }, 2500);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, []);

  const isRtl = language === 'ar';

  const handleUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    setErrorMsg(null);
    try {
      await applyPwaUpdate();
    } catch {
      setIsUpdating(false);
      setErrorMsg(isRtl ? 'فشل التحديث، يرجى إعادة المحاولة' : 'Update failed, please try again');
    }
  };

  if (!needRefresh && isOnline && !justReconnected && !offlineReady) {
    return null;
  }

  return (
    <div className="w-full shrink-0 z-50 flex flex-col">
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="w-full px-3.5 py-1.5 bg-slate-900 dark:bg-slate-950 text-amber-200 text-[11px] font-medium flex items-center justify-center gap-2 border-b border-amber-400/20"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span>
            {isRtl
              ? 'أنت غير متصل — يتم عرض الواجهة والبيانات المحفوظة مؤقتاً'
              : 'Offline mode — showing cached UI & recent data'}
          </span>
        </div>
      )}

      {isOnline && justReconnected && (
        <div
          role="status"
          aria-live="polite"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="w-full px-3.5 py-1.5 bg-emerald-700 text-white text-[11px] font-semibold flex items-center justify-center gap-2 border-b border-emerald-400/20"
        >
          <Wifi className="w-3.5 h-3.5 shrink-0" />
          <span>{isRtl ? 'تمت استعادة الاتصال بالإنترنت' : 'Back online'}</span>
        </div>
      )}

      {isOnline && !justReconnected && !needRefresh && offlineReady && (
        <div
          role="status"
          aria-live="polite"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="w-full px-3.5 py-1.5 bg-[#0A2E2B] text-teal-100 text-[11px] font-medium flex items-center justify-center gap-2 border-b border-teal-500/20"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-teal-400" />
          <span>
            {isRtl ? 'التطبيق جاهز للعمل بدون إنترنت' : 'App cached and ready for offline use'}
          </span>
        </div>
      )}

      {needRefresh && (
        <button
          type="button"
          onClick={handleUpdate}
          disabled={isUpdating}
          dir={isRtl ? 'rtl' : 'ltr'}
          className="w-full px-3.5 py-2 bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-semibold flex items-center justify-center gap-2 border-b border-teal-400/20 shadow-xs transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isUpdating ? 'animate-spin' : ''}`} />
          <span>
            {errorMsg
              ? errorMsg
              : isUpdating
                ? (isRtl ? 'جاري التحديث...' : 'Updating...')
                : (isRtl ? 'يتوفر إصدار جديد، اضغط للتحديث' : 'New version available, tap to update')}
          </span>
        </button>
      )}
    </div>
  );
};

