import React, { useEffect, useRef } from "react";
import { announcePolite, clearAnnouncements } from "./AriaLiveAnnouncer";

export type AutosaveState = "saved" | "saving" | "offline" | "error" | "idle" | "signed-out";

export interface WorkspaceAutosaveBadgeProps {
  status?: AutosaveState | string;
  version?: number | string;
  lastSavedTime?: string;
  className?: string;
  /** Below the lg breakpoint (or below 2xl when "2xl") show only the coloured dot; the status stays in aria-label and title. */
  compactOnSmall?: boolean | "2xl";
  title?: string;
}

/**
 * Unified Workspace Autosave Status Badge.
 * Renders consistent state labels: "Saving changes...", "All changes saved", "Offline Backup"
 * (kept on this device until the connection returns) or "Not saved" (the save failed and nothing
 * holds the change) or "Sign in to save" (a signed-out session keeps nothing), and politely announces state transitions via AriaLiveAnnouncer.
 */
export function WorkspaceAutosaveBadge({
  status = "saved",
  version,
  lastSavedTime,
  className = "",
  compactOnSmall = false,
  title,
}: WorkspaceAutosaveBadgeProps): React.ReactElement {
  const normalizedStatus: AutosaveState =
    status === "saving" || status === "offline" || status === "error" || status === "signed-out" ? status : "saved";

  const prevStatusRef = useRef<AutosaveState>(normalizedStatus);

  useEffect(() => {
    if (prevStatusRef.current !== normalizedStatus) {
      if (normalizedStatus === "saving") {
        announcePolite("Saving changes");
      } else if (normalizedStatus === "offline") {
        announcePolite("Changes saved to offline backup");
      } else if (normalizedStatus === "error") {
        announcePolite("Changes could not be saved");
      } else if (normalizedStatus === "saved") {
        announcePolite(version ? `All changes saved, version ${version}` : "All changes saved");
      }
      prevStatusRef.current = normalizedStatus;
    }
  }, [normalizedStatus, version]);

  useEffect(() => () => clearAnnouncements(), []);

  const isSaving = normalizedStatus === "saving";
  const isOffline = normalizedStatus === "offline";
  const isError = normalizedStatus === "error";
  const isSignedOut = normalizedStatus === "signed-out";

  const statusLabel = isSaving
    ? "Saving changes..."
    : isOffline
    ? "Offline Backup"
    : isError
    ? "Not saved"
    : isSignedOut
    ? "Sign in to save"
    : "All changes saved";

  const defaultTitle = title || (version ? `Autosave Status v${version}` : "Autosave Status");

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="autosave-status"
      title={defaultTitle}
      aria-label={`Autosave status: ${statusLabel}${version ? `, version ${version}` : ""}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
        isSaving || isOffline
          ? "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]"
          : isError
          ? "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]"
          : isSignedOut
          ? "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]"
          : "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isSaving
            ? "bg-[color:var(--state-warning)] animate-pulse"
            : isOffline
            ? "bg-[color:var(--state-warning)]"
            : isError
            ? "bg-[color:var(--state-danger)]"
            : isSignedOut
            ? "bg-[color:var(--text-muted)]"
            : "bg-[color:var(--state-success)]"
        }`}
      />
      <span className={compactOnSmall === "2xl" ? "hidden 2xl:inline" : compactOnSmall ? "hidden lg:inline" : undefined}>{statusLabel}</span>
      {lastSavedTime && !isSaving && !isError && (
        <span className={`font-normal ${compactOnSmall === "2xl" ? "hidden 2xl:inline" : compactOnSmall ? "hidden xl:inline" : ""}`}>({lastSavedTime})</span>
      )}
      {version !== undefined && (
        <span
          className={`font-mono text-[10px] px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 ${compactOnSmall === "2xl" ? "hidden 2xl:inline" : compactOnSmall ? "hidden lg:inline" : ""}`}
          title={`Revision version ${version}`}
        >
          v{version}
        </span>
      )}
    </div>
  );
}

export default WorkspaceAutosaveBadge;
