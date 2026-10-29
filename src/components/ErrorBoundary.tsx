import * as React from 'react';
import { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleCopy = () => {
    const errorDetails = `Error: ${this.state.error?.message || 'Unknown error'}\n\nStack:\n${
      this.state.error?.stack || ''
    }\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ''}`;
    navigator.clipboard?.writeText(errorDetails);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  private handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'An unexpected application error occurred.';
      const isConfigError =
        errorMessage.toLowerCase().includes('firebase') ||
        errorMessage.toLowerCase().includes('vite_firebase') ||
        errorMessage.toLowerCase().includes('environment');

      return (
        <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans dir-rtl" dir="rtl">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-fadeIn">
            {/* Header Icon */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">
                  {isConfigError ? 'خطأ في متغيرات البيئة (Firebase Config Error)' : 'حدث خطأ في التطبيق (Application Error)'}
                </h1>
                <p className="text-xs text-slate-400">
                  {isConfigError
                    ? 'تأكد من إضافة VITE_FIREBASE_* Environment Variables في Vercel'
                    : 'عذراً، حدث خطأ غير متوقع أثناء تشغيل التطبيق.'}
                </p>
              </div>
            </div>

            {/* Error Message Box */}
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs font-mono break-words leading-relaxed space-y-2">
              <p className="font-bold text-rose-300">تفاصيل الخطأ (Error Message):</p>
              <p className="select-text">{errorMessage}</p>
            </div>

            {/* Vercel Env Vars Help Box if config error */}
            {isConfigError && (
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                <p className="font-bold text-amber-300">متغيرات البيئة المطلوبة في Vercel Settings ➔ Environment Variables:</p>
                <ul className="list-disc list-inside space-y-1 text-[11px] font-mono text-amber-100/90 dir-ltr text-left">
                  <li>VITE_FIREBASE_API_KEY</li>
                  <li>VITE_FIREBASE_AUTH_DOMAIN</li>
                  <li>VITE_FIREBASE_PROJECT_ID</li>
                  <li>VITE_FIREBASE_STORAGE_BUCKET</li>
                  <li>VITE_FIREBASE_MESSAGING_SENDER_ID</li>
                  <li>VITE_FIREBASE_APP_ID</li>
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 rounded-2xl bg-[#087F75] hover:bg-[#06685e] text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة تحميل الصفحة (Reload)</span>
              </button>

              <button
                type="button"
                onClick={this.handleCopy}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {this.state.copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">تم النسخ!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-400" />
                    <span>نسخ تفاصيل الخطأ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
