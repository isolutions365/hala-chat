import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Key, AlertCircle, RefreshCw, LogIn, Trash2, ArrowRight, Mail, CheckCircle2 } from 'lucide-react';
import { Language } from '../types';
import { 
  verifyTwoStepPin, 
  fetchEncryptedKeyBackup, 
  decryptAndRestorePrivateKey, 
  startPinReset, 
  resetPinWithCode 
} from '../lib/firebase';

interface RestoreChatsScreenProps {
  uid: string;
  language: Language;
  isRestoreOnly: boolean; // if true, we know key is missing
  isPinActive: boolean; // if true, user has PIN enabled
  onSuccess: (token?: string) => void;
  onStartFresh: () => void;
  onLogout: () => void;
}

type Step = 'pin' | 'forgot_confirm' | 'enter_code' | 'reset_pin' | 'reset_success' | 'no_pin_warning';

export const RestoreChatsScreen: React.FC<RestoreChatsScreenProps> = ({
  uid,
  language,
  isRestoreOnly,
  isPinActive,
  onSuccess,
  onStartFresh,
  onLogout,
}) => {
  const isRtl = language === 'ar';
  const [step, setStep] = useState<Step>(isPinActive ? 'pin' : 'no_pin_warning');
  const [pin, setPin] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFreshConfirm, setShowFreshConfirm] = useState(false);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin.length !== 6 || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Verify PIN and get session token
      const sessionToken = await verifyTwoStepPin(pin);

      if (isRestoreOnly) {
        // 2. Fetch and Restore backup
        const backup = await fetchEncryptedKeyBackup(sessionToken);
        const restored = await decryptAndRestorePrivateKey(uid, pin, backup);
        
        if (!restored) {
          throw new Error(isRtl ? 'فشل فك تشفير النسخة الاحتياطية. تأكد من الرمز.' : 'Failed to decrypt backup. Check your PIN.');
        }
      }

      onSuccess(sessionToken);
    } catch (err: any) {
      console.error('[Restore] Error:', err);
      setError(err.message || (isRtl ? 'حدث خطأ ما' : 'An error occurred'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await startPinReset();
      setMaskedEmail(res.email);
      setStep('enter_code');
    } catch (err: any) {
      setError(err.message || (isRtl ? 'لم يتم تعيين بريد إلكتروني للطوارئ' : 'Recovery email not set'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetCode.length !== 6) return;
    setStep('reset_pin');
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmNewPin) {
      setError(isRtl ? 'الرمز غير متطابق' : 'PINs do not match');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await resetPinWithCode(resetCode, newPin);
      setStep('reset_success');
    } catch (err: any) {
      setError(err.message || 'Error resetting PIN');
    } finally {
      setIsLoading(false);
    }
  };

  if (showFreshConfirm) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center p-6 text-white" dir={isRtl ? 'rtl' : 'ltr'}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/30 flex items-center justify-center mx-auto">
            <Trash2 className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">{isRtl ? 'البدء من جديد؟' : 'Start fresh?'}</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              {isRtl 
                ? 'تحذير: إذا بدأت من جديد، فلن تتمكن من قراءة محادثاتك القديمة المشفرة. سيتم حذف مفاتيحك القديمة وإنشاء مفاتيح جديدة.' 
                : 'Warning: If you start fresh, you won\'t be able to read your old encrypted chats. Your old keys will be replaced with new ones.'}
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-4">
            <button onClick={onStartFresh} className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 font-bold transition-all">
              {isRtl ? 'نعم، ابدأ من جديد' : 'Yes, start fresh'}
            </button>
            <button onClick={() => setShowFreshConfirm(false)} className="w-full py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all">
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#071318] flex flex-col text-white select-none overflow-y-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      <main className="flex-1 flex flex-col items-center justify-center p-8 max-w-md mx-auto w-full space-y-8">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center space-y-4">
          <div className="w-20 h-20 rounded-[28px] bg-[#087F75] shadow-xl shadow-[#087F75]/20 flex items-center justify-center mx-auto mb-6">
            {step === 'enter_code' || step === 'forgot_confirm' ? <Mail className="w-10 h-10 text-white" /> : <Shield className="w-10 h-10 text-white" />}
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            {step === 'pin' && (isRestoreOnly ? (isRtl ? 'استعادة المحادثات' : 'Restore Chats') : (isRtl ? 'التحقق بخطوتين' : 'Two-step Verification'))}
            {step === 'enter_code' && (isRtl ? 'رمز التحقق' : 'Verification Code')}
            {step === 'reset_pin' && (isRtl ? 'رمز PIN جديد' : 'New PIN')}
            {step === 'reset_success' && (isRtl ? 'تم بنجاح!' : 'Success!')}
          </h1>
          <p className="text-sm text-teal-100/70 leading-relaxed">
            {step === 'pin' && (isRtl ? 'أدخل رمز PIN المكون من 6 أرقام للوصول إلى حسابك.' : 'Enter your 6-digit PIN to access your account.')}
            {step === 'enter_code' && (isRtl ? `تم إرسال رمز إلى ${maskedEmail}` : `A code has been sent to ${maskedEmail}`)}
            {step === 'reset_pin' && (isRtl ? 'قم بتعيين رمز PIN جديد لحسابك.' : 'Set a new PIN for your account.')}
          </p>
        </motion.div>

        {step === 'pin' && (
          <form onSubmit={handleVerify} className="w-full space-y-6">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Key className="w-5 h-5 text-teal-500/50 group-focus-within:text-teal-400" />
              </div>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="w-full h-16 bg-slate-900/50 border-2 border-slate-800 rounded-2xl pl-12 pr-4 text-2xl tracking-[0.5em] font-mono text-center focus:outline-none focus:border-[#087F75] transition-all placeholder:text-slate-700"
                disabled={isLoading}
                autoFocus
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 text-rose-400 text-sm font-bold bg-rose-500/10 p-4 rounded-xl border border-rose-500/20">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={pin.length !== 6 || isLoading}
              className={`w-full h-16 rounded-2xl flex items-center justify-center gap-3 font-black text-lg transition-all ${
                pin.length === 6 && !isLoading
                  ? 'bg-[#087F75] text-white shadow-lg shadow-[#087F75]/30'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {isLoading ? <RefreshCw className="w-6 h-6 animate-spin" /> : (isRtl ? 'تحقق' : 'Verify')}
            </button>

            <div className="pt-4 flex flex-col items-center gap-4 w-full">
              <button 
                type="button"
                onClick={handleForgotPin}
                className="text-teal-400 text-xs font-bold hover:text-teal-300 transition-colors"
              >
                {isRtl ? 'نسيت رمز PIN؟' : 'Forgot PIN?'}
              </button>
              
              <button 
                type="button"
                onClick={() => setShowFreshConfirm(true)}
                className="text-slate-500 text-[11px] font-medium hover:text-slate-400 transition-colors mt-4"
              >
                {isRtl ? 'البدء من جديد (سيتم فقدان المحادثات القديمة)' : 'Start fresh (old chats will be lost)'}
              </button>
            </div>
          </form>
        )}

        {step === 'enter_code' && (
          <form onSubmit={handleVerifyCode} className="w-full space-y-6">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full h-16 bg-slate-900/50 border-2 border-slate-800 rounded-2xl text-2xl tracking-[0.5em] font-mono text-center focus:outline-none focus:border-[#087F75] transition-all"
              autoFocus
            />
            {error && <p className="text-rose-400 text-xs font-bold text-center">{error}</p>}
            <button
              type="submit"
              disabled={resetCode.length !== 6 || isLoading}
              className="w-full h-16 rounded-2xl bg-[#087F75] text-white font-black text-lg"
            >
              {isRtl ? 'متابعة' : 'Continue'}
            </button>
            <button type="button" onClick={() => setStep('pin')} className="w-full text-slate-500 text-sm font-bold">
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
          </form>
        )}

        {step === 'reset_pin' && (
          <form onSubmit={handleResetPin} className="w-full space-y-4">
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={isRtl ? 'رمز PIN جديد' : 'New PIN'}
              className="w-full h-16 bg-slate-900/50 border-2 border-slate-800 rounded-2xl text-xl text-center focus:outline-none focus:border-[#087F75]"
            />
            <input
              type="password"
              inputMode="numeric"
              value={confirmNewPin}
              onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={isRtl ? 'تأكيد الرمز' : 'Confirm PIN'}
              className="w-full h-16 bg-slate-900/50 border-2 border-slate-800 rounded-2xl text-xl text-center focus:outline-none focus:border-[#087F75]"
            />
            {error && <p className="text-rose-400 text-xs font-bold text-center">{error}</p>}
            <button
              type="submit"
              disabled={newPin.length !== 6 || newPin !== confirmNewPin || isLoading}
              className="w-full h-16 rounded-2xl bg-[#087F75] text-white font-black text-lg"
            >
              {isLoading ? <RefreshCw className="w-6 h-6 animate-spin mx-auto" /> : (isRtl ? 'تغيير' : 'Change')}
            </button>
          </form>
        )}

        {step === 'reset_success' && (
          <div className="w-full text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <p className="text-sm text-slate-300">
              {isRtl ? 'تم تغيير رمز PIN بنجاح. يمكنك الآن استعادة محادثاتك.' : 'PIN changed successfully. You can now restore your chats.'}
            </p>
            <button
              onClick={() => {
                setPin(newPin);
                setStep('pin');
              }}
              className="w-full h-16 rounded-2xl bg-white text-slate-900 font-black text-lg"
            >
              {isRtl ? 'استعادة الآن' : 'Restore Now'}
            </button>
          </div>
        )}

        {step === 'no_pin_warning' && (
          <div className="w-full space-y-8">
            <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-3xl space-y-4">
              <div className="flex items-center gap-3 text-amber-400">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <h3 className="font-bold text-lg">{isRtl ? 'تنبيه الأمان' : 'Security Alert'}</h3>
              </div>
              <p className="text-sm text-amber-100/90 leading-relaxed">
                {isRtl 
                  ? 'لا يمكن فتح محادثاتك القديمة على هذا الجهاز لأنك لم تقم بتعيين رمز PIN على جهازك القديم. إنشاء مفاتيح جديدة هنا سيؤدي إلى إغلاق المحادثات القديمة نهائياً ولن تتمكن من استعادتها أبداً.' 
                  : 'Your old chats cannot be opened on this device because you didn\'t set a PIN on your old device. Creating new keys here will permanently lock old chats and you will never be able to restore them.'}
              </p>
              <div className="pt-2">
                <p className="text-xs font-bold text-teal-400 underline decoration-teal-400/30 underline-offset-4">
                  {isRtl ? 'نصيحة: قم بتعيين رمز PIN على جهازك القديم أولاً ثم حاول مرة أخرى هنا.' : 'Set a PIN on your old device first, then try again here.'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => setShowFreshConfirm(true)}
                className="w-full h-16 rounded-2xl bg-[#087F75] text-white font-black text-lg shadow-lg shadow-[#087F75]/20 hover:bg-[#06685F] transition-all"
              >
                {isRtl ? 'البدء من جديد (لن تفتح المحادثات القديمة)' : 'Start fresh (old chats will not open)'}
              </button>
              
              <button
                onClick={onLogout}
                className="w-full h-16 rounded-2xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
              >
                {isRtl ? 'إلغاء / تسجيل الخروج' : 'Cancel / Logout'}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="p-8 text-center text-[10px] text-slate-600 font-medium uppercase tracking-widest">
        Hala Secure Encryption • {new Date().getFullYear()}
      </footer>
    </div>
  );
};
