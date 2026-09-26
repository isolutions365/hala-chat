import React from 'react';
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-800"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#D85A30]/10 text-[#D85A30] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {isRtl ? 'الشروط وسياسة الخصوصية' : 'Terms & Privacy Policy'}
                  </h3>
                  <p className="text-xs text-slate-400">Hala Chat Platform</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-sm leading-relaxed text-slate-600">
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#D85A30]" />
                  {isRtl ? '١. شروط الاستخدام' : '1. Terms of Service'}
                </h4>
                <p className="text-xs text-slate-500">
                  {isRtl
                    ? 'باستخدام تطبيق هلا، فإنك توافق على الالتزام بالقوانين واللوائح في منطقة الشرق الأوسط وتسهيل التواصل الآمن والاحترام بين كافة المستخدمين.'
                    : 'By using Hala, you agree to comply with regional regulations across the Middle East and maintain respectful, secure communication with all users.'}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#D85A30]" />
                  {isRtl ? '٢. الخصوصية وحماية البيانات' : '2. Privacy & Security'}
                </h4>
                <p className="text-xs text-slate-500">
                  {isRtl
                    ? 'بياناتك ورقم هاتفك محميان ومشفران بالكامل. نحن لا نشارك رقم جوالك مع أطراف خارجية بدون موافقتك الصريحة.'
                    : 'Your personal data and phone number are strictly protected. We never share your contact information with unauthorized third parties.'}
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-900 text-sm">
                  {isRtl ? '٣. مصادقة رقم الجوال' : '3. Phone Verification'}
                </h4>
                <p className="text-xs text-slate-500">
                  {isRtl
                    ? 'يتم استخدام رقم الهاتف المحمول حصرياً لأغراض التحقق والأمان عبر رمز OTP من خلال Firebase Auth.'
                    : 'Phone numbers are used strictly for authentication purposes via SMS OTP using Firebase Auth.'}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full h-11 bg-[#D85A30] text-white font-semibold text-sm rounded-xl hover:bg-[#c44e27] transition-colors cursor-pointer flex items-center justify-center"
              >
                {isRtl ? 'حسناً، أوافق' : 'I Understand'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
