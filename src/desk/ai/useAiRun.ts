import { useCallback, useEffect, useRef, useState } from "react";
import type { RouterEvent } from "../../platform/router/types";
import { AiRunError, runAi, type AiRunInput, type RunDeps } from "./aiRun";
import { initialAiRunState, reduceAiRun, type AiRunState } from "./aiRunState";

/**
 * Runs AI requests for a component. Events are reduced into one state object;
 * token updates are flushed once per animation frame so long answers stream
 * smoothly instead of re-rendering per token. `cancel()` aborts the request,
 * which stops the provider call on the server.
 */
export function useAiRun(deps?: RunDeps) {
  const [state, setState] = useState<AiRunState>(initialAiRunState);
  const ctlRef = useRef<AbortController | null>(null);
  const pending = useRef<RouterEvent[]>([]);
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const batch = pending.current;
    pending.current = [];
    if (batch.length) setState((s) => batch.reduce((acc, ev) => reduceAiRun(acc, ev), s));
  }, []);

  const push = useCallback((ev: RouterEvent) => {
    pending.current.push(ev);
    // Tokens wait for the next frame; status changes render at once.
    if (ev.type !== "token" && ev.type !== "metrics") return flush();
    if (frame.current === null) frame.current = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16) as unknown as number)(flush);
  }, [flush]);

  const run = useCallback(async (input: AiRunInput): Promise<AiRunState> => {
    ctlRef.current?.abort();
    const ctl = new AbortController();
    ctlRef.current = ctl;
    let final = initialAiRunState;
    try {
      for await (const ev of runAi(input, ctl.signal, deps)) {
        final = reduceAiRun(final, ev);
        push(ev);
      }
    } catch (err) {
      const message = err instanceof AiRunError ? err.message : ctl.signal.aborted ? "Cancelled" : "Couldn't reach the AI service. Check your connection and try again.";
      const ev: RouterEvent = ctl.signal.aborted ? { type: "cancelled", outputTokensSoFar: 0 } : { type: "error", code: "non_retryable", message, trace: [] };
      final = reduceAiRun(final, ev);
      push(ev);
    } finally {
      flush();
      if (ctlRef.current === ctl) ctlRef.current = null;
    }
    return final;
  }, [deps, flush, push]);

  const cancel = useCallback(() => ctlRef.current?.abort(), []);
  const reset = useCallback(() => { ctlRef.current?.abort(); setState(initialAiRunState); }, []);

  useEffect(() => () => { ctlRef.current?.abort(); if (frame.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame.current); }, []);

  return { state, run, cancel, reset, busy: state.phase === "connecting" || state.phase === "streaming" || state.phase === "retrying" || state.phase === "switching" || state.phase === "handoff" };
}
