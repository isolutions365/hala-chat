import React, { useState, useEffect, useRef } from 'react';
import { Language } from '../types';
import { Globe, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { TestVersionBanner } from './TestVersionBanner';

interface WelcomeScreenProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onGetStarted: () => void;
  onOpenTerms: () => void;
  isVerifyingSession?: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  language,
  onLanguageChange,
  onGetStarted,
  isVerifyingSession = false,
}) => {
  const isRtl = language === 'ar';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logoPulse, setLogoPulse] = useState(false);

  // Particle background animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const particles: Array<{ x: number; y: number; radius: number; vx: number; vy: number; alpha: number }> = [];
    const particleCount = 45;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2 + 1,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.6 + 0.2,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Subtle radial gradient background glow
      const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) * 0.8);
      grad.addColorStop(0, '#0a232b');
      grad.addColorStop(1, '#071318');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Draw floating particles
      ctx.fillStyle = '#087F75';
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(8, 127, 117, ${p.alpha})`;
        ctx.shadowColor = '#087F75';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleLogoClick = () => {
    setLogoPulse(true);
    setTimeout(() => setLogoPulse(false), 1000);
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="w-full h-full relative overflow-hidden bg-[#071318] text-white flex flex-col justify-between p-6 sm:p-10 select-none"
    >
      {/* Particle Canvas Background */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between w-full">
        <TestVersionBanner language={language} variant="pill" />

        {/* Language Dropdown / Toggle */}
        <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 shadow-lg">
          <Globe className="w-3.5 h-3.5 text-teal-400" />
          <button
            type="button"
            onClick={() => onLanguageChange(language === 'ar' ? 'en' : 'ar')}
            className="text-xs font-bold text-white hover:text-teal-300 transition-colors cursor-pointer"
          >
            {language === 'ar' ? 'English (EN)' : 'العربية (AR)'}
          </button>
        </div>
      </header>

      {/* Center Stage: Logo Tile & Tagline */}
      <main className="relative z-20 flex flex-col items-center justify-center text-center my-auto space-y-6">
        <div
          onClick={handleLogoClick}
          role="button"
          tabIndex={0}
          aria-label="Replay logo animation"
          className={`group relative w-32 h-32 sm:w-40 sm:h-40 rounded-3xl bg-gradient-to-br from-[#087F75] to-[#044c45] p-1 shadow-2xl cursor-pointer transition-transform duration-500 hover:scale-105 active:scale-95 ${
            logoPulse ? 'animate-bounce' : ''
          }`}
        >
          <div className="w-full h-full rounded-[22px] bg-[#071318] flex flex-col items-center justify-center p-4 relative overflow-hidden shadow-inner">
            <div className="absolute inset-0 bg-gradient-to-t from-teal-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-teal-400 to-emerald-300 tracking-tight">
              {isRtl ? 'هلا' : 'Hala'}
            </span>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-teal-300/80 font-bold uppercase tracking-widest">
              <span>{isRtl ? 'تواصل آمن' : 'Secure Chat'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 max-w-sm px-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {isRtl ? 'أهلاً بك في عالم هلا' : 'Welcome to Hala'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed font-medium">
            {isRtl
              ? 'مساحة تجمع أحاديثك، لحظاتك، ومكالماتك بكل سهولة وأمان.'
              : 'A secure space for your conversations, moments, and calls.'}
          </p>
        </div>
      </main>

      {/* Bottom CTA Button */}
      <footer className="relative z-20 w-full max-w-sm mx-auto pb-4">
        <button
          type="button"
          onClick={onGetStarted}
          disabled={isVerifyingSession}
          className={`w-full h-14 rounded-2xl bg-gradient-to-r from-[#087F75] to-teal-600 hover:from-[#06685e] hover:to-teal-700 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-3 shadow-xl shadow-teal-950/50 hover:shadow-2xl active:scale-[0.98] transition-all cursor-pointer group ${
            isVerifyingSession ? 'opacity-80 cursor-wait' : ''
          }`}
        >
          {isVerifyingSession ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin text-teal-200" />
              <span>{isRtl ? 'جارٍ التحقق من الجلسة…' : 'Checking session…'}</span>
            </>
          ) : (
            <>
              <span>{isRtl ? 'ابدأ الآن' : 'Get Started'}</span>
              {isRtl ? (
                <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
              ) : (
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              )}
            </>
          )}
        </button>
      </footer>
    </div>
  );
};
