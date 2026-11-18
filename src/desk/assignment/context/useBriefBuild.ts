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

export type BuildStepId = "extract" | "understand";
export interface BuildStepState {
  status: "idle" | "running" | "done" | "error";
  message?: string;
}
export interface BriefBuildState {
  status: "idle" | "running" | "done" | "error" | "interrupted";
  steps: Record<BuildStepId, BuildStepState>;
  error?: string;
}
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

/** The events of an SSE body, one call per `data:` line. */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (e: BuildEvent) => Promise<void> | void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        await onEvent(JSON.parse(raw) as BuildEvent);
      } catch (err) {
        if (err instanceof SyntaxError) continue; // a malformed line
        throw err;
      }
    }
  }
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
    const show = (status: BriefBuildState["status"], error?: string) => setLive({ status, steps, ...(error ? { error } : {}) });
    show("running");
    try {
      await depsRef.current.flushSaves();
      const res = await authedJsonFetch(`/api/projects/${depsRef.current.projectId}/assignment/build`, "POST", opts.force ? { force: true } : {}, { skipLlmFallback: true });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        show("error", data?.error || `Your brief could not be read (${res.status}).`);
        return res.status === 409 ? "busy" : "error";
      }
      // Set from inside the event callback.
      const result: { outcome: "done" | "error"; failure: string } = { outcome: "error", failure: "" };
      await readEvents(res.body, async (e) => {
        if (e.step && e.status) {
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
      if (result.outcome === "done") show("done");
      else show("error", result.failure || "The build stopped before it finished. Try again.");
      return result.outcome;
    } catch (err) {
      show("error", err instanceof TypeError ? "Could not reach the server. Check your connection and try again." : err instanceof Error ? err.message : String(err));
      return "error";
    } finally {
      inFlight.current = false;
    }
  }, []);

  return { state, run };
}
