import React from "react";

interface AiExhaustedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAiAccess: () => void;
  errorMessage?: string | null;
}

export default function AiExhaustedModal({
  isOpen,
  onClose,
  onOpenAiAccess,
  errorMessage,
}: AiExhaustedModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-scale-in">
        {/* Warning Icon & Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] border border-[color:var(--state-warning)]/30 flex items-center justify-center shrink-0 text-xl font-bold">
            ⚠️
          </div>
          <div>
            <h3 className="text-base font-bold text-[color:var(--text-primary)]">
              All Configured AI Services Are Unavailable
            </h3>
            <p className="text-xs text-[color:var(--text-secondary)] mt-1">
              Your workflow and current results are completely safe.
            </p>
          </div>
        </div>

        {/* Informational Body */}
        <div className="p-3.5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-primary)] leading-relaxed space-y-2">
          <p>
            All available AI providers or API keys configured on this workspace have either exceeded their rate/quota limits, failed authentication, or are unreachable.
          </p>
          {errorMessage && (
            <p className="font-mono text-[11px] text-[color:var(--state-danger)] border-t border-[color:var(--border-subtle)] pt-2">
              Details: {errorMessage}
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
            Dismiss & Keep State
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAiAccess();
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>⚙️</span> Configure AI Access
          </button>
        </div>
      </div>
    </div>
  );
}
