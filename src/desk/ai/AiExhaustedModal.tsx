
import { PlugZap } from "lucide-react";

interface AiExhaustedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAiAccess: () => void;
  errorMessage?: string | null;
  /** Heading; defaults to the every-provider-failed case. */
  title?: string;
  /** Explanation under the heading. */
  explanation?: string;
}

export default function AiExhaustedModal({
  isOpen,
  onClose,
  onOpenAiAccess,
  errorMessage,
  title = "Your AI services are unavailable",
  explanation = "Every AI you connected is out of quota, rejected its key, or could not be reached.",
}: AiExhaustedModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-exhausted-title"
      data-testid="ai-unavailable-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-[color:var(--surface-raised)] text-left border border-[color:var(--border-default)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-scale-in">
        {/* Warning Icon & Header */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] flex items-center justify-center shrink-0" aria-hidden="true">
            <PlugZap className="w-5 h-5" />
          </div>
          <div>
            <h3 id="ai-exhausted-title" className="text-base font-bold text-[color:var(--text-primary)]">
              {title}
            </h3>
            <p className="text-xs text-[color:var(--text-secondary)] mt-1">
              Your work is saved.
            </p>
          </div>
        </div>

        {/* Informational Body */}
        <div className="p-3.5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-primary)] leading-relaxed space-y-2">
          <p>{explanation}</p>
          {/* Show the server's detail only when it adds something to the explanation. */}
          {errorMessage && !explanation.toLowerCase().includes(errorMessage.toLowerCase().slice(0, 30)) && !/connect an ai/i.test(errorMessage) && (
            <p className="text-xs text-[color:var(--text-secondary)] border-t border-[color:var(--border-subtle)] pt-2">
              {errorMessage}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] text-xs font-semibold border border-[color:var(--border-subtle)] transition-colors cursor-pointer"
          >
            Not now
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAiAccess();
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-[color:var(--text-inverse)] text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            Open AI Access
          </button>
        </div>
      </div>
    </div>
  );
}
