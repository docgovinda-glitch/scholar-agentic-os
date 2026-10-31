/**
 * The state the UI renders for one AI request, reduced from router events.
 * Pure, so every screen shows the same truth: which model is answering, on
 * whose key, any wait or switch and why, live speed, and how it ended.
 */
import type { FailureKind, Lane, RouterEvent } from "../../platform/router/types";

export type AiPhase = "idle" | "connecting" | "streaming" | "retrying" | "switching" | "handoff" | "done" | "error" | "cancelled";

export interface AiNotice {
  kind: "fallback" | "retry" | "skipped" | "limit" | "handoff";
  text: string;
  at: number;
}

export interface AiRunState {
  phase: AiPhase;
  text: string;
  model?: { id: string; label: string; lane: Lane };
  /** Present while waiting before a retry: when the wait ends (epoch ms). */
  retryUntil?: number;
  notices: AiNotice[];
  metrics?: { ttftMs: number; tokensPerSecond: number; outputTokens: number };
  error?: string;
  usage?: { inputTokens: number; outputTokens: number; source: "provider" | "estimate" };
}

export const initialAiRunState: AiRunState = { phase: "idle", text: "", notices: [] };

const REASON: Record<FailureKind, string> = {
  rate_limit: "rate limit reached",
  quota: "quota or billing limit reached",
  server: "provider error",
  overloaded: "provider overloaded",
  timeout_first_token: "no response in time",
  timeout_idle: "response stalled",
  network: "network problem",
  auth: "key rejected",
  invalid_request: "request rejected",
  context_overflow: "input too long for this model",
  content_filter: "blocked by the provider's safety filter",
  aborted: "cancelled",
};
export const reasonText = (k: FailureKind) => REASON[k];

export function reduceAiRun(state: AiRunState, ev: RouterEvent, now: number = Date.now()): AiRunState {
  switch (ev.type) {
    case "route_start":
      return { ...initialAiRunState, phase: "connecting" };
    case "attempt_start":
      return { ...state, phase: "connecting", retryUntil: undefined, model: { id: ev.candidateId, label: ev.label, lane: ev.lane } };
    case "token":
      return { ...state, phase: "streaming", text: state.text + ev.text };
    case "metrics":
      return { ...state, metrics: { ttftMs: ev.ttftMs, tokensPerSecond: ev.tokensPerSecond, outputTokens: ev.outputTokens } };
    case "retry":
      return { ...state, phase: "retrying", retryUntil: now + ev.waitMs, notices: [...state.notices, { kind: "retry", at: now, text: `${state.model?.label ?? "Model"}: ${reasonText(ev.reason)}. Retrying (attempt ${ev.attempt} of ${ev.maxAttempts})…` }] };
    case "fallback":
      return {
        ...state,
        phase: "switching",
        text: ev.partialOutputDiscarded ? "" : state.text,
        notices: [...state.notices, { kind: "fallback", at: now, text: `Switched from ${ev.fromLabel} to ${ev.toLabel}: ${reasonText(ev.reason)}${ev.httpStatus ? ` (HTTP ${ev.httpStatus})` : ""}.${ev.partialOutputDiscarded ? " The partial answer was discarded and is being rewritten." : ""}` }],
      };
    case "candidate_skipped":
      return { ...state, notices: [...state.notices, { kind: "skipped", at: now, text: `Skipped ${ev.label}: ${ev.detail}.` }] };
    case "limit_warning":
      return { ...state, notices: [...state.notices, { kind: "limit", at: now, text: `Input uses ${Math.round(ev.usedRatio * 100)}% of this model's context; the answer is limited to ${ev.outputClampedTo.toLocaleString("en")} tokens.` }] };
    case "handoff":
      return { ...state, phase: "handoff", notices: [...state.notices, { kind: "handoff", at: now, text: `Continuing on your device with ${ev.label}.` }] };
    case "tool_call":
      return state;
    case "done":
      return { ...state, phase: "done", retryUntil: undefined, usage: ev.usage, model: { id: ev.candidateId, label: ev.label, lane: ev.lane } };
    case "error":
      return { ...state, phase: "error", retryUntil: undefined, error: ev.message };
    case "cancelled":
      return { ...state, phase: "cancelled", retryUntil: undefined };
  }
}
