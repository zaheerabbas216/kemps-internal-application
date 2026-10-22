import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetSession = () => {
    try {
      localStorage.clear();
    } catch {
      // Ignore
    }
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6 font-sans">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700/60 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center text-3xl">
              ⚠️
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-100">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-400">
              An unexpected error occurred while loading this view. You can reload or reset your local session.
            </p>

            {this.state.error && (
              <div className="text-left bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs font-mono text-rose-300 break-words max-h-32 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 bg-primary hover:bg-primary/90 text-white font-medium text-sm rounded-xl transition-all duration-150 cursor-pointer shadow-md"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleResetSession}
                className="flex-1 py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm rounded-xl transition-all duration-150 cursor-pointer"
              >
                Reset Session & Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
