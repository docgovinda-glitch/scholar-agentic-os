import {
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
  /** Asks for one line of text (an in-app replacement for window.prompt). */
  input?: { label: string; defaultValue?: string };
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
}

export interface PromptDialogOptions {
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
}

interface ConfirmContextValue {
  confirm: (optionsOrMessage: string | ConfirmDialogOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// Non-hook imperative global dispatchers for headless/utility callbacks
let globalShowToast: ((message: string, variant?: ToastVariant, duration?: number) => void) | null = null;
let globalRequestConfirm: ((optionsOrMessage: string | ConfirmDialogOptions) => Promise<boolean>) | null = null;
// The text typed into the most recent prompt dialog, read when it resolves.
let lastPromptValue = "";

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

/** In-app text prompt: resolves to the trimmed text, or null when cancelled or empty. */
export async function requestAppPrompt(options: PromptDialogOptions): Promise<string | null> {
  if (!globalRequestConfirm) return null;
  lastPromptValue = options.defaultValue ?? "";
  const ok = await globalRequestConfirm({
    title: options.title,
    message: "",
    confirmLabel: options.confirmLabel ?? "Save",
    variant: "primary",
    input: { label: options.label, defaultValue: options.defaultValue },
  });
  const value = lastPromptValue.trim();
  return ok && value ? value : null;
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

  const promptInputRef = useRef<HTMLInputElement>(null);
  // Focus management for confirm dialog
  useEffect(() => {
    if (confirmState?.isOpen && confirmState.input) {
      promptInputRef.current?.focus();
      promptInputRef.current?.select();
    } else if (confirmState?.isOpen) {
      if (confirmState.variant === "danger") {
        cancelBtnRef.current?.focus();
      } else {
        confirmBtnRef.current?.focus();
      }
    }
  }, [confirmState?.isOpen, confirmState?.variant, confirmState?.input]);

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
          data-testid="toast-region"
          // Phones: top of the screen below the notch, full width with a gutter, clear of the
          // prompt bar, keyboard and bottom docks. From 640px: bottom-right, as before.
          className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[9999] mx-auto flex w-full max-w-sm flex-col gap-2.5 px-4 pointer-events-none sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-[calc(env(safe-area-inset-bottom)+1rem)] sm:mx-0 sm:px-0"
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
              {confirmState.input ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    confirmState.resolve(true);
                  }}
                  className="space-y-3"
                >
                  <h3 id="confirm-dialog-title" className="text-base font-bold text-[color:var(--text-primary)]">
                    {confirmState.title}
                  </h3>
                  <label className="block space-y-1.5">
                    <span id="confirm-dialog-desc" className="block text-xs font-semibold text-[color:var(--text-secondary)]">
                      {confirmState.input.label}
                    </span>
                    <input
                      ref={promptInputRef}
                      defaultValue={confirmState.input.defaultValue}
                      onChange={(e) => {
                        lastPromptValue = e.target.value;
                      }}
                      className="w-full rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
                    />
                  </label>
                </form>
              ) : (
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
              )}

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
