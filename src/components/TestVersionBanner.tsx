import React from 'react';
import { Beaker, Info } from 'lucide-react';
import { Language } from '../types';

interface TestVersionBannerProps {
  language: Language;
  variant?: 'banner' | 'pill' | 'card';
  className?: string;
}

export const TestVersionBanner: React.FC<TestVersionBannerProps> = ({
  language,
  variant = 'banner',
  className = '',
}) => {
  const isRtl = language === 'ar';

  if (variant === 'pill') {
    return (
      <span
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-700 text-[11px] font-bold shadow-2xs ${className}`}
        title={isRtl ? 'نسخة تجريبية للاختبار فقط' : 'Test version for evaluation'}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
        <Beaker className="w-3 h-3 text-amber-600 shrink-0" />
        <span>{isRtl ? 'نسخة تجريبية' : 'Test Version'}</span>
      </span>
    );
  }

  if (variant === 'card') {
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 text-amber-900 text-xs space-y-1 shadow-2xs ${className}`}
      >
        <div className="flex items-center gap-2 font-bold text-amber-800 text-xs">
          <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Beaker className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm">{isRtl ? 'نسخة تجريبية (Test Version v1.0)' : 'Test Version (Evaluation Build v1.0)'}</span>
        </div>
        <p className="text-[11px] text-amber-700 leading-relaxed pt-0.5">
          {isRtl
            ? 'هذا التطبيق في مرحلة الاختبار والتجربة (Testing Build). الميزات الحالية مخصصة لتقييم تجربة المستخدم والملاحظات.'
            : 'This app is currently in a testing phase for evaluation and feedback purposes.'}
        </p>
      </div>
    );
  }

  // Default: banner (top notice)
  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`w-full bg-gradient-to-r from-amber-500/90 via-amber-600 to-orange-500 text-white px-3 py-1.5 text-[11px] font-bold flex items-center justify-center gap-2 shadow-sm z-30 shrink-0 ${className}`}
    >
      <Beaker className="w-3.5 h-3.5 shrink-0 text-amber-100" />
      <span className="truncate">
        {isRtl
          ? '⚠️ نسخة تجريبية للاختبار • Test Version (Testing Only)'
          : '⚠️ Test Version for Testing & Feedback • نسخة تجريبية'}
      </span>
      <span className="bg-white/20 backdrop-blur-xs px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider text-amber-50 shrink-0">
        BETA
      </span>
    </div>
  );
};
