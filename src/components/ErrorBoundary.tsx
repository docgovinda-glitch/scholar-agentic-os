import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Unhandled exception caught:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl space-y-4 max-w-2xl mx-auto my-12 shadow-sm font-sans">
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle className="w-6 h-6 text-red-400 shrink-0" />
            <div>
              <h2 className="text-sm font-bold">
                Workspace Render Boundary Breach
              </h2>
              <p className="text-[11px] text-red-400/90 mt-0.5">
                The application encountered an unexpected runtime error during UI rendering or AI stream consumption.
              </p>
            </div>
          </div>

          <div className="bg-[color:var(--color-navy-1)] p-4 rounded-xl border border-red-500/20 font-mono text-[10px] text-red-300 overflow-x-auto max-h-48 leading-relaxed">
            {this.state.error?.stack || this.state.error?.message || "Unknown error."}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors shadow-sm"
            >
              Reinitialize Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
