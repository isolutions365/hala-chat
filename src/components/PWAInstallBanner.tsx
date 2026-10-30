import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X, Share, Smartphone, PlusSquare, Sparkles } from 'lucide-react';
import { Language } from '../types';

interface PWAInstallBannerProps {
  language: Language;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({ language }) => {
  const isRtl = language === 'ar';
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('hala_pwa_banner_dismissed') === 'true';
  });

  if (isInstalled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('hala_pwa_banner_dismissed', 'true');
  };

  // Render for Chromium / Android / Desktop
  if (isInstallable) {
    return (
      <div
        className="mx-4 my-2 p-3.5 rounded-2xl bg-gradient-to-r from-teal-800 via-[#087F75] to-teal-700 text-white shadow-md border border-teal-600/50 flex items-center justify-between gap-3 relative overflow-hidden"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 font-bold text-white shadow-xs">
            <Download className="w-5 h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-extrabold truncate">
              {isRtl ? 'ثبّت تطبيق هالة شات' : 'Install Hala Chat App'}
            </h4>
            <p className="text-[11px] text-white/80 truncate">
              {isRtl ? 'سرعة فائقة وإشعارات مباشرة بدون متصفح' : 'Fast access and direct web notifications'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={install}
            className="px-3 py-1.5 rounded-xl bg-white text-[#087F75] hover:bg-teal-50 text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            {isRtl ? 'تثبيت' : 'Install'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Render for iOS Safari
  if (isIOS) {
    return (
      <>
        <div
          className="mx-4 my-2 p-3.5 rounded-2xl bg-gradient-to-r from-teal-800 via-[#087F75] to-teal-700 text-white shadow-md border border-teal-600/50 flex items-center justify-between gap-3 relative overflow-hidden"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 font-bold text-white shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-extrabold truncate">
                {isRtl ? 'إضافة إلى الشاشة الرئيسية' : 'Add to Home Screen'}
              </h4>
              <p className="text-[11px] text-white/80 truncate">
                {isRtl ? 'استخدم هالة شات كتطبيق آيفون أساسي' : 'Use Hala Chat like a native iOS app'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowIOSGuide(true)}
              className="px-3 py-1.5 rounded-xl bg-white text-[#087F75] hover:bg-teal-50 text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              {isRtl ? 'التعليمات' : 'How-to'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* iOS Guide Modal */}
        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            dir={isRtl ? 'rtl' : 'ltr'}
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-[#087F75] flex items-center justify-center mb-4 font-bold">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                {isRtl ? 'تثبيت هالة شات على آيفون / آيباد' : 'Install on iPhone / iPad'}
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                1. {isRtl ? 'اضغط على زر' : 'Tap the'} <strong>{isRtl ? 'مشاركة' : 'Share'}</strong> <Share className="w-3.5 h-3.5 inline mx-1 text-teal-600" /> {isRtl ? 'في شريط متصفح سفاري السفلي.' : 'button in Safari toolbar.'}<br />
                2. {isRtl ? 'قم بالسحب لأسفل واختر' : 'Scroll down and tap'} <strong>{isRtl ? 'إضافة إلى الشاشة الرئيسية' : 'Add to Home Screen'}</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-teal-600" />.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-2xl bg-[#087F75] py-2.5 text-xs font-bold text-white hover:bg-[#06685F] transition-all cursor-pointer shadow-xs"
              >
                {isRtl ? 'فهمت ذلك' : 'Got it'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
