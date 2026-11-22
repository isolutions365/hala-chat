import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Wifi, Zap, Gauge, Check, Activity, Sparkles, Smartphone } from 'lucide-react';
import { Language } from '../types';
import { BandwidthState, ResolutionPreference } from '../lib/bandwidthEstimator';

interface AdaptiveBandwidthModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  bandwidthState: BandwidthState;
  onSelectPreference: (pref: ResolutionPreference) => void;
}

export const AdaptiveBandwidthModal: React.FC<AdaptiveBandwidthModalProps> = ({
  isOpen,
  onClose,
  language,
  bandwidthState,
  onSelectPreference,
}) => {
  const isRtl = language === 'ar';

  if (!isOpen) return null;

  const formatSpeed = (kbps: number) => {
    if (kbps >= 1000) {
      return `${(kbps / 1000).toFixed(1)} Mbps`;
    }
    return `${Math.round(kbps)} kbps`;
  };

  const tierLabels = {
    low: {
      en: 'Low Speed (2G / Edge)',
      ar: 'سرعة منخفضة (2G / Edge)',
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
    },
    medium: {
      en: 'Medium Speed (3G)',
      ar: 'سرعة متوسطة (3G)',
      color: 'text-sky-500 bg-sky-500/10 border-sky-500/30',
    },
    high: {
      en: 'High Speed (4G / 5G / Wi-Fi)',
      ar: 'سرعة عالية (4G / 5G / Wi-Fi)',
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
    },
  };

  const options: {
    key: ResolutionPreference;
    titleEn: string;
    titleAr: string;
    descEn: string;
    descAr: string;
    badge?: string;
  }[] = [
    {
      key: 'auto',
      titleEn: 'Auto Adaptive (Recommended)',
      titleAr: 'تكيّف تلقائي (موصى به)',
      descEn: 'Switches automatically between low and high resolution based on real-time network throughput.',
      descAr: 'يبدل تلقائياً بين الجودة المنخفضة والعالية حسب سرعة الشبكة الحالية.',
      badge: isRtl ? 'ذكي' : 'Smart',
    },
    {
      key: 'low',
      titleEn: 'Data Saver (Low-Res)',
      titleAr: 'توفير البيانات (دقة منخفضة)',
      descEn: 'Always requests lightweight downscaled media via the proxy to save mobile bandwidth (saves ~80% data).',
      descAr: 'يطلب دائماً وسائط مضغوطة عبر البروكسي لتوفير باقة الإنترنت بنسبة تصل إلى 80%.',
    },
    {
      key: 'high',
      titleEn: 'High Quality (HD)',
      titleAr: 'جودة عالية (HD)',
      descEn: 'Always loads full-resolution original media assets regardless of network conditions.',
      descAr: 'تحميل الوسائط بدقتها الكاملة والأصلية دائماً بغض النظر عن حالة الشبكة.',
    },
  ];

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#087F75]/10 text-[#087F75] flex items-center justify-center">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-base">
                  {isRtl ? 'جودة الوسائط والشبكة التكيّفية' : 'Adaptive Media & Bandwidth'}
                </h3>
                <p className="text-xs text-slate-400">
                  {isRtl ? 'التحكم في استهلاك البيانات وجودة العرض' : 'Network throughput & media quality controls'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Network Live Diagnostics Banner */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Activity className="w-3.5 h-3.5 text-[#087F75] animate-pulse" />
                <span>{isRtl ? 'سرعة التنزيل المقاسة:' : 'Estimated Bandwidth:'}</span>
                <span className="font-mono text-sm font-bold text-[#087F75]">
                  {formatSpeed(bandwidthState.estimatedKbps)}
                </span>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${tierLabels[bandwidthState.tier].color}`}>
                {isRtl ? tierLabels[bandwidthState.tier].ar : tierLabels[bandwidthState.tier].en}
              </span>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-slate-400">
              <div className="flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                <span>{bandwidthState.effectiveType.toUpperCase()}</span>
              </div>
              <div>•</div>
              <div>RTT: {bandwidthState.rttMs}ms</div>
              {bandwidthState.isDataSaver && (
                <>
                  <div>•</div>
                  <div className="flex items-center gap-1 text-amber-500 font-medium">
                    <Smartphone className="w-3 h-3" />
                    <span>{isRtl ? 'توفير بيانات الهاتف مفعّل' : 'OS Data Saver Active'}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Options Selection */}
          <div className="p-4 space-y-2.5">
            {options.map((opt) => {
              const isSelected = bandwidthState.preference === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onSelectPreference(opt.key);
                  }}
                  className={`w-full p-3.5 rounded-2xl border text-start transition-all cursor-pointer flex items-start gap-3 ${
                    isSelected
                      ? 'border-[#087F75] bg-[#087F75]/5 dark:bg-[#087F75]/10 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center shrink-0 transition-all ${
                      isSelected
                        ? 'border-[#087F75] bg-[#087F75] text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800 dark:text-white">
                        {isRtl ? opt.titleAr : opt.titleEn}
                      </span>
                      {opt.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-[#087F75]/15 text-[#087F75]">
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {isRtl ? opt.descAr : opt.descEn}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer Action */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#087F75] hover:bg-[#06685f] text-white font-bold text-sm transition-all"
            >
              {isRtl ? 'تم' : 'Done'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
