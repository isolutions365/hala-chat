import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const COLORS = [
  '#D85A30', // coral
  '#0F6E56', // teal
  '#534AB7', // purple
  '#993556', // pink
  '#185FA5', // blue
  '#854F0B', // amber
];

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [colorIndex, setColorIndex] = useState(0);

  // Alternate text every 1.8 seconds and cycle background color
  useEffect(() => {
    const textInterval = setInterval(() => {
      setColorIndex((prev) => (prev + 1) % COLORS.length);
    }, 1800);

    return () => clearInterval(textInterval);
  }, []);

  // Auto-navigate after 3 seconds
  useEffect(() => {
    const navTimer = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => clearTimeout(navTimer);
  }, [onComplete]);

  const currentWord = colorIndex % 2 === 0 ? 'هلا' : 'Hello';
  const isArabic = currentWord === 'هلا';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, backgroundColor: COLORS[colorIndex] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      onClick={onComplete}
      className="fixed inset-0 w-full h-full flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden z-50"
    >
      {/* Centered Logo Container: 140px, border-radius 32px */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-[140px] h-[140px] rounded-[32px] bg-white/95 backdrop-blur-md shadow-2xl flex items-center justify-center relative border border-white/20"
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={currentWord}
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.92 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={`text-center font-bold text-slate-900 tracking-tight leading-none ${
              isArabic ? 'text-4xl font-arabic font-extrabold pb-1' : 'text-3xl font-sans font-extrabold'
            }`}
            style={{ color: COLORS[colorIndex] }}
          >
            {currentWord}
          </motion.span>
        </AnimatePresence>
      </motion.div>

      {/* Progress dots indicator */}
      <div className="absolute bottom-10 flex items-center gap-1.5 opacity-80">
        <motion.div
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-2 h-2 rounded-full bg-white"
        />
        <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
        <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
      </div>
    </motion.div>
  );
};
