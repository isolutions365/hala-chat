import React, { useEffect, useRef, useState } from 'react';
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
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'HALA_GET_STARTED') {
        onGetStarted();
      } else if (event.data?.type === 'HALA_LANGUAGE_CHANGE' && event.data.lang) {
        onLanguageChange(event.data.lang);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onGetStarted, onLanguageChange]);

  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'HALA_SET_LANGUAGE', lang: language },
        '*'
      );
    }
  }, [language]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#071318] flex flex-col">
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#071318] text-white">
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 rounded-full border-4 border-teal-500/20 border-t-[#087F75] animate-spin"></div>
            <span className="absolute text-xl font-extrabold text-[#087F75]">هلا</span>
          </div>
          <p className="text-xs text-teal-200/70 tracking-widest uppercase font-semibold">
            {language === 'ar' ? 'جارٍ تحميل التطبيق…' : 'Loading Hala…'}
          </p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={`./welcome.html?lang=${language}`}
        title="Hala Welcome Screen"
        className={`w-full h-full border-none m-0 p-0 block flex-1 transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        style={{ minHeight: '100%', height: '100%' }}
        allow="autoplay"
        onLoad={() => setIsLoading(false)}
      />
    </div>
  );
};
