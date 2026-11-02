import React, { useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, Library } from "lucide-react";
import type { ExecutionScope } from "../../services/executionState";

interface ConnectedProvider {
  id: string;
  name: string;
  selectedModel?: string | null;
}

/**
 * The journal workspace's own controls, shown in the shared studio header:
 * words against the target, sources, the AI model, activity and the Vault.
 */
export default function JournalHeaderActions({
  actualWords,
  targetWords,
  sourcesCount,
  connected,
  defaultModelText,
  activeModelDisplay,
  manualModelOverride,
  onModelOverride,
  liveExecution,
  activityOpen,
  onToggleActivity,
  onOpenVault,
}: {
  actualWords: number;
  targetWords: number;
  sourcesCount: number;
  connected: ConnectedProvider[];
  defaultModelText: string;
  activeModelDisplay: string;
  manualModelOverride: { providerId: string; modelId?: string } | null;
  onModelOverride: (o: { providerId: string; modelId?: string } | null) => void;
  liveExecution: ExecutionScope | null;
  activityOpen: boolean;
  onToggleActivity: () => void;
  onOpenVault?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const dot =
    liveExecution?.status === "error"
      ? "bg-rose-500"
      : liveExecution?.isFallbackActive
      ? "bg-amber-500 animate-pulse"
      : liveExecution?.status === "running"
      ? "bg-emerald-500 animate-pulse"
      : "bg-emerald-500";

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

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-label="AI model"
          title={`Active Client AI Model: ${activeModelDisplay}`}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} aria-hidden="true" />
          <span className="hidden 2xl:inline max-w-[120px] truncate">{activeModelDisplay}</span>
          <ChevronDown className="w-3 h-3" aria-hidden="true" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-72 p-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-xl z-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">AI model for this workspace</span>
              {liveExecution?.isFallbackActive && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">Backup active</span>
              )}
            </div>
            <select
              aria-label="Active model"
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]"
              value={manualModelOverride ? `${manualModelOverride.providerId}:${manualModelOverride.modelId || ""}` : "automatic"}
              onChange={(e) => {
                if (e.target.value === "automatic") onModelOverride(null);
                else {
                  const [providerId, modelId] = e.target.value.split(":");
                  onModelOverride({ providerId, modelId: modelId || undefined });
                }
              }}
            >
              <option value="automatic">
                {liveExecution && liveExecution.status === "running"
                  ? `${liveExecution.activeProvider} - ${liveExecution.activeModel} (Live)`
                  : `${defaultModelText} (Default)`}
              </option>
              {connected.length > 0 && (
                <optgroup label="Connected providers">
                  {connected.map((p) => {
                    const value = `${p.id}:${p.selectedModel || ""}`;
                    return (
                      <option key={value} value={value}>
                        {p.selectedModel ? `${p.name} - ${p.selectedModel}` : p.name}
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          </div>
        )}
      </div>

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
