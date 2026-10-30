import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, FileText } from 'lucide-react';
import { Language } from '../types';

interface TermsPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

export const TermsPrivacyModal: React.FC<TermsPrivacyModalProps> = ({
  isOpen,
  onClose,
  language,
}) => {
  const isRtl = language === 'ar';
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-800"
            dir={isRtl ? 'rtl' : 'ltr'}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hala-terms-title"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#087F75]/10 text-[#087F75] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="hala-terms-title" className="font-bold text-slate-900 text-base">
                    {isRtl ? 'الشروط وسياسة الخصوصية' : 'Terms & Privacy Policy'}
                  </h3>
                  <p className="text-xs text-slate-400">Hala Chat Platform</p>
                </div>
              </div>
                <button
                  ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label={isRtl ? 'إغلاق الشروط والخصوصية' : 'Close terms and privacy'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-sm leading-relaxed text-slate-600">
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#087F75]" />
                  {isRtl ? '١. شروط الاستخدام' : '1. Terms of Service'}
                </h4>
                <p className="text-xs text-slate-500">
                  {isRtl
                    ? 'باستخدام هلا، توافق على استخدام المنصة باحترام وعدم نشر محتوى ضار أو غير قانوني. ستتوفر سياسة كاملة ومعلومات التواصل قبل الإطلاق العام.'
                    : 'By using Hala, you agree to use the platform respectfully and not post harmful or unlawful content. A full policy and contact details will be provided before public launch.'}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#087F75]" />
                  {isRtl ? '٢. الخصوصية وحماية البيانات' : '2. Privacy & Security'}
                </h4>
                <p className="text-xs text-slate-500">
                  {isRtl
                    ? 'نستخدم خدمات آمنة لتسجيل الدخول وتخزين البيانات. ملف حسابك الخاص منفصل عن الاسم والصورة المعروضين للأعضاء.'
                    : 'We use secure services for sign-in and data storage. Your private account record is separate from the name and photo shown to members.'}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 text-sm">
                  {isRtl ? '٣. مصادقة رقم الجوال' : '3. Phone Verification'}
                </h4>
                <p className="text-xs text-slate-500">
                  {isRtl
                    ? 'يُستخدم رقم الجوال للتحقق والأمان عبر رمز يصل برسالة نصية.'
                    : 'Your phone number is used for verification and security through an SMS code.'}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full h-11 bg-[#087F75] text-white font-semibold text-sm rounded-xl hover:bg-[#06685F] transition-colors cursor-pointer flex items-center justify-center"
              >
                {isRtl ? 'حسناً' : 'I Understand'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
