import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Language } from '../types';

interface WelcomeScreenProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onGetStarted: () => void;
  onOpenTerms: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  language,
  onLanguageChange,
  onGetStarted,
  onOpenTerms,
}) => {
  const [taglineIndex, setTaglineIndex] = useState(0);

  // Taglines alternating every 2.2 seconds: "هلا فيك" (Arabic) / "Say hala." (English)
  useEffect(() => {
    const timer = setInterval(() => {
      setTaglineIndex((prev) => (prev + 1) % 2);
    }, 2200);

    return () => clearInterval(timer);
  }, []);

  const currentTagline = taglineIndex === 0 ? 'هلا فيك' : 'Say hala.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: language === 'ar' ? 40 : -40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full h-full flex flex-col justify-between px-6 py-8 min-h-[580px] bg-slate-50 text-slate-900 overflow-y-auto"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Top Header & Language Toggle Pills */}
      <div className="w-full flex justify-center pt-2">
        <div className="inline-flex items-center p-1 bg-white rounded-full border border-slate-200 shadow-sm">
          {/* Arabic Button */}
          <button
            type="button"
            onClick={() => onLanguageChange('ar')}
            className={`px-4 py-2 text-sm rounded-full transition-all duration-200 min-h-[44px] min-w-[84px] font-medium flex items-center justify-center cursor-pointer ${
              language === 'ar'
                ? 'bg-[#087F75]/15 text-[#087F75] font-semibold border border-[#087F75]/40 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            العربية
          </button>

          {/* English Button */}
          <button
            type="button"
            onClick={() => onLanguageChange('en')}
            className={`px-4 py-2 text-sm rounded-full transition-all duration-200 min-h-[44px] min-w-[84px] font-medium flex items-center justify-center cursor-pointer ${
              language === 'en'
                ? 'bg-[#087F75]/15 text-[#087F75] font-semibold border border-[#087F75]/40 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Main Hero Content */}
      <div className="flex-1 flex flex-col items-center justify-center my-8 text-center">
        {/* Static App Logo: Coral #087F75 rounded square 96px */}
        <motion.div
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="w-[96px] h-[96px] rounded-[24px] bg-[#087F75] flex items-center justify-center shadow-lg shadow-[#087F75]/20 mb-5 relative"
        >
          <span className="text-white text-4xl font-extrabold pb-1 font-arabic select-none">
            هلا
          </span>
        </motion.div>

        {/* App Name "Hala" */}
        <h1 className="text-[18px] font-medium text-slate-800 tracking-tight mb-2">
          Hala
        </h1>

        {/* Alternating Tagline (fade transition every 2.2s) */}
        <div className="h-8 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentTagline}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="text-slate-500 font-normal text-base text-center"
            >
              {currentTagline}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Action Area */}
      <div className="w-full flex flex-col items-center gap-4 pt-4">
        {/* Primary Button: Coral #087F75, 44px+ height, full width */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onGetStarted}
          className="w-full h-[52px] min-h-[44px] bg-[#087F75] hover:bg-[#06685F] text-white font-semibold text-base rounded-2xl shadow-md shadow-[#087F75]/20 flex items-center justify-center transition-colors cursor-pointer"
        >
          {language === 'ar' ? 'ابدأ الآن' : 'Get started'}
        </motion.button>

        {/* Small muted text at bottom */}
        <button
          type="button"
          onClick={onOpenTerms}
          className="text-xs text-slate-400 hover:text-slate-600 text-center leading-relaxed transition-colors px-2 cursor-pointer focus:outline-hidden"
        >
          {language === 'ar'
            ? 'بالمتابعة، فإنك توافق على الشروط وسياسة الخصوصية الخاصة بنا'
            : 'By continuing you agree to our terms and privacy policy'}
        </button>
      </div>
    </motion.div>
  );
};
