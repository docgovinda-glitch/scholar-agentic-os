import React from "react";
import { Check, Cloud, RefreshCw, AlertTriangle } from "lucide-react";

export type AutosaveStatus = "saved" | "saving" | "idle" | "error" | "offline";

export interface WorkspaceAutosaveBadgeProps {
  status: AutosaveStatus;
  version?: number | string | null;
  lastSavedTime?: string | null;
  className?: string;
}

/**
 * Standardized Workspace Autosave Badge.
 * Meets WCAG contrast guidelines and provides real-time state feedback:
 * - "Saving changes..." with gentle pulse
 * - "All changes saved · v{version}"
 * - "Offline Backup" when connectivity drops
 */
export function WorkspaceAutosaveBadge({
  status,
  version,
  lastSavedTime,
  className = "",
}: WorkspaceAutosaveBadgeProps) {
  if (status === "saving") {
    return (
      <div
        data-testid="autosave-status"
        aria-live="polite"
        className={`flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium select-none ${className}`}
      >
        <RefreshCw className="w-3 h-3 animate-spin shrink-0 text-amber-500" aria-hidden="true" />
        <span>Saving changes...</span>
      </div>
    );
  }

  if (status === "error" || status === "offline") {
    return (
      <div
        data-testid="autosave-status"
        aria-live="polite"
        className={`flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium select-none ${className}`}
      >
        <AlertTriangle className="w-3 h-3 shrink-0 text-amber-500" aria-hidden="true" />
        <span>Offline Backup</span>
      </div>
    );
  }

  // "saved" or "idle"
  return (
    <div
      data-testid="autosave-status"
      aria-live="polite"
      className={`flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium select-none ${className}`}
    >
      <Check className="w-3 h-3 shrink-0 text-emerald-500" aria-hidden="true" />
      <span>All changes saved</span>
      {version !== undefined && version !== null && (
        <>
          <span className="opacity-40 text-[10px] select-none" aria-hidden="true">
            {" · "}
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200/80 dark:bg-white/10 font-mono text-neutral-700 dark:text-neutral-300">
            v{version}
          </span>
        </>
      )}
      {lastSavedTime && <span className="opacity-70 font-normal">({lastSavedTime})</span>}
    </div>
  );
}

export default WorkspaceAutosaveBadge;
