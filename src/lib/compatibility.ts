export interface FeatureFlag {
  key: string;
  label: string;
  supported: boolean;
  essential: boolean;
}

export interface CompatibilityReport {
  isCompatible: boolean;
  userAgent: string;
  chromeVersion: string | null;
  browserSummary: string;
  essentialFeatures: FeatureFlag[];
  optionalFeatures: FeatureFlag[];
  missingEssential: FeatureFlag[];
}

function detectCssColorMix(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  try {
    return CSS.supports('color', 'color-mix(in srgb, #000 50%, #fff)');
  } catch {
    return false;
  }
}

function detectCssCustomProperties(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  try {
    return CSS.supports('--hala-test', '0');
  } catch {
    return false;
  }
}

function detectCssLayer(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof (window as any).CSSLayerBlockRule !== 'undefined') {
      return true;
    }
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
      if (CSS.supports('at-rule(@layer)')) {
        return true;
      }
    }
    if (typeof document !== 'undefined' && document.head) {
      const style = document.createElement('style');
      style.textContent = '@layer hala_probe { .hala_probe { color: red; } }';
      document.head.appendChild(style);
      const hasRules = Boolean(style.sheet && style.sheet.cssRules && style.sheet.cssRules.length > 0);
      style.remove();
      return hasRules;
    }
  } catch {
    return false;
  }
  return false;
}

export function detectChromeVersion(ua: string): string | null {
  const match = ua.match(/(?:Chrome|CriOS|EdgA|Edg)\/(\d+(?:\.\d+)?)/i);
  return match ? match[1] : null;
}

export function detectBrowserSummary(ua: string): string {
  const chromeMatch = ua.match(/Chrome\/(\d+(?:\.\d+)?)/i);
  if (chromeMatch) {
    const isWv = /;\s*wv\)/i.test(ua);
    return isWv ? `Android WebView (Chrome ${chromeMatch[1]})` : `Chrome ${chromeMatch[1]}`;
  }
  const criosMatch = ua.match(/CriOS\/(\d+(?:\.\d+)?)/i);
  if (criosMatch) return `Chrome iOS ${criosMatch[1]}`;
  const safariMatch = ua.match(/Version\/(\d+(?:\.\d+)?).*Safari/i);
  if (safariMatch) return `Safari ${safariMatch[1]}`;
  const firefoxMatch = ua.match(/Firefox\/(\d+(?:\.\d+)?)/i);
  if (firefoxMatch) return `Firefox ${firefoxMatch[1]}`;
  return 'Unknown Browser';
}

export function checkCompatibility(): CompatibilityReport {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  const chromeVersion = detectChromeVersion(userAgent);
  const browserSummary = detectBrowserSummary(userAgent);

  const essentialFeatures: FeatureFlag[] = [
    {
      key: 'cssColorMix',
      label: 'CSS color-mix()',
      supported: detectCssColorMix(),
      essential: true,
    },
    {
      key: 'cssLayer',
      label: 'CSS @layer',
      supported: detectCssLayer(),
      essential: true,
    },
    {
      key: 'cssCustomProperties',
      label: 'CSS Custom Properties',
      supported: detectCssCustomProperties(),
      essential: true,
    },
    {
      key: 'intersectionObserver',
      label: 'IntersectionObserver',
      supported: typeof IntersectionObserver !== 'undefined',
      essential: true,
    },
    {
      key: 'resizeObserver',
      label: 'ResizeObserver',
      supported: typeof ResizeObserver !== 'undefined',
      essential: true,
    },
    {
      key: 'promiseAllSettled',
      label: 'Promise.allSettled',
      supported: typeof Promise !== 'undefined' && typeof Promise.allSettled === 'function',
      essential: true,
    },
    {
      key: 'structuredCloneFree',
      label: 'structuredClone-free runtime',
      supported: true,
      essential: true,
    },
  ];

  const optionalFeatures: FeatureFlag[] = [
    {
      key: 'cryptoRandomUUID',
      label: 'crypto.randomUUID (optional)',
      supported: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function',
      essential: false,
    },
    {
      key: 'cryptoGetRandomValues',
      label: 'crypto.getRandomValues (optional)',
      supported: typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function',
      essential: false,
    },
    {
      key: 'structuredClone',
      label: 'structuredClone (optional)',
      supported: typeof structuredClone === 'function',
      essential: false,
    },
    {
      key: 'serviceWorker',
      label: 'Service Worker (optional)',
      supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      essential: false,
    },
    {
      key: 'clipboard',
      label: 'Clipboard API (optional)',
      supported: typeof navigator !== 'undefined' && Boolean(navigator.clipboard),
      essential: false,
    },
  ];

  const missingEssential = essentialFeatures.filter((f) => !f.supported);

  return {
    isCompatible: missingEssential.length === 0,
    userAgent,
    chromeVersion,
    browserSummary,
    essentialFeatures,
    optionalFeatures,
    missingEssential,
  };
}

export function formatDiagnosticsText(report: CompatibilityReport = checkCompatibility()): string {
  const lines = [
    `Browser: ${report.browserSummary}`,
    `Chrome Version: ${report.chromeVersion || 'N/A'}`,
    `User Agent: ${report.userAgent}`,
    '',
    'Essential Features:',
    ...report.essentialFeatures.map((f) => `- ${f.label}: ${f.supported ? 'YES' : 'NO'}`),
    '',
    'Optional Features:',
    ...report.optionalFeatures.map((f) => `- ${f.label}: ${f.supported ? 'YES' : 'NO'}`),
  ];
  return lines.join('\n');
}
