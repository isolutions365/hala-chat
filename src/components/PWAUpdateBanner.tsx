import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Language } from '../types';
import { applyPwaUpdate, subscribeToPwaUpdate } from '../lib/pwaUpdate';

interface PWAUpdateBannerProps {
  language: Language;
}

export const PWAUpdateBanner: React.FC<PWAUpdateBannerProps> = ({ language }) => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToPwaUpdate(setNeedRefresh);
  }, []);

  if (!needRefresh) return null;

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

  return (
    <button
      type="button"
      onClick={handleUpdate}
      disabled={isUpdating}
      dir={isRtl ? 'rtl' : 'ltr'}
      className="w-full px-3.5 py-2 bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-semibold flex items-center justify-center gap-2 border-b border-teal-400/20 shadow-xs transition-colors cursor-pointer shrink-0 z-50"
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
  );
};
