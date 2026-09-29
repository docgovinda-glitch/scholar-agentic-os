import { Component, type ErrorInfo, type ReactNode } from "react";
import ScholarCoreLogo from "./ScholarCoreLogo";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error in React tree:", error, errorInfo);

    // Auto-reload on dynamic import / chunk fetch errors caused by deployment updates
    const isChunkError =
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("Importing a module script failed") ||
      error.message?.includes("error loading dynamically imported module");

    if (isChunkError && typeof window !== "undefined") {
      const storageKey = "scholar_chunk_reload_retry";
      const lastRetry = sessionStorage.getItem(storageKey);
      if (!lastRetry) {
        sessionStorage.setItem(storageKey, "1");
        if ("caches" in window) {
          caches.keys().then((names) => {
            for (const name of names) caches.delete(name);
          });
        }
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.clear();
      } catch {}
      window.location.reload();
    }
  };

  private handleFullReset = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.clear();
        sessionStorage.clear();
        if ("caches" in window) {
          caches.keys().then((names) => {
            for (const name of names) caches.delete(name);
          });
        }
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) registration.unregister();
          });
        }
      } catch {}
      window.location.href = "/";
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas,#F7F5F0)] dark:bg-[#121212] px-4 py-12 text-slate-900 dark:text-slate-100 font-sans">
          <div className="max-w-md w-full bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-neutral-800 rounded-3xl p-8 shadow-xl text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 dark:bg-white flex items-center justify-center mb-6 shadow-sm">
              <ScholarCoreLogo size="md" className="text-white dark:text-slate-900" />
            </div>

            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
              Workspace encountered an issue
            </h1>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mb-6 leading-relaxed">
              Scholar Core encountered an unexpected issue while loading this view. You can reload to reconnect your workspace session.
            </p>

            {this.state.error && (
              <div className="w-full mb-6 p-3 rounded-xl bg-slate-50 dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800 text-left overflow-x-auto text-[11px] font-mono text-slate-600 dark:text-neutral-400">
                <div className="font-semibold text-rose-500 dark:text-rose-400">
                  {this.state.error.message || String(this.state.error)}
                </div>
                {this.state.error.stack && (
                  <details className="mt-2 text-[10px] text-slate-500 dark:text-neutral-500">
                    <summary className="cursor-pointer hover:underline">View call stack trace</summary>
                    <pre className="mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono text-[10px] text-slate-700 dark:text-neutral-300">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 rounded-full text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-xs"
              >
                Reload Workspace
              </button>
              <button
                type="button"
                onClick={this.handleFullReset}
                className="py-2.5 px-4 rounded-full text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Clear Cache & Restart
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
