import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Key, LogOut, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Language } from '../types';

interface KeyMismatchScreenProps {
  uid: string;
  language: Language;
  onRestoreWithPin: () => void;
  onLogout: () => void;
  onUseThisDeviceKey: () => Promise<void>;
}

export const KeyMismatchScreen: React.FC<KeyMismatchScreenProps> = ({
  uid,
  language,
  onRestoreWithPin,
  onLogout,
  onUseThisDeviceKey,
}) => {
  const isRtl = language === 'ar';
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmUseDeviceKey = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onUseThisDeviceKey();
    } catch (err: any) {
      console.error('[KeyMismatch] Failed to use device key:', err);
      setError(err?.message || (isRtl ? 'حدث خطأ أثناء تحديث المفتاح' : 'Failed to update key'));
      setIsLoading(false);
      setShowConfirmModal(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#071318] flex flex-col text-white select-none overflow-y-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      <main className="flex-1 flex flex-col items-center justify-center p-8 max-w-md mx-auto w-full space-y-8">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center space-y-4">
          <div className="w-20 h-20 rounded-[28px] bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-500/10">
            <ShieldAlert className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            {isRtl ? 'عدم تطابق مفتاح الأمان' : 'Security Key Mismatch'}
          </h1>
          <p className="text-sm text-teal-100/80 leading-relaxed">
            {isRtl 
              ? 'مفتاح هذا الجهاز لا يتطابق مع مفتاح حسابك. قد تواجه مشاكل في فتح الرسائل الجديدة.'
              : 'Is device ki key aap ke account ki key se match nahi karti. Naye messages khulne mein masla hoga.'}
          </p>
        </motion.div>

        <div className="w-full space-y-4">
          {/* Option A: Restore with PIN */}
          <button
            onClick={onRestoreWithPin}
            className="w-full h-16 rounded-2xl bg-[#087F75] hover:bg-[#06685F] text-white font-bold text-base flex items-center justify-center gap-3 transition-all shadow-lg shadow-[#087F75]/20 cursor-pointer"
          >
            <Key className="w-5 h-5" />
            <span>{isRtl ? 'استعادة باستخدام رمز PIN' : 'Restore with PIN'}</span>
          </button>

          {/* Option C: Use this device's key */}
          <button
            onClick={() => setShowConfirmModal(true)}
            className="w-full h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-base flex items-center justify-center gap-3 transition-all border border-amber-500/20 cursor-pointer"
          >
            <RefreshCw className="w-5 h-5" />
            <span>{isRtl ? 'استخدام مفتاح هذا الجهاز' : "Use this device's key"}</span>
          </button>

          {/* Option B: Logout */}
          <button
            onClick={onLogout}
            className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-sm flex items-center justify-center gap-2 transition-all border border-slate-800 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{isRtl ? 'تسجيل الخروج' : 'Logout'}</span>
          </button>
        </div>

        {error && (
          <div className="w-full p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-bold text-center">
            {error}
          </div>
        )}
      </main>

      {/* Confirmation Modal for "Use this device's key" */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 text-center shadow-2xl"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/30 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">
                  {isRtl ? 'تأكيد استخدام مفتاح هذا الجهاز' : 'Confirm Device Key Override'}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed font-medium">
                  {isRtl 
                    ? 'لن يتم فتح رسائل الأجهزة الأخرى. هل أنت متأكد من رغبتك في استخدام مفتاح هذا الجهاز وتحديث حسابك؟'
                    : 'Doosre devices ke messages nahi khulenge. Are you sure you want to use this device\'s key?'}
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={handleConfirmUseDeviceKey}
                  disabled={isLoading}
                  className="w-full h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
                >
                  {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : (isRtl ? 'نعم، استخدم هذا المفتاح' : 'Yes, use this key')}
                </button>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isLoading}
                  className="w-full h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="p-8 text-center text-[10px] text-slate-600 font-medium uppercase tracking-widest">
        Hala Secure Encryption • {new Date().getFullYear()}
      </footer>
    </div>
  );
};
