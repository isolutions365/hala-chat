import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    deferredPWAInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export interface PWAInstallState {
  canInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && window.deferredPWAInstallPrompt) {
      return window.deferredPWAInstallPrompt;
    }
    return null;
  });

  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isNavigatorStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return isStandalone || isNavigatorStandalone;
  });

  const isIOS = typeof window !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.deferredPWAInstallPrompt && !deferredPrompt) {
      setDeferredPrompt(window.deferredPWAInstallPrompt);
    }

    // Check standalone state changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
        window.deferredPWAInstallPrompt = null;
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.deferredPWAInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      window.deferredPWAInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [deferredPrompt]);

  const install = useCallback(async () => {
    const activePrompt = deferredPrompt || (typeof window !== 'undefined' ? window.deferredPWAInstallPrompt : null);
    if (!activePrompt) {
      return 'unavailable';
    }

    try {
      await activePrompt.prompt();
      const choice = await activePrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      if (typeof window !== 'undefined') {
        window.deferredPWAInstallPrompt = null;
      }
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }, [deferredPrompt]);

  return {
    canInstall: Boolean(deferredPrompt) || Boolean(typeof window !== 'undefined' && window.deferredPWAInstallPrompt) || (isIOS && !isInstalled),
    isInstalled,
    isIOS: Boolean(isIOS),
    install,
  };
}
