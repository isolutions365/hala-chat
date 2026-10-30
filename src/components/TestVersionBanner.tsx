import React from 'react';
import { Beaker, MessageSquareHeart } from 'lucide-react';
import { Language } from '../types';

interface TestVersionBannerProps {
  language: Language;
  variant?: 'banner' | 'pill' | 'card';
  className?: string;
  onOpenFeedback?: () => void;
}

export const TestVersionBanner: React.FC<TestVersionBannerProps> = ({
  language,
  variant = 'banner',
  className = '',
  onOpenFeedback,
}) => {
  const isRtl = language === 'ar';

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={onOpenFeedback}
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-700 text-[11px] font-bold shadow-2xs transition-all cursor-pointer ${className}`}
        title={isRtl ? 'نسخة تجريبية للاختبار - اضغط لإرسال ملاحظاتك' : 'Test version - tap to give feedback'}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
        <Beaker className="w-3 h-3 text-amber-600 shrink-0" />
        <span>{isRtl ? 'نسخة تجريبية' : 'Test Version'}</span>
        {onOpenFeedback && (
          <span className="text-[10px] text-amber-800 underline ml-0.5 font-medium">
            {isRtl ? 'ملاحظاتك' : 'Feedback'}
          </span>
        )}
      </button>
    );
  }

  if (variant === 'card') {
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 text-amber-900 text-xs space-y-2 shadow-2xs ${className}`}
      >
        <div className="flex items-center justify-between font-bold text-amber-800 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Beaker className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm">{isRtl ? 'نسخة تجريبية (Test Version v1.0)' : 'Test Version (Evaluation Build v1.0)'}</span>
          </div>
          <span className="bg-amber-200/70 text-amber-900 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md">
            BETA
          </span>
        </div>
        <p className="text-[11px] text-amber-700 leading-relaxed">
          {isRtl
            ? 'هذا التطبيق في مرحلة الاختبار والتجربة (Testing Build). نقدّر بشدة مشاركتك لأي اقتراحات أو مشاكل تواجهها أثناء التجربة.'
            : 'This app is in testing mode. We highly appreciate any feedback, suggestions, or bug reports during your testing.'}
        </p>
        {onOpenFeedback && (
          <button
            type="button"
            onClick={onOpenFeedback}
            className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
          >
            <MessageSquareHeart className="w-3.5 h-3.5" />
            <span>{isRtl ? 'إرسال ملاحظاتك وتقييمك (Send Feedback)' : 'Submit Testing Feedback'}</span>
          </button>
        )}
      </div>
    );
  }

  // Default: banner (top notice)
  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`w-full bg-gradient-to-r from-amber-500/90 via-amber-600 to-orange-500 text-white px-3 py-1.5 text-[11px] font-bold flex items-center justify-between gap-2 shadow-sm z-30 shrink-0 ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0 truncate">
        <Beaker className="w-3.5 h-3.5 shrink-0 text-amber-100" />
        <span className="truncate">
          {isRtl
            ? '⚠️ نسخة تجريبية للاختبار • Testing Evaluation Build'
            : '⚠️ Test Version for Evaluation & Feedback'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {onOpenFeedback && (
          <button
            type="button"
            onClick={onOpenFeedback}
            className="px-2 py-0.5 bg-white text-amber-800 hover:bg-amber-50 rounded-md text-[10px] font-extrabold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
          >
            <MessageSquareHeart className="w-3 h-3 text-amber-600" />
            <span>{isRtl ? 'أرسل ملاحظتك' : 'Feedback'}</span>
          </button>
        )}
        <span className="bg-white/20 backdrop-blur-xs px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider text-amber-50">
          BETA
        </span>
      </div>
    </div>
  );
};
