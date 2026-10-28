import React, { useEffect, useRef } from "react";
import { announcePolite } from "./AriaLiveAnnouncer";

export type AutosaveState = "saved" | "saving" | "offline" | "error" | "idle";

export interface WorkspaceAutosaveBadgeProps {
  status?: AutosaveState | string;
  version?: number | string;
  lastSavedTime?: string;
  className?: string;
  title?: string;
}

/**
 * Unified Workspace Autosave Status Badge.
 * Renders consistent state labels: "Saving changes...", "All changes saved", or "Offline Backup",
 * and politely announces state transitions to assistive technologies via AriaLiveAnnouncer.
 */
export function WorkspaceAutosaveBadge({
  status = "saved",
  version,
  lastSavedTime,
  className = "",
  title,
}: WorkspaceAutosaveBadgeProps): React.ReactElement {
  const normalizedStatus: AutosaveState =
    status === "saving"
      ? "saving"
      : status === "offline" || status === "error"
      ? "offline"
      : "saved";

  const prevStatusRef = useRef<AutosaveState>(normalizedStatus);

  useEffect(() => {
    if (prevStatusRef.current !== normalizedStatus) {
      if (normalizedStatus === "saving") {
        announcePolite("Saving changes");
      } else if (normalizedStatus === "offline") {
        announcePolite("Changes saved to offline backup");
      } else if (normalizedStatus === "saved") {
        announcePolite(version ? `All changes saved, version ${version}` : "All changes saved");
      }
      prevStatusRef.current = normalizedStatus;
    }
  }, [normalizedStatus, version]);

  const isSaving = normalizedStatus === "saving";
  const isOffline = normalizedStatus === "offline";

  const statusLabel = isSaving
    ? "Saving changes..."
    : isOffline
    ? "Offline Backup"
    : "All changes saved";

  const defaultTitle = title || (version ? `Autosave Status v${version}` : "Autosave Status");

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="autosave-status"
      title={defaultTitle}
      aria-label={`Autosave status: ${statusLabel}${version ? `, version ${version}` : ""}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
        isSaving
          ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
          : isOffline
          ? "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200"
          : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isSaving
            ? "bg-amber-500 animate-pulse"
            : isOffline
            ? "bg-rose-500"
            : "bg-emerald-500"
        }`}
      />
      <span>{statusLabel}</span>
      {lastSavedTime && !isSaving && (
        <span className="opacity-70 font-normal">({lastSavedTime})</span>
      )}
      {version !== undefined && (
        <span
          className="font-mono text-[9px] px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 opacity-80"
          title={`Revision version ${version}`}
        >
          v{version}
        </span>
      )}
    </div>
  );
}

export default WorkspaceAutosaveBadge;
