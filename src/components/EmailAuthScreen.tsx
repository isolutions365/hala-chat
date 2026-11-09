import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  Lock,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Smartphone,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import { Language } from '../types';
import { signInWithEmail, sendUserPasswordReset } from '../lib/firebase';

interface EmailAuthScreenProps {
  language: Language;
  onBack: () => void;
  onGoToPhone?: () => void;
  isLoading: boolean;
  onSessionRestored: (user: any, profile: any) => void;
}

export const EmailAuthScreen: React.FC<EmailAuthScreenProps> = ({
  language,
  onBack,
  onGoToPhone,
  isLoading: globalLoading,
  onSessionRestored,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Password reset state
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);

  // Explainer guide accordion
  const [showGuide, setShowGuide] = useState(false);

  const isRtl = language === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      await signInWithEmail(email.trim(), password);
      // Profile will be detected and restored by the Firebase auth observer in App.tsx
    } catch (err: any) {
      console.error('Email sign-in error:', err);
      let msg = err.message;
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-email'
      ) {
        msg = isRtl
          ? 'هذا البريد غير مسجل أو كلمة المرور غير صحيحة. إذا كنت مستخدماً جديداً، يرجى التسجيل برقم هاتفك أولاً.'
          : 'Email not found or incorrect password. If you are a new user, please register with your phone number first.';
      } else if (err.code === 'auth/wrong-password') {
        msg = isRtl ? 'كلمة المرور غير صحيحة. يمكنك استعادة كلمة المرور عبر الرابط أدناه.' : 'Incorrect password. You can reset your password using the link below.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = isRtl ? 'تم إجراء محاولات كثيرة خاطئة. يرجى الانتظار بضع دقائق ثم المحاولة مجدداً.' : 'Too many failed attempts. Please wait a few minutes and try again.';
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = (resetEmail || email).trim();
    if (!targetEmail || isResetLoading) return;

    setIsResetLoading(true);
    setError(null);

    try {
      await sendUserPasswordReset(targetEmail);
      setResetSent(true);
    } catch (err: any) {
      console.error('Password reset error:', err);
      let msg = err.message;
      if (err.code === 'auth/user-not-found') {
        msg = isRtl
          ? 'هذا البريد الإلكتروني غير مربوط بأي حساب هلا.'
          : 'This email is not associated with any Hala account.';
      }
      setError(msg);
    } finally {
      setIsResetLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: isRtl ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: isRtl ? 40 : -40 }}
      className="w-full h-full flex flex-col px-5 py-6 bg-slate-50 text-slate-900 overflow-y-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label={isRtl ? 'رجوع' : 'Back'}
          className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </button>
        <h2 className="text-base font-bold text-slate-900">
          {isResetMode
            ? (isRtl ? 'استعادة كلمة المرور' : 'Reset Password')
            : (isRtl ? 'تسجيل الدخول بالبريد' : 'Sign in with Email')}
        </h2>
        <div className="w-10" />
      </div>

      <div className="space-y-5 max-w-sm mx-auto w-full">
        {/* FIRST-TIME USER NOTICE BANNER (Answers user's question directly!) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-teal-50 via-white to-amber-50/50 border border-teal-200/90 shadow-2xs space-y-2.5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#087F75] text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-black text-slate-900">
                {isRtl ? 'هل أنت مستخدم جديد لأول مرة؟' : 'New to Hala? First time here?'}
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                {isRtl
                  ? 'الحسابات في تطبيق هلا تُنشأ أولاً برقم الهاتف للتحقق الآمن وتشفير المحادثات. إذا لم تكن قد أنشأت حساباً من قبل، ابدأ برقم هاتفك.'
                  : 'Hala accounts are created using your phone number for end-to-end encryption. If you have not created an account yet, please start with your phone.'}
              </p>
            </div>
          </div>

          {onGoToPhone && (
            <button
              type="button"
              onClick={onGoToPhone}
              className="w-full py-2.5 px-3 bg-[#087F75] hover:bg-[#06685F] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>{isRtl ? 'تسجيل جديد برقم الهاتف (مستحسن)' : 'Get Started with Phone Number (Recommended)'}</span>
            </button>
          )}
        </div>

        {/* RESET PASSWORD MODE */}
        {isResetMode ? (
          <form onSubmit={handlePasswordReset} className="space-y-4 pt-2">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-2 shadow-2xs">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                {isRtl ? 'إعادة تعيين كلمة المرور' : 'Reset Your Password'}
              </h3>
              <p className="text-xs text-slate-500">
                {isRtl
                  ? 'أدخل بريدك الإلكتروني المسجل وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.'
                  : 'Enter your registered email and we will send you a reset link.'}
              </p>
            </div>

            {resetSent ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold text-emerald-800">
                  {isRtl
                    ? 'تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني! تفقد صندوق الوارد.'
                    : 'Password reset link sent! Please check your email inbox.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(false);
                    setResetSent(false);
                  }}
                  className="w-full py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  {isRtl ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    {isRtl ? 'البريد الإلكتروني' : 'Email Address'}
                  </label>
                  <div className="relative">
                    <Mail
                      className={`absolute top-1/2 -translate-y-1/2 ${
                        isRtl ? 'right-3' : 'left-3'
                      } w-5 h-5 text-slate-400`}
                    />
                    <input
                      type="email"
                      value={resetEmail || email}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="example@mail.com"
                      className={`w-full h-12 bg-white border border-slate-300 rounded-xl ${
                        isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'
                      } text-sm focus:border-[#087F75] outline-none transition-colors shadow-2xs`}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(false);
                      setError(null);
                    }}
                    className="flex-1 h-12 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                  >
                    {isRtl ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isResetLoading || !(resetEmail || email)}
                    className="flex-[2] h-12 bg-[#087F75] hover:bg-[#06685F] text-white font-bold rounded-xl shadow-md shadow-[#087F75]/25 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 cursor-pointer"
                  >
                    {isResetLoading ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <span>{isRtl ? 'إرسال الرابط' : 'Send Reset Link'}</span>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        ) : (
          /* STANDARD SIGN-IN FORM */
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                {isRtl ? 'البريد الإلكتروني' : 'Email Address'}
              </label>
              <div className="relative">
                <Mail
                  className={`absolute top-1/2 -translate-y-1/2 ${
                    isRtl ? 'right-3' : 'left-3'
                  } w-5 h-5 text-slate-400`}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@mail.com"
                  className={`w-full h-12 bg-white border border-slate-300 rounded-xl ${
                    isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'
                  } text-sm focus:border-[#087F75] outline-none transition-colors shadow-2xs`}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 block">
                  {isRtl ? 'كلمة المرور' : 'Password'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(true);
                    setError(null);
                  }}
                  className="text-[11px] font-bold text-[#087F75] hover:underline cursor-pointer"
                >
                  {isRtl ? 'نسيت كلمة المرور؟' : 'Forgot Password?'}
                </button>
              </div>
              <div className="relative">
                <Lock
                  className={`absolute top-1/2 -translate-y-1/2 ${
                    isRtl ? 'right-3' : 'left-3'
                  } w-5 h-5 text-slate-400`}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full h-12 bg-white border border-slate-300 rounded-xl ${
                    isRtl ? 'pr-10 pl-10' : 'pl-10 pr-10'
                  } text-sm focus:border-[#087F75] outline-none transition-colors shadow-2xs`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className={`absolute top-1/2 -translate-y-1/2 ${
                    isRtl ? 'left-3' : 'right-3'
                  } text-slate-400 hover:text-slate-600 p-1 cursor-pointer`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-snug">{error}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full h-12 bg-[#087F75] hover:bg-[#06685F] text-white font-bold rounded-xl shadow-md shadow-[#087F75]/25 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none cursor-pointer"
            >
              {isLoading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <span>{isRtl ? 'تسجيل الدخول' : 'Sign In'}</span>
              )}
            </button>
          </form>
        )}

        {/* HOW IT WORKS ACCORDION GUIDE */}
        <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-2xs mt-4">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
            dir={isRtl ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <HelpCircle className="w-4 h-4 text-[#087F75]" />
              <span>{isRtl ? 'كيف يتم تعيين البريد وكلمة المرور؟' : 'How to set up email & password?'}</span>
            </div>
            {showGuide ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          <AnimatePresence>
            {showGuide && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 pb-4 pt-1 text-xs text-slate-600 space-y-2 border-t border-slate-100"
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-[#087F75] font-bold text-[10px] flex items-center justify-center shrink-0">1</span>
                  <p>{isRtl ? 'سجّل الدخول أولاً برقم هاتفك عبر رمز التحقق (SMS).' : 'First, register with your phone number via SMS OTP.'}</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-[#087F75] font-bold text-[10px] flex items-center justify-center shrink-0">2</span>
                  <p>{isRtl ? 'افتح شاشة الإعدادات (Settings) واضغط على "ربط البريد الإلكتروني".' : 'Open Settings and click on "Link Email Account".'}</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-[#087F75] font-bold text-[10px] flex items-center justify-center shrink-0">3</span>
                  <p>{isRtl ? 'أدخل بريدك الإلكتروني وعيّن كلمة المرور التي تناسبك.' : 'Enter your email address and define your password.'}</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-[#087F75] font-bold text-[10px] flex items-center justify-center shrink-0">4</span>
                  <p>{isRtl ? 'بعدها يمكنك استخدام هذا البريد وكلمة المرور لتسجيل الدخول من أي جهاز في أي وقت.' : 'You can then use this email and password to log in from any device anytime.'}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
