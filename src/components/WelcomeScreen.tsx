import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Language } from '../types';
import { Globe, ArrowLeft, ArrowRight, RefreshCw, Mail, Smartphone } from 'lucide-react';
import { TestVersionBanner } from './TestVersionBanner';

interface WelcomeScreenProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onGetStarted: () => void;
  onEmailLogin?: () => void;
  onOpenTerms?: () => void;
  isVerifyingSession?: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  language,
  onLanguageChange,
  onGetStarted,
  onEmailLogin,
  isVerifyingSession = false,
}) => {
  const isRtl = language === 'ar';
  const [logoPulse, setLogoPulse] = useState(false);

  const handleLogoClick = () => {
    setLogoPulse(true);
    setTimeout(() => setLogoPulse(false), 800);
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="w-full h-full relative overflow-y-auto overflow-x-hidden bg-gradient-to-b from-[#087F75] via-[#066355] to-[#04472B] text-white flex flex-col justify-between p-6 sm:p-10 select-none pt-safe pb-safe"
    >
      {/* Subtle 8-Point Islamic Star Geometric Watermark Pattern */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden flex items-center justify-center opacity-8">
        <svg
          className="w-[140%] max-w-[800px] h-auto text-white"
          viewBox="0 0 400 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Central 8-point Islamic star (Khatam) */}
          <g stroke="currentColor" strokeWidth="1.5">
            <rect x="100" y="100" width="200" height="200" rx="4" />
            <rect x="100" y="100" width="200" height="200" rx="4" transform="rotate(45 200 200)" />
            <circle cx="200" cy="200" r="140" strokeDasharray="4 6" strokeWidth="1" />
            <circle cx="200" cy="200" r="70" strokeWidth="1.2" />
            {/* Corner ornamental radiating stars */}
            <rect x="30" y="30" width="60" height="60" rx="2" />
            <rect x="30" y="30" width="60" height="60" rx="2" transform="rotate(45 60 60)" />
            <rect x="310" y="30" width="60" height="60" rx="2" />
            <rect x="310" y="30" width="60" height="60" rx="2" transform="rotate(45 340 60)" />
            <rect x="30" y="310" width="60" height="60" rx="2" />
            <rect x="30" y="310" width="60" height="60" rx="2" transform="rotate(45 60 340)" />
            <rect x="310" y="310" width="60" height="60" rx="2" />
            <rect x="310" y="310" width="60" height="60" rx="2" transform="rotate(45 340 340)" />
          </g>
        </svg>
      </div>

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between w-full">
        <TestVersionBanner language={language} variant="pill" />

        {/* Language Toggle */}
        <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 shadow-md">
          <Globe className="w-3.5 h-3.5 text-[#F5C451]" />
          <button
            type="button"
            onClick={() => onLanguageChange(language === 'ar' ? 'en' : 'ar')}
            className="text-xs font-bold text-white hover:text-[#F5C451] transition-colors cursor-pointer"
          >
            {language === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>
      </header>

      {/* Center Stage: New Brand Icon & Typography */}
      <main className="relative z-20 flex flex-col items-center justify-center text-center my-auto space-y-6 max-w-sm mx-auto px-4">
        {/* New App Icon with smooth entrance animation (<1s) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          onClick={handleLogoClick}
          role="button"
          tabIndex={0}
          aria-label="Replay logo animation"
          className="relative group cursor-pointer focus:outline-none"
        >
          {/* Ambient golden aura glow */}
          <div className="absolute -inset-2 bg-gradient-to-r from-[#F5C451]/30 via-teal-300/20 to-[#F5C451]/30 rounded-[38px] blur-lg opacity-60 group-hover:opacity-100 transition-opacity duration-500" />

          {/* New App Icon */}
          <div
            className={`relative w-32 h-32 sm:w-36 sm:h-36 rounded-[30px] sm:rounded-[34px] overflow-hidden shadow-2xl border-2 border-white/25 transition-transform duration-300 hover:scale-105 active:scale-95 bg-[#04472B] flex items-center justify-center ${
              logoPulse ? 'animate-bounce' : ''
            }`}
          >
            <img
              src="/icons/icon-512.png"
              alt="Hala App Icon"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
        </motion.div>

        {/* App Title & Golden Accent */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight drop-shadow-sm font-sans">
              {isRtl ? 'هلا' : 'Hala'}
            </h1>
            <span className="w-2.5 h-2.5 rounded-full bg-[#F5C451] shadow-xs shadow-[#F5C451]/80 mt-1" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-teal-100 tracking-tight">
            {isRtl ? 'أهلاً بك في عالم هلا' : 'Welcome to Hala'}
          </h2>

          <p className="text-xs sm:text-sm text-teal-100/85 leading-relaxed font-medium max-w-xs mx-auto">
            {isRtl
              ? 'مساحة راقية تجمع أحاديثك، لحظاتك، ومكالماتك بكل سهولة وأمان.'
              : 'A refined space for your conversations, moments, and calls.'}
          </p>
        </div>
      </main>

      {/* Bottom CTA Button */}
      <footer className="relative z-20 w-full max-w-sm mx-auto pb-4">
        <button
          type="button"
          onClick={onGetStarted}
          disabled={isVerifyingSession}
          className={`w-full h-14 sm:h-15 rounded-2xl bg-[#F5C451] hover:bg-[#FAD67B] text-[#04472B] font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-black/25 active:scale-[0.98] transition-all cursor-pointer group border border-[#F5C451]/80 ${
            isVerifyingSession ? 'opacity-80 cursor-wait' : ''
          }`}
        >
          {isVerifyingSession ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin text-[#04472B]" />
              <span className="font-extrabold">{isRtl ? 'جارٍ التحقق من الجلسة…' : 'Checking session…'}</span>
            </>
          ) : (
            <>
              <Smartphone className="w-5 h-5 text-[#04472B]" />
              <span className="font-black text-base tracking-wide">{isRtl ? 'ابدأ الآن (رقم الهاتف)' : 'Get Started with Phone'}</span>
              {isRtl ? (
                <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1 stroke-[2.5]" />
              ) : (
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1 stroke-[2.5]" />
              )}
            </>
          )}
        </button>

        {onEmailLogin && (
          <button
            type="button"
            onClick={onEmailLogin}
            disabled={isVerifyingSession}
            className="w-full mt-3 h-12 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm flex items-center justify-center gap-2 border border-white/20 transition-all cursor-pointer"
          >
            <Mail className="w-4 h-4 text-[#F5C451]" />
            <span className="font-bold">{isRtl ? 'تسجيل الدخول بالبريد المرتبط' : 'Sign in with Linked Email'}</span>
          </button>
        )}
      </footer>
    </div>
  );
};

