import React, { useMemo, useState } from 'react';
import { checkCompatibility } from '../lib/compatibility';

interface CompatibilityGateProps {
  children: React.ReactNode;
}

const BYPASS_SESSION_KEY = 'hala.compatibilityBypassed';

export const CompatibilityGate: React.FC<CompatibilityGateProps> = ({ children }) => {
  const report = useMemo(() => checkCompatibility(), []);
  const [bypassed, setBypassed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(BYPASS_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (report.isCompatible || bypassed) {
    return <>{children}</>;
  }

  const handleContinueAnyway = () => {
    try {
      sessionStorage.setItem(BYPASS_SESSION_KEY, 'true');
    } catch {}
    setBypassed(true);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: '#071318',
        color: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        overflowY: 'auto',
        fontFamily: "'Cairo', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#0F222A',
          border: '1px solid #1E3A46',
          borderRadius: '20px',
          padding: '24px',
          boxSizing: 'border-box',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            backgroundColor: '#087F75',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '20px',
            marginBottom: '16px',
          }}
        >
          هلا
        </div>

        <p
          dir="ltr"
          style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            lineHeight: 1.5,
            fontWeight: 700,
            color: '#FFFFFF',
          }}
        >
          Your browser is out of date. Please update Chrome (or Android System WebView) from the Play Store
        </p>

        <p
          dir="rtl"
          style={{
            margin: '0 0 16px 0',
            fontSize: '15px',
            lineHeight: 1.65,
            fontWeight: 600,
            color: '#CBD5E1',
          }}
        >
          متصفحك قديم. يرجى تحديث Chrome (أو Android System WebView) من متجر Google Play
        </p>

        <div
          dir="ltr"
          style={{
            backgroundColor: '#071318',
            border: '1px solid #1E3A46',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '16px',
            fontSize: '12px',
            color: '#94A3B8',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: '#E2E8F0', marginBottom: '4px' }}>
            Detected browser: {report.browserSummary}
          </div>
          <div>
            Missing: {report.missingEssential.map((item) => item.label).join(', ')}
          </div>
        </div>

        <button
          type="button"
          onClick={handleContinueAnyway}
          style={{
            width: '100%',
            minHeight: '44px',
            padding: '12px 16px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: '#087F75',
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Continue anyway / المتابعة على أي حال
        </button>
      </div>
    </div>
  );
};
