import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AiRunStatus } from "./AiRunStatus";
import { liveAiStatus } from "./liveAiStatus";
import type { AiRunState } from "./aiRunState";

const HIDE_AFTER_MS = 6000;

/**
 * One status line for whichever workspace AI step is running: the model
 * answering and on whose account, retries with a countdown, switches with
 * their reason, live speed, and Stop. A finished step clears itself after a
 * few seconds; a failed one stays until dismissed.
 */
export function LiveAiStatusDock() {
  const [state, setState] = useState<AiRunState>(liveAiStatus.get());
  useEffect(() => liveAiStatus.subscribe(setState), []);

  useEffect(() => {
    if (state.phase !== "done" && state.phase !== "cancelled") return;
    const t = setTimeout(() => liveAiStatus.dismiss(), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [state.phase]);

  if (state.phase === "idle") return null;
  const working = ["connecting", "streaming", "retrying", "switching", "handoff"].includes(state.phase);

  return (
    <div
      className="fixed bottom-4 left-4 z-40 w-[min(26rem,calc(100vw-2rem))] rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-3 shadow-lg"
      aria-label="AI step status"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <AiRunStatus state={state} onCancel={working ? () => liveAiStatus.cancel() : undefined} compact />
        </div>
        {!working && (
          <button type="button" onClick={() => liveAiStatus.dismiss()} aria-label="Dismiss AI status" className="rounded p-0.5 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)]">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
