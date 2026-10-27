import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                                Types                                      */
/* -------------------------------------------------------------------------- */

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  id?: string;
  title?: string;
  duration?: number;
}

export interface ToastItem {
  id: string;
  message: string;
  title?: string;
  variant: ToastVariant;
  duration: number;
}

export interface ToastHelpers {
  info: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export interface ToastContextValue {
  toast: ToastHelpers;
  showToast: (message: string, variant?: ToastVariant, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger" | "warning";
}

export interface ConfirmContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

export type AriaLivePriority = "polite" | "assertive";

export interface AriaLiveContextValue {
  announce: (message: string, priority?: AriaLivePriority) => void;
}

/* -------------------------------------------------------------------------- */
/*                            Aria Live Announcer                             */
/* -------------------------------------------------------------------------- */

const AriaLiveContext = createContext<AriaLiveContextValue>({
  announce: () => {},
});

export function AriaLiveProvider({ children }: { children: ReactNode }) {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");

  const announce = useCallback((message: string, priority: AriaLivePriority = "polite") => {
    if (priority === "assertive") {
      setAssertiveMessage("");
      // Force screen reader re-trigger
      setTimeout(() => setAssertiveMessage(message), 50);
    } else {
      setPoliteMessage("");
      setTimeout(() => setPoliteMessage(message), 50);
    }
  }, []);

  return (
    <AriaLiveContext.Provider value={{ announce }}>
      {children}
      <div
        id="scholar-aria-polite"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only pointer-events-none select-none"
        data-testid="aria-live-polite"
      >
        {politeMessage}
      </div>
      <div
        id="scholar-aria-assertive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only pointer-events-none select-none"
        data-testid="aria-live-assertive"
      >
        {assertiveMessage}
      </div>
    </AriaLiveContext.Provider>
  );
}

export function useAriaAnnounce(): AriaLiveContextValue {
  return useContext(AriaLiveContext);
}

export function AriaLiveAnnouncer(): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only pointer-events-none select-none"
      data-testid="aria-live-announcer"
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                               Toast System                                 */
/* -------------------------------------------------------------------------- */

const ToastContext = createContext<ToastContextValue | null>(null);

let fallbackToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const { announce } = useAriaAnnounce();

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info", options?: ToastOptions): string => {
      const id = options?.id || `toast-${Date.now()}-${++fallbackToastId}`;
      const duration = options?.duration ?? (variant === "error" ? 6000 : 4000);
      const item: ToastItem = {
        id,
        message,
        title: options?.title,
        variant,
        duration,
      };

      setToasts((prev) => [...prev.filter((t) => t.id !== id), item]);

      // Screen-reader announcement
      announce(options?.title ? `${options.title}: ${message}` : message, variant === "error" ? "assertive" : "polite");

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }

      return id;
    },
    [announce, dismissToast]
  );

  const toastHelpers: ToastHelpers = React.useMemo(
    () => ({
      info: (msg, opts) => showToast(msg, "info", opts),
      success: (msg, opts) => showToast(msg, "success", opts),
      warning: (msg, opts) => showToast(msg, "warning", opts),
      error: (msg, opts) => showToast(msg, "error", opts),
      dismiss: dismissToast,
    }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toast: toastHelpers, showToast, dismissToast }}>
      {children}
      {/* Toast container */}
      <div
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none px-4 sm:px-0"
        data-testid="toast-container"
        aria-label="Notifications"
      >
        {toasts.map((t) => {
          const variantClasses = {
            info: "border-sky-500/30 bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-lg shadow-sky-500/5",
            success: "border-emerald-500/30 bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-lg shadow-emerald-500/5",
            warning: "border-amber-500/30 bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-lg shadow-amber-500/5",
            error: "border-rose-500/40 bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-lg shadow-rose-500/10",
          }[t.variant];

          const IconComponent = {
            info: Info,
            success: CheckCircle2,
            warning: AlertTriangle,
            error: AlertCircle,
          }[t.variant];

          const iconColor = {
            info: "text-sky-500 dark:text-sky-400",
            success: "text-emerald-500 dark:text-emerald-400",
            warning: "text-amber-500 dark:text-amber-400",
            error: "text-rose-500 dark:text-rose-400",
          }[t.variant];

          return (
            <div
              key={t.id}
              role={t.variant === "error" ? "alert" : "status"}
              aria-live={t.variant === "error" ? "assertive" : "polite"}
              data-testid="toast-item"
              data-variant={t.variant}
              data-testid-variant={`toast-${t.variant}`}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 ${variantClasses}`}
            >
              <IconComponent className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} aria-hidden="true" />
              <div className="flex-1 min-w-0 pr-1">
                {t.title && (
                  <h4 className="text-xs font-semibold text-[color:var(--text-primary)] mb-0.5 leading-snug">
                    {t.title}
                  </h4>
                )}
                <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed break-words">
                  {t.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Close notification"
                data-testid="toast-dismiss"
                className="compact-btn p-1 -mr-1 -mt-1 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-canvas)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastHelpers {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback for test runners or environments where ToastProvider is not yet mounted
    return {
      info: (msg) => { console.info("[Toast info]", msg); return ""; },
      success: (msg) => { console.log("[Toast success]", msg); return ""; },
      warning: (msg) => { console.warn("[Toast warning]", msg); return ""; },
      error: (msg) => { console.error("[Toast error]", msg); return ""; },
      dismiss: () => {},
    };
  }
  return ctx.toast;
}

/* -------------------------------------------------------------------------- */
/*                           Confirm Dialog System                            */
/* -------------------------------------------------------------------------- */

interface ActiveConfirm {
  options: ConfirmDialogOptions;
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [activeConfirm, setActiveConfirm] = useState<ActiveConfirm | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setActiveConfirm({ options, resolve });
    });
  }, []);

  const handleClose = useCallback(
    (result: boolean) => {
      if (activeConfirm) {
        activeConfirm.resolve(result);
        setActiveConfirm(null);
      }
    },
    [activeConfirm]
  );

  // Focus management and keyboard accessibility
  useEffect(() => {
    if (!activeConfirm) return;

    // Default focus to cancel button for destructive actions, confirm button otherwise
    const timer = setTimeout(() => {
      if (activeConfirm.options.variant === "danger") {
        cancelButtonRef.current?.focus();
      } else {
        confirmButtonRef.current?.focus();
      }
    }, 20);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose(false);
      } else if (e.key === "Tab") {
        // Trap focus inside modal
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeConfirm, handleClose]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {activeConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          data-testid="confirm-dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
            data-testid="confirm-dialog"
            className="w-full max-w-md rounded-2xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] p-6 shadow-2xl text-[color:var(--text-primary)] transition-all scale-100"
          >
            <h3
              id="confirm-dialog-title"
              className="text-base font-semibold text-[color:var(--text-primary)] mb-2"
            >
              {activeConfirm.options.title}
            </h3>
            <p
              id="confirm-dialog-desc"
              className="text-xs sm:text-sm text-[color:var(--text-secondary)] leading-relaxed mb-6"
            >
              {activeConfirm.options.message}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                ref={cancelButtonRef}
                type="button"
                data-testid="confirm-dialog-cancel"
                onClick={() => handleClose(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-raised)] transition-colors cursor-pointer"
              >
                {activeConfirm.options.cancelLabel || "Cancel"}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                data-testid="confirm-dialog-confirm"
                onClick={() => handleClose(true)}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-sm ${
                  activeConfirm.options.variant === "danger"
                    ? "bg-[color:var(--state-danger)] text-white hover:opacity-90"
                    : "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)]"
                }`}
              >
                {activeConfirm.options.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (options: ConfirmDialogOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Test/isolated fallback
    return async () => true;
  }
  return ctx.confirm;
}

/* -------------------------------------------------------------------------- */
/*                          Unified Feedback Provider                         */
/* -------------------------------------------------------------------------- */

export function FeedbackProvider({ children }: { children: ReactNode }) {
  return (
    <AriaLiveProvider>
      <ToastProvider>
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </ToastProvider>
    </AriaLiveProvider>
  );
}
