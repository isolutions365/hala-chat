import React from 'react';

interface FeatureErrorBoundaryProps {
  feature: string;
  children: React.ReactNode;
}

interface FeatureErrorBoundaryState {
  hasError: boolean;
}

export class FeatureErrorBoundary extends React.Component<FeatureErrorBoundaryProps, FeatureErrorBoundaryState> {
  state: FeatureErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): FeatureErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.feature}] Feature render error:`, error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const isRtl = document.documentElement.dir === 'rtl';
      return (
        <section role="alert" aria-live="assertive" dir={isRtl ? 'rtl' : 'ltr'}
          className="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {isRtl ? 'تعذر تحميل هذا القسم.' : `${this.props.feature} could not be loaded.`}
          </p>
          <button type="button" onClick={this.handleRetry}
            className="min-h-11 rounded-xl bg-[#087F75] px-5 py-2 text-sm font-bold text-white">
            {isRtl ? 'إعادة المحاولة' : 'Try again'}
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
