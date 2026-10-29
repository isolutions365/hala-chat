import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X, Smartphone, CheckCircle, Monitor } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';
import { Language } from '../types';

interface PWAInstallButtonProps {
  language: Language;
  variant?: 'header' | 'banner' | 'settings';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  language,
  variant = 'header',
  className = '',
}) => {
  const { canInstall, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  const isRtl = language === 'ar';

  if (isInstalled && variant !== 'settings') {
    return null;
  }

  if (isDismissed && variant === 'banner') {
    return null;
  }

  // If already installed and viewing in settings
  if (isInstalled && variant === 'settings') {
    return (
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-teal-50 border border-teal-100 text-[#087F75] text-xs font-semibold">
        <CheckCircle className="w-4 h-4 text-[#087F75] shrink-0" />
        <span>{isRtl ? 'التطبيق مثبت كـ PWA على جهازك' : 'Hala is installed as a PWA on your device'}</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowGuideModal(true);
      return;
    }

    const outcome = await install();
    if (outcome === 'accepted') {
      setJustInstalled(true);
    } else if (outcome === 'unavailable') {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {/* Header variant (compact button) */}
      {variant === 'header' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-400/30 transition-all cursor-pointer shadow-xs ${className}`}
          title={isRtl ? 'تثبيت التطبيق (PWA)' : 'Install Hala App (PWA)'}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isRtl ? 'تثبيت' : 'Install'}</span>
        </button>
      )}

      {/* Settings variant (full width action item) */}
      {variant === 'settings' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200/70 text-left transition-all hover:shadow-xs active:scale-[0.99] cursor-pointer ${className}`}
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#087F75] text-white flex items-center justify-center shadow-xs">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                {isRtl ? 'تثبيت هلا على الشاشة الرئيسية' : 'Install Hala to Home Screen'}
              </p>
              <p className="text-[11px] text-slate-500">
                {isRtl ? 'تجربة سريعة وتعمل بدون إنترنت (PWA)' : 'Fast offline-ready mobile experience'}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#087F75] bg-teal-100/80 px-2.5 py-1 rounded-full">
            {isRtl ? 'تثبيت' : 'Install'}
          </span>
        </button>
      )}

      {/* Floating / Banner variant */}
      {variant === 'banner' && canInstall && !justInstalled && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className={`mx-3 my-2 p-3 bg-gradient-to-r from-slate-900 via-[#072429] to-slate-900 border border-teal-500/30 text-white rounded-2xl shadow-xl flex items-center justify-between gap-3 animate-fadeIn ${className}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#087F75] flex items-center justify-center shrink-0 shadow-md">
              <Smartphone className="w-5 h-5 text-teal-100" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {isRtl ? 'تثبيت تطبيق هلا (PWA)' : 'Install Hala PWA App'}
              </p>
              <p className="text-[10px] text-teal-200/80 truncate">
                {isRtl ? 'أضف هلا إلى شاشتك الرئيسية لتجربة سريعة' : 'Add to home screen for native experience'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-3 py-1.5 rounded-xl bg-[#087F75] hover:bg-[#06685e] active:scale-95 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              {isRtl ? 'تثبيت' : 'Install'}
            </button>
            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Instructions Modal for iOS, Android, or Desktop Chrome/Edge */}
      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 text-slate-800 space-y-4 animate-slideUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-teal-50 text-[#087F75] flex items-center justify-center font-bold">
                  هلا
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isRtl ? 'كيفية تثبيت تطبيق هلا' : 'How to Install Hala App'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isIOS
                      ? (isRtl ? 'اتبع الخطوتين في Safari' : 'Follow 2 steps in Safari')
                      : (isRtl ? 'خطوات التثبيت السريعة' : 'Quick installation guide')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 py-1 text-xs">
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-[#087F75] flex items-center justify-center shrink-0">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">
                      {isRtl ? '1. اضغط على زر المشاركة' : '1. Tap the Share button'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isRtl ? 'في شريط Safari السفلي' : 'In Safari bottom navigation toolbar'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-[#087F75] flex items-center justify-center shrink-0">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">
                      {isRtl ? '2. اختر «إضافة إلى الشاشة الرئيسية»' : '2. Select "Add to Home Screen"'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isRtl ? 'ثم اضغط «إضافة» في الزاوية العلوية' : 'Then tap Add in the top right corner'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 py-1 text-xs">
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-[#087F75] flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">
                      {isRtl ? 'على هاتف أندرويد (Android / Chrome)' : 'On Android Phone (Chrome)'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isRtl ? 'اضغط على قائمة المتصفح (⁝) ثم اختر «تثبيت التطبيق» أو «الإضافة للشاشة الرئيسية»' : 'Tap browser menu (⁝) and select "Install App" or "Add to Home Screen"'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-teal-100 text-[#087F75] flex items-center justify-center shrink-0">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">
                      {isRtl ? 'على الكمبيوتر (Chrome / Edge)' : 'On Desktop (Chrome / Edge)'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isRtl ? 'اضغط على أيقونة التثبيت (⊕) المتاحة في شريط العنوان أعلى المتصفح' : 'Click the install icon (⊕) in the browser address bar'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-2xl bg-[#087F75] hover:bg-[#06685e] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              {isRtl ? 'فهمت ذلك' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
