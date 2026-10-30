import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from "react";
import AriaLiveAnnouncer, { announcePolite } from "./AriaLiveAnnouncer";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
}

interface ConfirmContextValue {
  confirm: (optionsOrMessage: string | ConfirmDialogOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// Non-hook imperative global dispatchers for headless/utility callbacks
let globalShowToast: ((message: string, variant?: ToastVariant, duration?: number) => void) | null = null;
let globalRequestConfirm: ((optionsOrMessage: string | ConfirmDialogOptions) => Promise<boolean>) | null = null;

export function showAppToast(
  message: string,
  variant: ToastVariant = "info",
  duration = 4000
): void {
  if (globalShowToast) {
    globalShowToast(message, variant, duration);
  } else {
    // Graceful fallback for non-browser or unmounted test environments
    if (typeof console !== "undefined") {
      if (variant === "error") console.error("[AppToast]", message);
      else if (variant === "warning") console.warn("[AppToast]", message);
      else console.log("[AppToast]", message);
    }
  }
}

export function requestAppConfirm(
  optionsOrMessage: string | ConfirmDialogOptions
): Promise<boolean> {
  if (globalRequestConfirm) {
    return globalRequestConfirm(optionsOrMessage);
  }
  // Default to non-blocking confirmation if invoked before provider mounts
  return Promise.resolve(true);
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: showAppToast,
      showSuccess: (msg, dur) => showAppToast(msg, "success", dur),
      showError: (msg, dur) => showAppToast(msg, "error", dur),
      showWarning: (msg, dur) => showAppToast(msg, "warning", dur),
      showInfo: (msg, dur) => showAppToast(msg, "info", dur),
    };
  }
  return context;
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) {
    return {
      confirm: requestAppConfirm,
    };
  }
  return context;
}

interface ConfirmDialogState extends ConfirmDialogOptions {
  isOpen: boolean;
  resolve: (value: boolean) => void;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info", duration = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, variant, duration }]);
      announcePolite(`${variant.toUpperCase()}: ${message}`);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const showSuccess = useCallback((msg: string, d?: number) => showToast(msg, "success", d), [showToast]);
  const showError = useCallback((msg: string, d?: number) => showToast(msg, "error", d), [showToast]);
  const showWarning = useCallback((msg: string, d?: number) => showToast(msg, "warning", d), [showToast]);
  const showInfo = useCallback((msg: string, d?: number) => showToast(msg, "info", d), [showToast]);

  const confirm = useCallback((optionsOrMessage: string | ConfirmDialogOptions): Promise<boolean> => {
    const options: ConfirmDialogOptions =
      typeof optionsOrMessage === "string"
        ? { message: optionsOrMessage }
        : optionsOrMessage;

    return new Promise<boolean>((resolve) => {
      setConfirmState({
        ...options,
        isOpen: true,
        resolve: (val: boolean) => {
          setConfirmState(null);
          resolve(val);
        },
      });
    });
  }, []);

  // Sync imperative helpers to provider instances
  useEffect(() => {
    globalShowToast = showToast;
    globalRequestConfirm = confirm;
    return () => {
      globalShowToast = null;
      globalRequestConfirm = null;
    };
  }, [showToast, confirm]);

  // Focus management for confirm dialog
  useEffect(() => {
    if (confirmState?.isOpen) {
      if (confirmState.variant === "danger") {
        cancelBtnRef.current?.focus();
      } else {
        confirmBtnRef.current?.focus();
      }
    }
  }, [confirmState?.isOpen, confirmState?.variant]);

  // Escape key cancels confirmation modal
  useEffect(() => {
    if (!confirmState?.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        confirmState.resolve(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmState]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      <ConfirmContext.Provider value={{ confirm }}>
        {children}
        <AriaLiveAnnouncer />

        {/* Accessible Toast Notification Portal */}
        <div
          role="region"
          aria-label="Notifications"
          className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0 pointer-events-none"
        >
          {toasts.map((toast) => {
            const isAlert = toast.variant === "error" || toast.variant === "warning";
            const borderCls =
              toast.variant === "error"
                ? "border-[color:var(--state-danger)] bg-[color:var(--surface-raised)]"
                : toast.variant === "warning"
                ? "border-[color:var(--state-warning)] bg-[color:var(--surface-raised)]"
                : toast.variant === "success"
                ? "border-[color:var(--state-success)] bg-[color:var(--surface-raised)]"
                : "border-[color:var(--border-control)] bg-[color:var(--surface-raised)]";

            const iconCls =
              toast.variant === "error"
                ? "text-[color:var(--state-danger)]"
                : toast.variant === "warning"
                ? "text-[color:var(--state-warning)]"
                : toast.variant === "success"
                ? "text-[color:var(--state-success)]"
                : "text-[color:var(--accent)]";

            return (
              <div
                key={toast.id}
                role={isAlert ? "alert" : "status"}
                data-testid="app-toast"
                className={`pointer-events-auto rounded-xl p-3.5 shadow-xl border ${borderCls} flex items-start gap-3 transition-all animate-fade-in`}
              >
                <div className={`mt-0.5 shrink-0 ${iconCls}`}>
                  {toast.variant === "success" && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {toast.variant === "error" && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  {toast.variant === "warning" && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  {toast.variant === "info" && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 text-xs text-[color:var(--text-primary)] font-medium leading-relaxed">
                  {toast.message}
                </div>

                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  aria-label="Close notification"
                  className="shrink-0 p-1 rounded-md text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {/* Accessible Confirm Modal Dialog */}
        {confirmState?.isOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
            className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) confirmState.resolve(false);
            }}
          >
            <div
              className="relative w-full max-w-md rounded-2xl bg-[color:var(--surface-raised)] p-6 shadow-2xl border border-[color:var(--border-control)] space-y-4"
              data-testid="confirm-dialog"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    confirmState.variant === "danger"
                      ? "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]"
                      : "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 id="confirm-dialog-title" className="text-base font-bold text-[color:var(--text-primary)]">
                    {confirmState.title || (confirmState.variant === "danger" ? "Confirm Action" : "Please Confirm")}
                  </h3>
                  <p id="confirm-dialog-desc" className="text-xs text-[color:var(--text-muted)] mt-0.5">
                    {confirmState.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[color:var(--border-subtle)]">
                <button
                  ref={cancelBtnRef}
                  type="button"
                  data-testid="confirm-dialog-cancel"
                  onClick={() => confirmState.resolve(false)}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] transition-colors cursor-pointer"
                >
                  {confirmState.cancelLabel || "Cancel"}
                </button>
                <button
                  ref={confirmBtnRef}
                  type="button"
                  data-testid="confirm-dialog-confirm"
                  onClick={() => confirmState.resolve(true)}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer text-[color:var(--text-inverse)] shadow-sm ${
                    confirmState.variant === "danger"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-[color:var(--accent)] hover:opacity-90"
                  }`}
                >
                  {confirmState.confirmLabel || "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export default FeedbackProvider;
