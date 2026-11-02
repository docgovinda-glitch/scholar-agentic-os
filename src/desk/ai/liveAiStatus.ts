/**
 * The AI step running right now in a workspace, for the status dock. Fed by
 * `authedStreamFetch` with the router events the server forwards (`route`
 * SSE events), reduced by the same `reduceAiRun` every AI screen uses. It
 * also holds the request's AbortController, so Stop really stops: the
 * connection closes, and the server aborts the provider call.
 */
import { initialAiRunState, reduceAiRun, type AiRunState } from "./aiRunState";
import type { RouterEvent } from "../../platform/router/types";

type Listener = (s: AiRunState) => void;

let state: AiRunState = initialAiRunState;
let controller: AbortController | null = null;
let runId = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(state));

export const liveAiStatus = {
  get: (): AiRunState => state,
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Starts tracking one streamed AI request; returns its handle. */
  begin() {
    const id = ++runId;
    controller = new AbortController();
    const signal = controller.signal;
    state = { ...initialAiRunState, phase: "connecting" };
    emit();
    const mine = () => id === runId;
    return {
      signal,
      publish(ev: unknown) {
        if (!mine() || !isRouterEvent(ev)) return;
        state = reduceAiRun(state, ev);
        emit();
      },
      /** Ends the run. A run that never saw a router event (a non-AI stream) simply disappears. */
      end(error?: unknown) {
        if (!mine()) return;
        controller = null;
        if (signal.aborted) state = { ...state, phase: "cancelled", retryUntil: undefined };
        else if (state.phase === "connecting" && !state.model) state = initialAiRunState;
        else if (error && state.phase !== "error") state = { ...state, phase: "error", error: error instanceof Error ? error.message : String(error) };
        else if (state.phase !== "error" && state.phase !== "done") state = { ...state, phase: "done" };
        emit();
      },
    };
  },
  cancel(): void {
    controller?.abort(new DOMException("Stopped by the user", "AbortError"));
  },
  dismiss(): void {
    state = initialAiRunState;
    emit();
  },
};

const ROUTER_TYPES = new Set(["route_start", "candidate_skipped", "attempt_start", "limit_warning", "token", "tool_call", "metrics", "retry", "fallback", "handoff", "done", "error", "cancelled"]);
function isRouterEvent(ev: unknown): ev is RouterEvent {
  return typeof ev === "object" && ev !== null && ROUTER_TYPES.has((ev as { type?: string }).type ?? "");
}
