/**
 * The workspace's one Build of the brief (POST /assignment/build): the server
 * reads the brief with the student's AI, then plans it and writes the outline,
 * streaming progress. This hook keeps a real status for each step, runs one
 * build at a time, reloads the project after each saved step, and lets the
 * caller act as soon as the brief has been read (e.g. open Understand while
 * the outline is still being written).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { authedJsonFetch } from "../../api";
import { safeParseAnswerField } from "../../../shared/projectStateSchema";
import { readSse } from "../../../shared/sseReader";

export type BuildStepId = "extract" | "understand";
export interface BuildStepState {
  status: "idle" | "running" | "done" | "error";
  message?: string;
}
export interface BriefBuildState {
  status: "idle" | "running" | "done" | "error" | "interrupted";
  steps: Record<BuildStepId, BuildStepState>;
  error?: string;
  /** The build stopped because the stream went quiet for too long (not a server-reported failure). */
  timedOut?: boolean;
}

/** How long the stream may stay silent before the build is stopped and a way out is offered. */
export const OUTLINE_STALL_MS = 25_000;
/** Reading a long brief is allowed longer before its first event. */
export const EXTRACT_STALL_MS = 60_000;
export const OUTLINE_TIMEOUT_MESSAGE = "Outline generation took longer than expected.";
export interface BriefBuild {
  state: BriefBuildState;
  /** Runs the build; resolves with how it ended. `onExtracted` runs once the brief has been read and saved. */
  run: (opts?: { force?: boolean; onExtracted?: () => void }) => Promise<"done" | "error" | "busy">;
}

interface Deps {
  projectId: string;
  answers: Record<string, unknown>;
  /** Waits for pending saves, so the server builds from the latest brief. */
  flushSaves: () => Promise<void>;
  /** Reloads the project quietly (no loading screen) after the server saved a step. */
  reload: () => Promise<unknown>;
}

const IDLE_STEPS: Record<BuildStepId, BuildStepState> = { extract: { status: "idle" }, understand: { status: "idle" } };

interface BuildEvent {
  step?: BuildStepId;
  status?: "running" | "done";
  message?: string;
  done?: boolean;
  cached?: boolean;
  error?: string;
}

/** The build's events from its SSE body (shared reader); `[DONE]` and non-JSON lines are skipped. */
function readEvents(body: ReadableStream<Uint8Array>, onEvent: (e: BuildEvent) => Promise<void> | void): Promise<void> {
  return readSse(body, (m) => (m.json && m.data && typeof m.data === "object" ? onEvent(m.data as BuildEvent) : undefined));
}

export function useBriefBuild(d: Deps): BriefBuild {
  const depsRef = useRef(d);
  depsRef.current = d;
  const inFlight = useRef(false);
  const [live, setLive] = useState<BriefBuildState | null>(null);

  // A build saved as "running" that this page is not running was interrupted
  // (the server restarted, or another tab closed mid-build).
  const saved = useMemo(() => safeParseAnswerField<{ state?: string; error?: string } | null>(d.answers["assignment_build"], null), [d.answers]);
  const state: BriefBuildState = live ?? {
    status: saved?.state === "running" ? "interrupted" : saved?.state === "failed" ? "error" : saved?.state === "done" ? "done" : "idle",
    steps: IDLE_STEPS,
    ...(saved?.state === "failed" && saved.error ? { error: saved.error } : {}),
  };

  const run = useCallback<BriefBuild["run"]>(async (opts = {}) => {
    if (inFlight.current) return "busy";
    inFlight.current = true;
    let steps = { ...IDLE_STEPS };
    const show = (status: BriefBuildState["status"], error?: string, timedOut?: boolean) =>
      setLive({ status, steps, ...(error ? { error } : {}), ...(timedOut ? { timedOut } : {}) });
    // Stall guard: any event re-arms it; silence past the limit aborts the request
    // (the server then stops its model call) so the page never waits forever.
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, ms);
    };
    show("running");
    try {
      await depsRef.current.flushSaves();
      arm(EXTRACT_STALL_MS);
      const res = await authedJsonFetch(`/api/projects/${depsRef.current.projectId}/assignment/build`, "POST", opts.force ? { force: true } : {}, {
        skipLlmFallback: true,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        show("error", data?.error || `Your brief could not be read (${res.status}).`);
        return res.status === 409 ? "busy" : "error";
      }
      // Set from inside the event callback.
      const result: { outcome: "done" | "error"; failure: string } = { outcome: "error", failure: "" };
      await readEvents(res.body, async (e) => {
        if (e.step && e.status) {
          arm(e.step === "understand" && e.status === "running" ? OUTLINE_STALL_MS : EXTRACT_STALL_MS);
          steps = { ...steps, [e.step]: { status: e.status, message: e.message } };
          show("running");
          if (e.step === "extract" && e.status === "done") {
            await depsRef.current.reload();
            opts.onExtracted?.();
          }
        }
        if (e.error) {
          result.failure = e.error;
          if (e.step) steps = { ...steps, [e.step]: { status: "error", message: e.error } };
        }
        if (e.done) result.outcome = "done";
      });
      await depsRef.current.reload();
      if (timedOut && result.outcome !== "done") {
        show("error", OUTLINE_TIMEOUT_MESSAGE, true);
        return "error";
      }
      if (result.outcome === "done") show("done");
      else show("error", result.failure || "The build stopped before it finished. Try again.");
      return result.outcome;
    } catch (err) {
      if (timedOut) {
        show("error", OUTLINE_TIMEOUT_MESSAGE, true);
        return "error";
      }
      show("error", err instanceof TypeError ? "Could not reach the server. Check your connection and try again." : err instanceof Error ? err.message : String(err));
      return "error";
    } finally {
      if (timer) clearTimeout(timer);
      inFlight.current = false;
    }
  }, []);

  return { state, run };
}
