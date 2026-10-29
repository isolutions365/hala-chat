import React, { useEffect, useRef } from 'react';
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
      <iframe
        ref={iframeRef}
        src={`./welcome.html?lang=${language}`}
        title="Hala Welcome Screen"
        className="w-full h-full border-none m-0 p-0 block flex-1"
        style={{ minHeight: '100%', height: '100%' }}
        allow="autoplay"
      />
    </div>
  );
};
