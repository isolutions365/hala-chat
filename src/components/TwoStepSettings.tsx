import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Key, AlertCircle, RefreshCw, CheckCircle2, ChevronRight, Mail, Trash2, ShieldAlert, Check, Smartphone } from 'lucide-react';
import { Language, UserProfile } from '../types';
import { setTwoStepPin, encryptPrivateKeyBackup, saveEncryptedKeyBackup, setRecoveryEmail, setRecoveryPhone, getFirebaseDb } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface TwoStepSettingsProps {
  language: Language;
  profile: UserProfile;
  onClose: () => void;
  onStatusChange: (enabled: boolean) => void;
  onUserProfileUpdated?: (profile: UserProfile) => void;
}

export const TwoStepSettings: React.FC<TwoStepSettingsProps> = ({
  language,
  profile,
  onClose,
  onStatusChange,
  onUserProfileUpdated,
}) => {
  const isRtl = language === 'ar';
  const [step, setStep] = useState<'main' | 'set_pin' | 'confirm_pin' | 'success' | 'set_recovery'>('main');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [email, setEmail] = useState(profile.twoFactor?.recoveryEmail || '');
  const [phone, setPhone] = useState(profile.twoFactor?.recoveryPhone || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEnabled = profile.twoFactor?.enabled === true;

  const handleSetPin = async () => {
    if (pin.length !== 6) return;
    setStep('confirm_pin');
  };

  const handleConfirmPin = async () => {
    if (pin !== confirmPin) {
      setError(isRtl ? 'الرمز غير متطابق' : 'PINs do not match');
      return;
    }
    
    // Reject weak PINs
    const weak = ['123456', '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999'];
    if (weak.includes(pin)) {
      setError(isRtl ? 'هذا الرمز ضعيف جداً' : 'This PIN is too weak');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Set PIN on server
      await setTwoStepPin(pin);

      // 2. Encrypt and Backup E2EE keys using this PIN
      const backup = await encryptPrivateKeyBackup(profile.id, pin);
      if (backup) {
        await saveEncryptedKeyBackup(backup.blob, backup.salt, backup.iv, backup.keyVersion);
      }

      // 3. Update local user profile doc
      const db = getFirebaseDb();
      const nextUpdateAt = new Date().toISOString();
      await updateDoc(doc(db, 'users', profile.id), {
        'two_factor.enabled': true,
        'two_factor.updatedAt': nextUpdateAt
      });

      if (onUserProfileUpdated) {
        onUserProfileUpdated({
          ...profile,
          twoFactor: { ...profile.twoFactor, enabled: true }
        });
      }

      onStatusChange(true);
      setStep('success');
    } catch (err: any) {
      console.error('[TwoStep] Save PIN error:', err);
      const rawMsg = err?.message || '';
      if (rawMsg.includes('internal') || rawMsg.includes('functions/')) {
        setError(isRtl ? 'حدث خطأ أثناء حفظ الرمز. يرجى المحاولة مرة أخرى.' : 'Failed to save PIN. Please try again.');
      } else {
        setError(rawMsg || (isRtl ? 'حدث خطأ أثناء حفظ الرمز' : 'Error saving PIN'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveRecovery = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const db = getFirebaseDb();
      const updates: any = {};
      if (email.includes('@')) {
        await setRecoveryEmail(email);
        updates['two_factor.recoveryEmail'] = email;
      }
      
      const phoneInput = phone;
      if (phoneInput && phoneInput.length > 7) {
        await setRecoveryPhone(phoneInput);
        updates['two_factor.recoveryPhone'] = phoneInput;
      }

      await updateDoc(doc(db, 'users', profile.id), updates);
      
      if (onUserProfileUpdated) {
        const nextProfile = { ...profile };
        if (email.includes('@')) {
          nextProfile.twoFactor = { ...nextProfile.twoFactor, recoveryEmail: email, enabled: nextProfile.twoFactor?.enabled ?? false };
        }
        if (phoneInput && phoneInput.length > 7) {
          nextProfile.twoFactor = { ...nextProfile.twoFactor, recoveryPhone: phoneInput, enabled: nextProfile.twoFactor?.enabled ?? false };
        }
        onUserProfileUpdated(nextProfile);
      }

      setStep('main');
    } catch (err: any) {
      setError(err.message || 'Error saving recovery info');
    } finally {
      setIsLoading(false);
    }
  };

  const disableTwoStep = async () => {
    if (!window.confirm(isRtl ? 'هل أنت متأكد من تعطيل التحقق بخطوتين؟' : 'Are you sure you want to disable two-step verification?')) return;
    setIsLoading(true);
    try {
      const db = getFirebaseDb();
      await updateDoc(doc(db, 'users', profile.id), {
        'two_factor.enabled': false
      });
      
      if (onUserProfileUpdated) {
        onUserProfileUpdated({
          ...profile,
          twoFactor: { ...profile.twoFactor, enabled: false }
        });
      }
      
      onStatusChange(false);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4">
        <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
          <ChevronRight className={`w-5 h-5 ${isRtl ? '' : 'rotate-180'}`} />
        </button>
        <h2 className="font-bold text-slate-800 dark:text-white">
          {isRtl ? 'التحقق بخطوتين' : 'Two-step Verification'}
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {step === 'main' && (
          <div className="space-y-6">
            <div className="w-20 h-20 rounded-3xl bg-teal-50 dark:bg-teal-900/20 text-[#087F75] flex items-center justify-center mx-auto shadow-sm">
              <Shield className="w-10 h-10" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed px-4">
                {isRtl 
                  ? 'أضف طبقة أمان إضافية لحسابك. سيطلب منك رمز PIN عند تسجيل الدخول من جهاز جديد.'
                  : 'Add an extra layer of security to your account. You\'ll be asked for a PIN when logging in from a new device.'}
              </p>
            </div>

            <div className="pt-4 space-y-4">
              {isEnabled ? (
                <div className="space-y-3">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {isRtl ? 'هذه الميزة مفعلة حالياً' : 'This feature is currently enabled'}
                    </span>
                  </div>
                  
                  <button onClick={() => setStep('set_pin')} className="w-full py-4 px-6 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <Key className="w-4 h-4 text-slate-500" />
                    {isRtl ? 'تغيير رمز PIN' : 'Change PIN'}
                  </button>

                  <button onClick={() => setStep('set_recovery')} className="w-full py-4 px-6 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <Mail className="w-4 h-4 text-slate-500" />
                    <div className="flex flex-col items-start">
                      <span>{isRtl ? 'البريد الإلكتروني للطوارئ' : 'Recovery Email'}</span>
                      <span className="text-[10px] font-medium text-slate-400">{profile.twoFactor?.recoveryEmail || (isRtl ? 'لم يتم التعيين' : 'Not set')}</span>
                    </div>
                  </button>

                  <button onClick={disableTwoStep} className="w-full py-4 px-6 rounded-2xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 font-bold text-sm transition-all flex items-center justify-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    {isRtl ? 'تعطيل التحقق بخطوتين' : 'Disable Two-step Verification'}
                  </button>
                </div>
              ) : (
                <button onClick={() => setStep('set_pin')} className="w-full py-4 px-6 rounded-2xl bg-[#087F75] hover:bg-[#06685f] text-white font-bold transition-all shadow-lg shadow-teal-500/20">
                  {isRtl ? 'تفعيل' : 'Enable'}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'set_recovery' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                {isRtl ? 'معلومات الاسترداد' : 'Recovery Information'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed px-4">
                {isRtl 
                  ? 'أضف بريداً إلكترونياً أو رقم هاتف لاستعادة حسابك في حال نسيت رمز PIN.'
                  : 'Add an email or phone number to recover your account if you forget your PIN.'}
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full h-14 pl-12 pr-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-[#087F75] transition-all"
                  autoFocus
                />
              </div>

              <div className="relative">
                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 XXX XXXXXXX"
                  className="w-full h-14 pl-12 pr-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-[#087F75] transition-all"
                />
              </div>

              {error && (
                <div className="text-rose-500 text-xs font-bold text-center flex items-center justify-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep('main')} className="flex-1 py-4 px-6 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  disabled={isLoading}
                  onClick={handleSaveRecovery}
                  className="flex-[2] py-4 px-6 rounded-2xl bg-[#087F75] hover:bg-[#06685f] text-white font-bold transition-all disabled:opacity-50"
                >
                  {isLoading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : (isRtl ? 'حفظ' : 'Save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {(step === 'set_pin' || step === 'confirm_pin') && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                {step === 'confirm_pin' ? (isRtl ? 'تأكيد الرمز' : 'Confirm PIN') : (isRtl ? 'تعيين رمز PIN' : 'Set a PIN')}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed px-4">
                {isRtl ? 'يرجى إدخال 6 أرقام.' : 'Please enter 6 digits.'}
              </p>
            </div>

            <div className="max-w-[240px] mx-auto">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={step === 'set_pin' ? pin : confirmPin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  if (step === 'set_pin') setPin(v);
                  else setConfirmPin(v);
                }}
                className="w-full h-14 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-2xl tracking-[0.4em] font-mono text-center focus:outline-none focus:border-[#087F75] transition-all"
                autoFocus
              />
            </div>

            {error && (
              <div className="text-rose-500 text-xs font-bold text-center flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {error}
              </div>
            )}

            <div className="pt-4 flex gap-3">
              {step === 'confirm_pin' && (
                <button onClick={() => setStep('set_pin')} className="flex-1 py-4 px-6 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">
                  {isRtl ? 'رجوع' : 'Back'}
                </button>
              )}
              <button
                disabled={isLoading || (step === 'set_pin' ? pin.length < 6 : confirmPin.length < 6)}
                onClick={step === 'set_pin' ? handleSetPin : handleConfirmPin}
                className="flex-[2] py-4 px-6 rounded-2xl bg-[#087F75] hover:bg-[#06685f] text-white font-bold transition-all disabled:opacity-50 disabled:bg-slate-400"
              >
                {isLoading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : (isRtl ? 'استمرار' : 'Continue')}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-6 text-center py-10 animate-fadeIn">
            <div className="w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <Check className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">
                {isRtl ? 'تم التفعيل بنجاح!' : 'Enabled successfully!'}
              </h3>
              <p className="text-sm text-slate-500 px-4">
                {isRtl ? 'الآن حسابك ومحادثاتك محمية ومشفرة بالكامل.' : 'Your account and chats are now fully protected and encrypted.'}
              </p>
            </div>
            <button onClick={onClose} className="w-full mt-6 py-4 px-6 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold transition-all">
              {isRtl ? 'تم' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
