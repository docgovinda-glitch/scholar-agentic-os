import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";
import { buildKeyring, encodeKeyring } from "../ai/keyring";
import { inspectAiResponse } from "../ai/aiRouteNotices";
import { liveAiStatus } from "../ai/liveAiStatus";
import { runAiText } from "../ai/aiRun";
import type { TaskClass } from "../../platform/router/types";
import type { RoutingTaskType } from "../aiAccess/aiAccessApi";
import type { ProjectView } from "../types";
import { readProviderKey, providersWithStoredKey } from "../../services/userAiSettings";
import { originalFetch } from "../originalFetch";
import {
  isEphemeralProject,
  getEphemeralProject,
  createEphemeralProject,
  updateEphemeralProject,
  deleteEphemeralProject,
  recordDraftMigration,
  getMigratedDraftRealId,
  recoverDraftProject,
} from "../ephemeralProjectStore";
import { applyScholarGuardrails } from "../../shared/scholarGuardrails";
import { parseAndRepairLLMJson } from "../../shared/llmJsonParser";

export class UnauthenticatedError extends Error {
  readonly kind = "unauthenticated" as const;
  constructor(message = "Your session has expired. Sign in again to continue.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export {
  isEphemeralProject,
  getEphemeralProject,
  createEphemeralProject,
  updateEphemeralProject,
  deleteEphemeralProject,
  recordDraftMigration,
  getMigratedDraftRealId,
  recoverDraftProject,
};

const committingProjects = new Set<string>();

export async function json<T = unknown>(res: Response): Promise<T> {
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/**
 * Commit an ephemeral in-memory project into permanent PostgreSQL database
 */
export async function commitProjectToDatabase(projectId: string): Promise<ProjectView> {
  if (committingProjects.has(projectId)) {
    const existing = getEphemeralProject(projectId);
    if (existing) return existing;
    throw new Error(`Project ${projectId} is already in the process of committing`);
  }

  const ephemeral = getEphemeralProject(projectId);
  if (!ephemeral) {
    throw new Error(`Cannot commit ephemeral project ${projectId}: not found in ephemeral store`);
  }

  committingProjects.add(projectId);
  try {
    const created = await authedJsonFetch("/api/projects", "POST", { outputTypeId: ephemeral.outputTypeId }).then((r) =>
      json<ProjectView>(r)
    );

    let finalProject = created;
    if (ephemeral.answers && Object.keys(ephemeral.answers).length > 0) {
      try {
        finalProject = await authedJsonFetch(
          `/api/projects/${encodeURIComponent(created.projectId)}/intake`,
          "PATCH",
          { answers: ephemeral.answers }
        ).then((r) => json<ProjectView>(r));
      } catch (e) {
        console.warn("Failed to persist intake answers after project commit:", e);
      }
    }

    recordDraftMigration(projectId, created.projectId, finalProject);
    deleteEphemeralProject(projectId);

    if (typeof window !== "undefined") {
      if (window.location.pathname.includes(projectId)) {
        const updatedPath = window.location.pathname.replace(projectId, created.projectId);
        window.history.replaceState(null, "", updatedPath);
      }
      window.dispatchEvent(
        new CustomEvent("scholar:project-persisted", {
          detail: { draftId: projectId, realId: created.projectId, project: finalProject },
        })
      );
    }

    return finalProject;
  } finally {
    committingProjects.delete(projectId);
  }
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Server routes that execute AI with the caller's own provider credentials
 * (server/routes/ai.ts, drafting.ts and the per-project agent/assignment/
 * thesis/proposal/presentation routers). Only these receive the transient
 * x-ai-* headers.
 */
export const AI_ROUTE_PATTERNS: RegExp[] = [
  /^\/api\/ai(\/|$)/,
  /^\/api\/drafting(\/|$)/,
  /^\/api\/projects\/[^/]+\/(agent|agentic|assignment|thesis|proposal|presentation|manuscript|journal-requirements|cover-letter|anonymization)(\/|$)/,
  /^\/api\/studio\/refine(\/|$)/,
];

export function routeUsesClientAi(input: string): boolean {
  let path = input;
  try {
    path = new URL(input, "http://local.invalid").pathname;
  } catch {
    path = input.split("?")[0];
  }
  return AI_ROUTE_PATTERNS.some((re) => re.test(path));
}

function sanitizeHttpHeaderValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^\x20-\x7E]/g, "").trim();
}

function sanitizeHttpHeaderRecord(raw: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const rawVal =
      typeof v === "string" && k.toLowerCase() === "x-ai-model"
        ? v.split(/\s*(?:—|–|\u2014|\u2013|--)\s*/)[0]
        : v;
    const cleanVal = sanitizeHttpHeaderValue(rawVal);
    if (cleanVal) {
      clean[k] = cleanVal;
    }
  }
  return clean;
}

/** GET/DELETE with credentials attached */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const draftMatch = typeof input === "string" ? input.match(/\/api\/projects\/(draft-[^/]+)(\/.*)?/) : null;
  if (draftMatch) {
    const draftId = draftMatch[1];
    const migratedId = getMigratedDraftRealId(draftId);
    if (migratedId) {
      input = input.replace(draftId, migratedId);
    } else if (isEphemeralProject(draftId) && !committingProjects.has(draftId)) {
      try {
        const committed = await commitProjectToDatabase(draftId);
        input = input.replace(draftId, committed.projectId);
      } catch (e) {
        console.warn(`[authedFetch] Failed to auto-commit draft ${draftId}:`, e);
      }
    }
  }

  // The user's AI connections go only to routes that run AI on the server for
  // this request (see AI_ROUTE_PATTERNS), never with every API call.
  const transientAiHeaders: Record<string, string> = {};
  // Every AI connection on this device, in order, so the server can switch to
  // the next one visibly when a provider fails.
  if (routeUsesClientAi(input)) {
    const ring = await buildKeyring().catch(() => []);
    if (ring.length) transientAiHeaders["x-ai-keyring"] = encodeKeyring(ring);
  }

  const headers = sanitizeHttpHeaderRecord({
    ...transientAiHeaders,
    ...(init.headers as Record<string, string> | undefined),
    ...(await authHeaders()),
  });
  const res = await originalFetch(input, { ...init, headers });
  if (routeUsesClientAi(input)) inspectAiResponse(res);
  return res;
}

export async function authedJsonFetch(
  input: string,
  method: string,
  body: unknown,
  options?: { skipLlmFallback?: boolean }
): Promise<Response> {
  let res = await authedFetch(input, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 426 && !options?.skipLlmFallback) {
    const data = await res.json().catch(() => null);
    if (data && data.requireFrontendLLM) {
      const llmResult = await executeAgenticLLM(data.systemPrompt, data.userPrompt, data.taskType || "reasoning");
      res = await authedFetch(input, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...((typeof body === "object" && body !== null ? body : {})),
          llmResult,
          challengeToken: data.challengeToken,
          canonicalSources: data.canonicalSources,
        }),
      });
    } else {
      res = new Response(JSON.stringify(data), { status: 426, headers: res.headers });
    }
  }
  return res;
}

export async function authedStreamFetch(
  input: string,
  method: string,
  body: unknown,
  onEvent: (event: string, data: any) => void
): Promise<void> {
  if (!routeUsesClientAi(input)) return streamFetch(input, method, body, onEvent);
  // AI steps report their routing to the status dock, which can also stop them.
  const run = liveAiStatus.begin();
  const tracked = (event: string, data: any) => {
    if (event === "route") run.publish(data);
    return onEvent(event, data);
  };
  try {
    await streamFetch(input, method, body, tracked, run.signal);
    run.end();
  } catch (err) {
    run.end(err);
    throw err;
  }
}

async function streamFetch(
  input: string,
  method: string,
  body: unknown,
  onEvent: (event: string, data: any) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await authedFetch(input, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 426) {
    const data = await res.json().catch(() => null);
    if (data && data.requireFrontendLLM) {
      onEvent("log", { message: "> Initiating local frontend agentic stream..." });
      try {
        let fullContent = "";
        const finalResult = await executeAgenticLLM(
          data.systemPrompt,
          data.userPrompt,
          data.taskType || "reasoning",
          (chunk) => {
            fullContent += chunk;
            onEvent("chunk", { token: chunk });
          },
          signal
        );
        const textResult = typeof finalResult === "string" ? finalResult : JSON.stringify(finalResult);
        const parsed = parseAndRepairLLMJson<unknown>(textResult);

        const postRes = await authedFetch(input, {
          method,
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...((typeof body === "object" && body !== null ? body : {})),
            llmResult: parsed,
            challengeToken: data.challengeToken,
          }),
        });

        const reader = postRes.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        if (reader) {
          let fallbackCurrentEvent = "";
          let fallbackBuffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              if (fallbackBuffer) {
                processFallbackChunk(fallbackBuffer);
              }
              break;
            }
            fallbackBuffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            while ((newlineIndex = fallbackBuffer.indexOf("\n")) >= 0) {
              const line = fallbackBuffer.slice(0, newlineIndex).trim();
              fallbackBuffer = fallbackBuffer.slice(newlineIndex + 1);
              processFallbackChunk(line);
            }
          }

          function processFallbackChunk(line: string) {
            if (!line) return;
            if (line.startsWith("event: ")) {
              fallbackCurrentEvent = line.substring(7).trim();
            } else if (line.startsWith("data: ")) {
              let evtData;
              try {
                evtData = JSON.parse(line.substring(6));
              } catch {
                return;
              }
              if (fallbackCurrentEvent) {
                const evtToDispatch = fallbackCurrentEvent;
                fallbackCurrentEvent = "";
                onEvent(evtToDispatch, evtData);
              }
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          await Promise.resolve(onEvent("error", { message }));
        } catch {}
        throw err;
      }
      return;
    }
  }

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const errJson = await res.json();
      errMsg = errJson.error || errJson.message || errMsg;
    } catch {
      const errText = await res.text().catch(() => "");
      if (errText) errMsg = errText.slice(0, 300);
    }
    await Promise.resolve(onEvent("error", { message: errMsg }));
    throw new Error(errMsg);
  }

  if (contentType.includes("application/json")) {
    const jsonBody = await res.json().catch(() => null);
    if (jsonBody) {
      if (jsonBody.ok === false || jsonBody.error) {
        const errMsg = jsonBody.error || jsonBody.message || "Request returned an error.";
        await Promise.resolve(onEvent("error", { message: errMsg }));
        throw new Error(errMsg);
      }
      await Promise.resolve(onEvent("done", jsonBody));
      return;
    }
  }

  if (!res.body) {
    onEvent("error", { message: "No response body." });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let currentEvent = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer) {
        processChunk(buffer);
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      processChunk(line);
    }
  }

  function processChunk(line: string) {
    if (!line) return;
    if (line.startsWith("event: ")) {
      currentEvent = line.substring(7).trim();
    } else if (line.startsWith("data: ")) {
      let evtData;
      try {
        evtData = JSON.parse(line.substring(6));
      } catch {
        return;
      }

      if (currentEvent) {
        const evtToDispatch = currentEvent;
        currentEvent = "";
        onEvent(evtToDispatch, evtData);
      }
    }
  }
}

/**
 * Runs one prompt in the browser over the user's AI Access connections
 * (key rotation, fallback and local-model hand-off included) and returns the
 * text. Used for the 426 hand-off and for features that stream into the page.
 */
export async function executeAgenticLLM(
  systemPrompt: string,
  userPrompt: string,
  taskType: RoutingTaskType = "reasoning",
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const task: TaskClass = taskType === "long-context" ? "long-context" : taskType === "simple" ? "fast" : taskType === "coding" ? "coding" : "reasoning";
  const run = liveAiStatus.begin();
  let text: string;
  try {
    text = await runAiText(
      { task, messages: [...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []), { role: "user" as const, content: userPrompt }] },
      signal ?? run.signal,
      (ev) => {
        run.publish(ev);
        if (ev.type === "token") onChunk?.(ev.text);
      }
    );
  } catch (err) {
    run.end(err);
    throw err;
  }
  run.end();
  return applyScholarGuardrails(text).text;
}
