import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Cpu, Gauge, KeyRound, Loader2, Sparkles, Square, Timer } from "lucide-react";
import type { AiRunState } from "./aiRunState";

const LANE: Record<string, { text: string; Icon: typeof Cpu }> = {
  premium: { text: "Premium", Icon: Sparkles },
  byok: { text: "Your key", Icon: KeyRound },
  local: { text: "On your device", Icon: Cpu },
};

function useCountdown(until?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

/**
 * Shows, for one AI request: which model is answering and on whose account,
 * a live countdown while waiting to retry, every switch or skip with its
 * reason, live speed, and a Stop button. Nothing about routing is hidden.
 */
export function AiRunStatus({ state, onCancel, compact = false }: { state: AiRunState; onCancel?: () => void; compact?: boolean }) {
  const seconds = useCountdown(state.phase === "retrying" ? state.retryUntil : undefined);
  if (state.phase === "idle") return null;
  const lane = state.model ? LANE[state.model.lane] : undefined;
  const working = ["connecting", "streaming", "retrying", "switching", "handoff"].includes(state.phase);
  const latest = state.notices.at(-1);

  return (
    <div className="flex flex-col gap-1.5 text-xs text-[color:var(--text-secondary)]" data-testid="ai-run-status">
      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        {working && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
        {state.phase === "retrying" && <Timer className="w-3.5 h-3.5" aria-hidden="true" />}
        {state.phase === "switching" && <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />}
        <span className="font-medium text-[color:var(--text-primary)]">
          {state.phase === "connecting" && (state.model ? `Asking ${state.model.label}…` : "Connecting…")}
          {state.phase === "streaming" && (state.model ? `Writing with ${state.model.label}` : "Writing…")}
          {state.phase === "retrying" && `Waiting ${seconds}s before retrying`}
          {state.phase === "switching" && "Switching model…"}
          {state.phase === "handoff" && "Continuing on your device…"}
          {state.phase === "done" && (state.model ? `Answered by ${state.model.label}` : "Done")}
          {state.phase === "cancelled" && "Stopped"}
          {state.phase === "error" && "AI couldn't finish"}
        </span>
        {lane && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-subtle)] px-2 py-0.5">
            <lane.Icon className="w-3 h-3" aria-hidden="true" />
            {lane.text}
          </span>
        )}
        {state.metrics && state.phase !== "error" && (
          <span className="inline-flex items-center gap-1 tabular-nums" title="Time to first token and generation speed">
            <Gauge className="w-3 h-3" aria-hidden="true" />
            {(state.metrics.ttftMs / 1000).toFixed(1)}s · {Math.round(state.metrics.tokensPerSecond)} tok/s
          </span>
        )}
        {working && onCancel && (
          <button type="button" onClick={onCancel} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[color:var(--border-control)] px-2 py-0.5 font-medium hover:bg-[color:var(--surface-hover)] cursor-pointer">
            <Square className="w-3 h-3" aria-hidden="true" /> Stop
          </button>
        )}
      </div>

      {state.phase === "error" && state.error && (
        <p role="alert" className="flex items-start gap-1.5 text-[color:var(--text-primary)]">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[color:var(--state-warning)]" aria-hidden="true" />
          {state.error}
        </p>
      )}

      {compact
        ? latest && latest.kind !== "limit" && <p className="text-[color:var(--text-secondary)]">{latest.text}</p>
        : state.notices.length > 0 && (
          <ul className="space-y-0.5" aria-label="Routing events">
            {state.notices.map((n, i) => (
              <li key={i} className="flex items-start gap-1.5">
                {n.kind === "fallback" ? <ArrowRightLeft className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" /> : <span aria-hidden="true">•</span>}
                {n.text}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
