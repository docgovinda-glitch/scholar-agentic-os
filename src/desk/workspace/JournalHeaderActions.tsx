import React from "react";
import { Activity, Library } from "lucide-react";

/**
 * The journal workspace's own controls, shown in the shared studio header:
 * words against the target, sources, the AI model, activity and the Vault.
 */
export default function JournalHeaderActions({
  actualWords,
  targetWords,
  sourcesCount,
  activityOpen,
  onToggleActivity,
  onOpenVault,
}: {
  actualWords: number;
  targetWords: number;
  sourcesCount: number;
  activityOpen: boolean;
  onToggleActivity: () => void;
  onOpenVault?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="hidden 2xl:inline-flex items-center whitespace-nowrap px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums text-[color:var(--text-secondary)] bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]"
        title="Actual Words / Target Words"
      >
        {actualWords.toLocaleString()} / {targetWords.toLocaleString()} words
      </span>
      <span
        className="hidden 2xl:inline-flex items-center whitespace-nowrap px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums text-[color:var(--text-secondary)] bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]"
        title="Verified Sources & User Datasets"
      >
        {sourcesCount} sources
      </span>

      <button
        type="button"
        onClick={onToggleActivity}
        aria-pressed={activityOpen}
        aria-label="Activity"
        title="Project activity"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
      >
        <Activity className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {onOpenVault && (
        <button
          type="button"
          onClick={onOpenVault}
          aria-label="Knowledge Vault"
          title="Knowledge Vault"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
        >
          <Library className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
