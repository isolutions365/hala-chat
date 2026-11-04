import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [isArabic, setIsArabic] = useState(true);

  // Alternate tagline between Arabic and English
  useEffect(() => {
    const textInterval = setInterval(() => {
      setIsArabic((prev) => !prev);
    }, 1500);

    return () => clearInterval(textInterval);
  }, []);

  // Auto-navigate after 2.8 seconds
  useEffect(() => {
    const navTimer = setTimeout(() => {
      onComplete();
    }, 2800);

    return () => clearTimeout(navTimer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      onClick={onComplete}
      className="fixed inset-0 w-full h-full flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden z-50 p-6 bg-gradient-to-b from-[#087F75] via-[#066355] to-[#04472B]"
    >
      {/* Subtle 8-point geometric star background decoration */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden flex items-center justify-center opacity-10">
        <svg
          className="w-[120%] max-w-[600px] h-auto text-white"
          viewBox="0 0 400 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g stroke="currentColor" strokeWidth="1.5">
            <rect x="100" y="100" width="200" height="200" rx="4" />
            <rect x="100" y="100" width="200" height="200" rx="4" transform="rotate(45 200 200)" />
            <circle cx="200" cy="200" r="140" strokeDasharray="4 6" strokeWidth="1" />
          </g>
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-xs text-center">
        {/* Centered New Brand Icon: 130px, border-radius 32px */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative group"
        >
          <div className="absolute -inset-2 bg-gradient-to-r from-[#F5C451]/30 via-teal-300/20 to-[#F5C451]/30 rounded-[38px] blur-lg opacity-70" />
          <div className="relative w-[130px] h-[130px] rounded-[32px] overflow-hidden shadow-2xl border-2 border-white/30 bg-[#04472B]">
            <img
              src="/icons/icon-512.png"
              alt="Hala Logo"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
        </motion.div>

        {/* Wordmark with Golden Dot Accent */}
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-sm font-sans">
            {isArabic ? 'هلا' : 'Hala'}
          </h1>
          <span className="w-2 h-2 rounded-full bg-[#F5C451] shadow-xs shadow-[#F5C451]/80 mt-1" />
        </div>

        {/* Tagline: Your space. Your way. / مساحتك.. بطريقتك. */}
        <AnimatePresence mode="wait">
          <motion.p
            key={isArabic ? 'ar' : 'en'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className={`text-teal-100 text-sm font-bold tracking-wide drop-shadow-md px-3.5 py-1.5 rounded-full bg-black/20 backdrop-blur-xs border border-white/15 ${
              isArabic ? 'font-arabic' : 'font-sans'
            }`}
          >
            {isArabic ? 'مساحتك.. بطريقتك.' : 'Your space. Your way.'}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress dots indicator */}
      <div className="absolute bottom-10 flex items-center gap-1.5 opacity-80 z-10">
        <motion.div
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-2 h-2 rounded-full bg-[#F5C451]"
        />
        <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
        <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
      </div>
    </motion.div>
  );
};
