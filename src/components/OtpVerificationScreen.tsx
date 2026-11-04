import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, ShieldCheck, RefreshCw, Edit2, AlertCircle, Smartphone, Clock, CheckCircle2 } from 'lucide-react';
import { Language, Country } from '../types';
import { clearRecaptchaVerifier } from '../lib/firebase';

interface OtpVerificationScreenProps {
  language: Language;
  fullPhoneNumber: string;
  country: Country;
  onEditPhoneNumber: () => void;
  onVerifyOtpCode: (otp: string) => Promise<{ success: boolean; isExistingUser?: boolean; error?: string }>;
  onResendOtp: () => Promise<{ success: boolean; error?: string }>;
}

export const OtpVerificationScreen: React.FC<OtpVerificationScreenProps> = ({
  language,
  fullPhoneNumber,
  country,
  onEditPhoneNumber,
  onVerifyOtpCode,
  onResendOtp,
}) => {
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState<number>(60);
  const [canResend, setCanResend] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCooldown, setErrorCooldown] = useState<number>(0);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  // Real-time timer interval for error cooldown
  useEffect(() => {
    let timer: any;
    if (errorCooldown > 0) {
      timer = setInterval(() => {
        setErrorCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [errorCooldown]);

  const isVerifyingRef = useRef<boolean>(false);
  const isResendingRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      clearRecaptchaVerifier('recaptcha-container');
    };
  }, []);


  const [autoSmsDetected, setAutoSmsDetected] = useState<boolean>(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isRtl = language === 'ar';

  // Format seconds to 0:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Countdown timer for resend
  useEffect(() => {
    let timer: any;
    if (countdown > 0 && !canResend) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0) {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [countdown, canResend]);

  // Support Web OTP API (SMS Retriever) on compatible devices
  useEffect(() => {
    if ('OTPCredential' in window && (window as any).OTPCredential) {
      const ac = new AbortController();
      (navigator.credentials as any)
        .get({
          otp: { transport: ['sms'] },
          signal: ac.signal,
        })
        .then((content: any) => {
          if (content && content.code) {
            const digits = content.code.replace(/\D/g, '').slice(0, 6).split('');
            const newOtp = ['', '', '', '', '', ''];
            digits.forEach((d: string, i: number) => {
              newOtp[i] = d;
            });
            setOtp(newOtp);
            setAutoSmsDetected(true);
            triggerVerification(digits.join(''));
          }
        })
        .catch(() => {
          // Ignore WebOTP abort/dismiss
        });

      return () => ac.abort();
    }
  }, []);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setHasError(false);
    setErrorMessage(null);

    // Auto focus next input box
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto submit when all 6 digits entered
    const fullOtp = newOtp.join('');
    if (fullOtp.length === 6) {
      triggerVerification(fullOtp);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newOtp = ['', '', '', '', '', ''];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtp(newOtp);
    setHasError(false);
    setErrorMessage(null);

    if (pastedData.length === 6) {
      triggerVerification(pastedData);
    } else {
      inputRefs.current[pastedData.length]?.focus();
    }
  };

  const fullOtpString = otp.join('');
  const isComplete = fullOtpString.length === 6;

  const triggerVerification = async (code: string) => {
    if (isVerifyingRef.current || isVerifying || code.length !== 6) return;
    isVerifyingRef.current = true;
    setIsVerifying(true);
    setHasError(false);
    setErrorMessage(null);

    try {
      const result = await onVerifyOtpCode(code);
      if (!result.success) {
        const defaultMsg = isRtl
          ? 'رمز التحقق غير صحيح، يرجى التأكد وإعادة المحاولة'
          : 'Incorrect or expired verification code. Please try again.';
        triggerErrorState(result.error || defaultMsg);
        setIsVerifying(false);
        isVerifyingRef.current = false;
      }
      // On success, leave isVerifying true while app transitions screen
    } catch (err: any) {
      triggerErrorState(
        isRtl ? 'حدث خطأ أثناء التحقق، يرجى المحاولة لاحقاً' : (err?.message || 'Verification failed, please try again')
      );
      setIsVerifying(false);
      isVerifyingRef.current = false;
    }
  };

  const triggerErrorState = (msg: string) => {
    setHasError(true);
    setErrorMessage(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);

    const isRateLimitOrExpire =
      msg.toLowerCase().includes('too-many-requests') ||
      msg.toLowerCase().includes('too many requests') ||
      msg.includes('طلبات كثيرة') ||
      msg.includes('الحد الأقصى') ||
      msg.includes('منتهي') ||
      msg.includes('expired');
    setErrorCooldown(isRateLimitOrExpire ? 60 : 30);
  };

  const handleResend = async () => {
    if (!canResend || isResendingRef.current || isResending || errorCooldown > 0) return;
    isResendingRef.current = true;
    setIsResending(true);
    setHasError(false);
    setErrorMessage(null);
    clearRecaptchaVerifier('recaptcha-container');

    try {
      const res = await onResendOtp();
      if (res.success) {
        setCanResend(false);
        setCountdown(60);
        setErrorCooldown(0);
        setOtp(['', '', '', '', '', '']);
      } else if (res.error) {
        clearRecaptchaVerifier('recaptcha-container');
        triggerErrorState(res.error);
      }
    } catch (err: any) {
      clearRecaptchaVerifier('recaptcha-container');
      triggerErrorState(err?.message || (isRtl ? 'فشل إعادة الإرسال' : 'Failed to resend code'));
    } finally {
      setIsResending(false);
      isResendingRef.current = false;
    }
  };



  return (
    <motion.div
      initial={{ opacity: 0, x: isRtl ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: isRtl ? 40 : -40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full h-full flex flex-col justify-between px-6 py-6 bg-slate-50 text-slate-900 min-h-[580px] overflow-y-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div>
        {/* Navigation Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onEditPhoneNumber}
              className="w-11 h-11 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
              aria-label={isRtl ? 'رجوع' : 'Back'}
            >
              {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
            </button>
            <img src="/icons/icon-192.png" alt="Hala" className="w-9 h-9 rounded-xl shadow-2xs border border-teal-600/20" />
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#087F75]/10 text-[#087F75] rounded-full text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isRtl ? 'الخطوة ٢ من ٢' : 'Step 2 of 2'}</span>
          </div>
        </div>

        {/* Header Text */}
        <h2 className="text-2xl font-bold text-slate-900 mb-1 tracking-tight">
          {isRtl ? 'أدخل الرمز' : 'Enter the code'}
        </h2>

        {/* Subtext showing phone number with Edit link */}
        <div className="flex items-center flex-wrap gap-1.5 text-sm text-slate-500 mb-6">
          <span>{isRtl ? 'تم إرسال رمز التحقق إلى' : 'Sent SMS code to'}</span>
          <div className="inline-flex items-center gap-1 bg-slate-200/70 text-slate-900 px-2 py-0.5 rounded-md font-mono font-medium text-xs" dir="ltr">
            <span>{country.flag}</span>
            <span>{fullPhoneNumber}</span>
          </div>
          <button
            type="button"
            onClick={onEditPhoneNumber}
            className="inline-flex items-center gap-1 text-[#087F75] font-semibold text-xs hover:underline cursor-pointer ml-1"
          >
            <Edit2 className="w-3 h-3" />
            <span>{isRtl ? 'تعديل' : 'Edit'}</span>
          </button>
        </div>

        {/* Auto SMS detection indicator */}
        {autoSmsDetected && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
          >
            <Smartphone className="w-4 h-4 animate-pulse" />
            <span>{isRtl ? 'تم التقاط الرسالة النصية تلقائياً (SMS Retriever)' : 'SMS code detected automatically via SMS Retriever'}</span>
          </motion.div>
        )}

        {/* 6 OTP Input Boxes with Shake Animation on Error */}
        <motion.div
          animate={{ x: isShaking ? [-10, 10, -8, 8, -4, 4, 0] : 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-2" dir="ltr" onPaste={handlePaste}>
            {otp.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`w-11 sm:w-12 h-14 bg-white border text-center text-xl font-bold font-mono rounded-xl transition-all outline-hidden focus:ring-2 ${
                  hasError
                    ? 'border-red-500 text-red-600 ring-2 ring-red-200 bg-red-50/20'
                    : digit
                    ? 'border-[#087F75] text-[#087F75] ring-1 ring-[#087F75]/30'
                    : 'border-slate-300 text-slate-900 focus:border-[#087F75] focus:ring-[#087F75]/20'
                }`}
                autoFocus={idx === 0}
              />
            ))}
          </div>

          {/* Inline Error Message with Live Updating Countdown */}
          <AnimatePresence>
            {hasError && errorMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 space-y-2 font-medium shadow-2xs"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <span>{errorMessage}</span>

                    {/* Live Countdown Timer in Error Container */}
                    {errorCooldown > 0 ? (
                      <div className="p-2 bg-white/90 border border-red-200 rounded-xl flex items-center justify-between text-xs font-medium text-red-800">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-red-600 animate-spin shrink-0" style={{ animationDuration: '3s' }} />
                          <span>
                            {isRtl
                              ? `يرجى الانتظار (${formatTimer(errorCooldown)}) قبل المحاولة مجدداً`
                              : `Please wait (${formatTimer(errorCooldown)}) before trying again`}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-md text-[11px]" dir="ltr">
                          {formatTimer(errorCooldown)}
                        </span>
                      </div>
                    ) : (
                      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          {isRtl
                            ? 'انتهت فترة الانتظار، يمكنك إعادة المحاولة الآن'
                            : 'Cooldown complete, you can try again now'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Resend Code Section */}
          <div className="flex items-center justify-center pt-3 text-xs">
            {canResend ? (
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending}
                className="flex items-center gap-1.5 text-[#087F75] font-semibold hover:underline cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                <span>{isResending ? (isRtl ? 'جاري الإرسال...' : 'Resending...') : (isRtl ? 'إعادة إرسال الرمز' : 'Resend code')}</span>
              </button>
            ) : (
              <span className="text-slate-400 font-mono">
                {isRtl
                  ? `إعادة الإرسال خلال ${formatTimer(countdown)}`
                  : `Resend in ${formatTimer(countdown)}`}
              </span>
            )}
          </div>
        </motion.div>
      </div>

      {/* Primary Verify Button */}
      <div className="w-full pt-6">
        <motion.button
          type="button"
          whileHover={isComplete ? { scale: 1.01 } : {}}
          whileTap={isComplete ? { scale: 0.98 } : {}}
          onClick={() => triggerVerification(fullOtpString)}
          disabled={!isComplete || isVerifying}
          className={`w-full h-[52px] min-h-[44px] font-semibold text-base rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
            isComplete && !isVerifying
              ? 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-md shadow-[#087F75]/20'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isVerifying ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>{isRtl ? 'جاري التحقق من الرمز وقاعدة البيانات...' : 'Verifying OTP & Profile...'}</span>
            </div>
          ) : (
            <span>{isRtl ? 'تأكيد الرمز' : 'Verify'}</span>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
};
