import React from "react";
import { AlertTriangle, Settings, X } from "lucide-react";

export interface AllAiResourcesExhaustedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAiSettings: () => void;
  reason?: string;
}

export const AllAiResourcesExhaustedModal: React.FC<AllAiResourcesExhaustedModalProps> = ({
  isOpen,
  onClose,
  onOpenAiSettings,
  reason,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exhausted-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--surface-raised)] p-6 shadow-2xl border border-[var(--border-control)] space-y-4">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--state-warning-subtle)] text-[var(--state-warning)] border border-[var(--state-warning)]/30">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="exhausted-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
              All Available AI Resources Unavailable
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Your research state and inputs have been safely preserved.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-[var(--surface-canvas)] p-3 text-sm text-[var(--text-secondary)] border border-[var(--border-control)]">
          {reason || "All configured AI resources (local runtimes, free tiers, and BYOK credentials) are currently unreachable, exhausted, or rate-limited."}
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          To continue, check that your local model runner (Ollama/LM Studio) is running or configure an AI provider in AI Access settings.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg border border-[var(--border-control)] hover:bg-[var(--surface-inset)] transition-colors"
          >
            Keep Working Offline
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAiSettings();
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--text-inverse)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-lg shadow transition-colors"
          >
            <Settings className="w-4 h-4" />
            Open AI Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
