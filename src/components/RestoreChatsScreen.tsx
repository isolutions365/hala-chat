import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Key, AlertCircle, RefreshCw, LogOut, Trash2, ArrowRight, Mail, CheckCircle2, Lock, Sparkles, Terminal } from 'lucide-react';
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
  isRestoreOnly: boolean;
  isPinActive: boolean;
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
      const sessionToken = await verifyTwoStepPin(pin);

      if (isRestoreOnly) {
        const backup = await fetchEncryptedKeyBackup(sessionToken);
        const restored = await decryptAndRestorePrivateKey(uid, pin, backup);
        
        if (!restored) {
          throw new Error(isRtl ? 'فشل فك تشفير النسخة الاحتياطية. تأكد من الرمز.' : 'Failed to decrypt backup. Check your PIN.');
        }
      }

      onSuccess(sessionToken);
    } catch (err: any) {
      console.warn('[Restore] Error:', err?.message || err);
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
      <div className="fixed inset-0 z-50 bg-[#03070a]/95 backdrop-blur-xl flex items-center justify-center p-6 text-white" dir={isRtl ? 'rtl' : 'ltr'}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md w-full bg-slate-900/90 border border-rose-500/30 rounded-[32px] p-8 space-y-6 text-center shadow-[0_0_60px_rgba(244,63,94,0.15)]">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-500/20 to-red-600/30 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/20">
            <Trash2 className="w-9 h-9" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight">{isRtl ? 'البدء من جديد؟' : 'Start Fresh?'}</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              {isRtl 
                ? 'تحذير: إذا بدأت من جديد، فلن تتمكن من قراءة محادثاتك القديمة المشفرة. سيتم حذف مفاتيحك القديمة وإنشاء مفاتيح جديدة.' 
                : 'Warning: If you start fresh, you won\'t be able to read your old encrypted chats. Your old keys will be replaced with new ones.'}
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-2">
            <button onClick={onStartFresh} className="w-full h-14 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 font-bold transition-all shadow-lg shadow-rose-600/30 cursor-pointer">
              {isRtl ? 'نعم، ابدأ من جديد' : 'Yes, Start Fresh'}
            </button>
            <button onClick={() => setShowFreshConfirm(false)} className="w-full h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-bold transition-all cursor-pointer">
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#03070a] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-950/30 via-[#03070a] to-[#010406] flex flex-col text-white select-none overflow-y-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Background glowing ambient light orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#087F75]/10 rounded-full blur-[140px] pointer-events-none"></div>

      <header className="p-6 flex items-center justify-between max-w-lg mx-auto w-full z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#087F75] to-[#045c53] shadow-lg shadow-[#087F75]/30 border border-teal-400/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-wide text-white flex items-center gap-1.5">
              <span>Hala Secure</span>
              <span className="px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[9px] font-mono font-bold">E2EE</span>
            </div>
            <p className="text-[10px] text-teal-300/60 font-medium">Zero-Knowledge Cloud</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold transition-all shadow-sm cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-teal-400" />
          <span>{isRtl ? 'تسجيل الخروج' : 'Sign Out'}</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto w-full space-y-8 my-auto z-10">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center space-y-4">
          <div className="relative mx-auto mb-6 w-28 h-28 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#087F75] to-teal-400 rounded-3xl blur-xl opacity-40 animate-pulse"></div>
            <div className="relative w-24 h-24 rounded-[28px] bg-gradient-to-br from-[#0a2327] via-[#071318] to-[#040c0f] shadow-2xl shadow-teal-950 border border-teal-500/30 flex items-center justify-center mx-auto">
              {step === 'enter_code' || step === 'forgot_confirm' ? (
                <Mail className="w-10 h-10 text-teal-400" />
              ) : (
                <Lock className="w-10 h-10 text-teal-400" />
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {step === 'pin' && (isRestoreOnly ? (isRtl ? 'استعادة المحادثات' : 'Restore Your Chats') : (isRtl ? 'التحقق بخطوتين' : 'Two-Step Cloud PIN'))}
              {step === 'enter_code' && (isRtl ? 'رمز التحقق الأمني' : 'Security Code')}
              {step === 'reset_pin' && (isRtl ? 'تعيين رمز جديد' : 'New Cloud PIN')}
              {step === 'reset_success' && (isRtl ? 'تم بنجاح!' : 'Success!')}
            </h1>
            <p className="text-sm text-teal-100/60 leading-relaxed max-w-xs mx-auto">
              {step === 'pin' && (isRtl ? 'أدخل رمز PIN السحابي المكون من 6 أرقام لفك تشفير بياناتك.' : 'Enter your 6-digit cloud PIN to decrypt your end-to-end secure messages.')}
              {step === 'enter_code' && (isRtl ? `تم إرسال رمز التحقق إلى ${maskedEmail}` : `A secure 6-digit verification code was sent to ${maskedEmail}`)}
              {step === 'reset_pin' && (isRtl ? 'قم بتعيين رمز PIN جديد لحسابك.' : 'Set a new secure PIN to protect your vault.')}
            </p>
          </div>
        </motion.div>

        {step === 'pin' && (
          <motion.form initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handleVerify} className="w-full bg-slate-900/60 backdrop-blur-2xl border border-teal-500/20 rounded-[32px] p-6 sm:p-8 space-y-6 shadow-[0_0_50px_rgba(8,127,117,0.12)]">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-teal-300/80 px-1">
                <span className="uppercase tracking-wider">{isRtl ? 'رمز الحماية السحابي' : 'Cloud Security PIN'}</span>
                <span className="text-teal-400 font-mono text-xs">{pin.length}/6</span>
              </div>

              {/* Neo-futuristic PIN Dot Indicators */}
              <div className="relative">
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder=""
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  disabled={isLoading}
                  autoFocus
                />
                <div className="grid grid-cols-6 gap-2.5 bg-slate-950/60 border-2 border-teal-500/20 rounded-2xl p-4 shadow-inner">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const isFilled = idx < pin.length;
                    return (
                      <div
                        key={idx}
                        className={`h-12 rounded-xl flex items-center justify-center font-mono text-xl font-bold transition-all duration-300 ${
                          isFilled
                            ? 'bg-[#087F75] text-white shadow-lg shadow-[#087F75]/40 border border-teal-300/40 scale-105'
                            : 'bg-slate-900 text-slate-600 border border-slate-800'
                        }`}
                      >
                        {isFilled ? '•' : ''}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2.5 text-rose-400 text-xs font-bold bg-rose-500/10 p-4 rounded-2xl border border-rose-500/30">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={pin.length !== 6 || isLoading}
              className={`w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-black text-base transition-all cursor-pointer shadow-xl ${
                pin.length === 6 && !isLoading
                  ? 'bg-gradient-to-r from-[#087F75] to-teal-600 hover:from-[#06685F] hover:to-teal-500 text-white shadow-[#087F75]/30'
                  : 'bg-slate-800/80 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : (
                <>
                  <span>{isRtl ? 'فك تشفير المحادثات' : 'Unlock Vault'}</span>
                  <ArrowRight className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>

            <div className="pt-2 flex flex-col items-center gap-3.5 w-full border-t border-slate-800/80">
              <button 
                type="button"
                onClick={handleForgotPin}
                className="text-teal-400 hover:text-teal-300 text-xs font-semibold transition-colors pt-2 cursor-pointer"
              >
                {isRtl ? 'نسيت رمز PIN؟' : 'Forgot your Cloud PIN?'}
              </button>
              
              <button 
                type="button"
                onClick={() => setShowFreshConfirm(true)}
                className="text-slate-400 hover:text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
              >
                {isRtl ? 'البدء من جديد (إعادة تعيين الحساب)' : 'Start fresh (Reset account keys)'}
              </button>
            </div>
          </motion.form>
        )}

        {step === 'enter_code' && (
          <motion.form initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handleVerifyCode} className="w-full bg-slate-900/60 backdrop-blur-2xl border border-teal-500/20 rounded-[32px] p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="space-y-3">
              <label className="text-xs font-semibold text-teal-300/80 uppercase tracking-wider block text-center">
                {isRtl ? 'رمز تأكيد البريد الإلكتروني' : 'Email Verification Code'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full h-16 bg-slate-950/80 border-2 border-slate-800 rounded-2xl text-2xl tracking-[0.5em] font-mono text-center focus:outline-none focus:border-[#087F75] text-white"
                autoFocus
              />
            </div>
            {error && <p className="text-rose-400 text-xs font-bold text-center">{error}</p>}
            <button
              type="submit"
              disabled={resetCode.length !== 6 || isLoading}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#087F75] to-teal-600 hover:from-[#06685F] text-white font-black text-base shadow-lg shadow-[#087F75]/30 transition-all cursor-pointer"
            >
              {isRtl ? 'متابعة' : 'Continue'}
            </button>
            <button type="button" onClick={() => setStep('pin')} className="w-full text-slate-400 hover:text-slate-300 text-xs font-semibold cursor-pointer">
              {isRtl ? 'العودة' : 'Back'}
            </button>
          </motion.form>
        )}

        {step === 'reset_pin' && (
          <motion.form initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} onSubmit={handleResetPin} className="w-full bg-slate-900/60 backdrop-blur-2xl border border-teal-500/20 rounded-[32px] p-6 sm:p-8 space-y-4 shadow-2xl">
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={isRtl ? 'رمز PIN جديد (6 أرقام)' : 'New 6-digit PIN'}
              className="w-full h-14 bg-slate-950/80 border-2 border-slate-800 rounded-2xl text-lg tracking-widest text-center focus:outline-none focus:border-[#087F75] text-white"
              autoFocus
            />
            <input
              type="password"
              inputMode="numeric"
              value={confirmNewPin}
              onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={isRtl ? 'תأكيد رمز PIN' : 'Confirm new PIN'}
              className="w-full h-14 bg-slate-950/80 border-2 border-slate-800 rounded-2xl text-lg tracking-widest text-center focus:outline-none focus:border-[#087F75] text-white"
            />
            {error && <p className="text-rose-400 text-xs font-bold text-center">{error}</p>}
            <button
              type="submit"
              disabled={newPin.length !== 6 || newPin !== confirmNewPin || isLoading}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#087F75] to-teal-600 hover:from-[#06685F] text-white font-black text-base shadow-lg shadow-[#087F75]/30 transition-all cursor-pointer"
            >
              {isLoading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : (isRtl ? 'تحديث الرمز' : 'Update PIN')}
            </button>
          </motion.form>
        )}

        {step === 'reset_success' && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full bg-slate-900/60 backdrop-blur-2xl border border-teal-500/20 rounded-[32px] p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {isRtl ? 'تم تغيير رمز PIN بنجاح. يمكنك الآن استعادة محادثاتك بأمان.' : 'PIN updated successfully. You can now access your secure vault.'}
            </p>
            <button
              onClick={() => {
                setPin(newPin);
                setStep('pin');
              }}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#087F75] to-teal-600 hover:from-[#06685F] text-white font-black text-base shadow-lg shadow-[#087F75]/30 transition-all cursor-pointer"
            >
              {isRtl ? 'متابعة إلى المحادثات' : 'Continue to Chats'}
            </button>
          </motion.div>
        )}

        {step === 'no_pin_warning' && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full bg-slate-900/60 backdrop-blur-2xl border border-amber-500/20 rounded-[32px] p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-start gap-3.5 text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-white">{isRtl ? 'تنبيه الأمان' : 'Security Alert'}</h3>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  {isRtl 
                    ? 'لا يمكن فتح محادثاتك القديمة على هذا الجهاز لأنك لم تقم بتعيين رمز PIN على جهازك القديم.' 
                    : 'Your previous encrypted chats cannot be accessed on this new device because a cloud PIN was not configured on your prior session.'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3.5 pt-2">
              <button
                onClick={() => setShowFreshConfirm(true)}
                className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#087F75] to-teal-600 hover:from-[#06685F] text-white font-bold text-sm shadow-lg shadow-[#087F75]/25 transition-all cursor-pointer"
              >
                {isRtl ? 'البدء من جديد (محادثات جديدة)' : 'Start fresh with new keys'}
              </button>
              
              <button
                onClick={onLogout}
                className="w-full h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-teal-400" />
                <span>{isRtl ? 'تسجيل الخروج والرجوع' : 'Sign out & Switch account'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </main>

      <footer className="p-6 text-center text-[11px] text-teal-300/40 font-medium tracking-wider uppercase z-10">
        Hala Secure Encryption • {new Date().getFullYear()}
      </footer>
    </div>
  );
};
