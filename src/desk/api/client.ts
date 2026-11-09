import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";
import { buildKeyring, encodeKeyring } from "../ai/keyring";
import { inspectAiResponse } from "../ai/aiRouteNotices";
import { liveAiStatus } from "../ai/liveAiStatus";
import { type RoutingTaskType, routeDecision } from "../aiAccess/aiAccessApi";
import { completeWithFailover, streamWithFailover } from "../../platform/gateway/gateway";
import { defaultPolicy, recordConsent } from "../../platform/warden/warden";
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
import { getClientAiRuntimeConfig } from "../../services/useAiConfig";
import { resolveClientCandidates } from "../../services/clientRouter";
import type { CandidateProvider } from "../../platform/gateway/types";
import { getCloudProvider } from "../../config/providerCatalog";
import { startExecutionScope, updateExecutionScope, endExecutionScope } from "../../services/executionState";
import type { FailoverEvent } from "../../services/providerFailover";
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
  /^\/api\/projects\/[^/]+\/(agent|agentic|assignment|thesis|proposal|presentation)(\/|$)/,
  // Journal Writer: manuscript sections, coherence, peer review, requirements, cover letter, anonymisation.
  /^\/api\/projects\/[^/]+\/(manuscript|journal-requirements|cover-letter|anonymization)(\/|$)/,
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

  // The user's own AI key goes only to routes that run AI on the server for
  // this request (see AI_ROUTE_PATTERNS), never with every API call.
  const aiConfig = routeUsesClientAi(input) ? await getClientAiRuntimeConfig().catch(() => null) : null;
  const transientAiHeaders: Record<string, string> = {};
  if (aiConfig && aiConfig.isConfigured) {
    const cleanProvider = sanitizeHttpHeaderValue(aiConfig.provider);
    const cleanModel = sanitizeHttpHeaderValue(aiConfig.modelId?.split(/\s*(?:—|–|\u2014|\u2013)\s*/)[0]);
    const cleanKey = sanitizeHttpHeaderValue(aiConfig.apiKey);
    const cleanBase = sanitizeHttpHeaderValue(aiConfig.baseUrl);
    if (cleanProvider) transientAiHeaders["x-ai-provider"] = cleanProvider;
    if (cleanModel) transientAiHeaders["x-ai-model"] = cleanModel;
    if (cleanKey) transientAiHeaders["x-ai-api-key"] = cleanKey;
    if (cleanBase) transientAiHeaders["x-ai-base-url"] = cleanBase;
  }
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
          (failoverEvt) => {
            if (failoverEvt.userMessage) {
              onEvent("log", { message: `⚠️ ${failoverEvt.userMessage}` });
            }
          }
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

let activeManualModelOverride: { providerId: string; modelId?: string } | null = null;

export function setGlobalManualModelOverride(override: { providerId: string; modelId?: string } | null) {
  activeManualModelOverride = override;
}

function routingTaskTypeToTaskClass(taskType: RoutingTaskType): "drafting" | "refinement" | "chat" | "summarisation" | "verification" | "rule_extraction" | "discovery" | "embedding" | "classification" {
  switch (taskType) {
    case "simple":       return "chat";
    case "reasoning":    return "verification";
    case "coding":       return "drafting";
    case "long-context": return "summarisation";
    case "multimodal":   return "drafting";
    default:             return "chat";
  }
}

export async function executeAgenticLLM(
  systemPrompt: string,
  userPrompt: string,
  taskType: RoutingTaskType = "reasoning",
  onChunk?: (chunk: string) => void,
  onFailoverEvent?: (event: FailoverEvent) => void
) {
  // Searching is done by the conversations that need it (Ask Scholar and the
  // workspace chats ground every answer). Structured tasks (outlines, JSON,
  // drafts) get exactly the prompt they were given.
  const effectiveSystemPrompt = systemPrompt;

  // 1. Resolve candidates client-side first using policy-driven client router
  const clientDecision = await resolveClientCandidates(taskType, {
    manualOverride: activeManualModelOverride,
  }).catch(() => null);

  let candidates: CandidateProvider[] = [];

  if (clientDecision && clientDecision.ok && clientDecision.allCandidates.length > 0) {
    candidates = clientDecision.allCandidates.map((c) => ({
      provider: c.provider,
      model: c.model,
      apiKey: c.apiKey,
    }));
  } else {
    // Fallback: check server preview if client resolution had 0 candidates
    const decision = await routeDecision(taskType).catch(() => null);
    if (decision && decision.ok) {
      const choices = [decision.choice, ...decision.fallbacks];
      for (const c of choices) {
        if (c.tier === "premium") continue;
        if (c.tier === "byok" || c.tier === "free") {
          const key = await readProviderKey(c.providerId);
          if (key) candidates.push({ provider: c.providerId, model: c.modelId, apiKey: key });
        } else if (c.tier === "local") {
          candidates.push({ provider: c.providerId, model: c.modelId, apiKey: "local-no-credential-required" });
        }
      }
    }
  }

  if (activeManualModelOverride) {
    const key = await readProviderKey(activeManualModelOverride.providerId);
    if (key && !candidates.some((c) => c.provider === activeManualModelOverride!.providerId)) {
      candidates.unshift({
        provider: activeManualModelOverride.providerId,
        model: activeManualModelOverride.modelId,
        apiKey: key,
      });
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      clientDecision?.reasoning ||
      "No active AI credentials or local runners are configured on this device. Please connect an API key or local runner in AI Access."
    );
  }

  const taskClass = routingTaskTypeToTaskClass(taskType);
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const initialCandidate = candidates[0];
  const initialSpec = getCloudProvider(initialCandidate.provider);
  startExecutionScope(
    executionId,
    initialCandidate.provider,
    initialSpec?.name || initialCandidate.provider,
    initialCandidate.model
  );

  const handleFailoverEvent = (event: FailoverEvent) => {
    if (event.type === "switch") {
      const rawId = event.providerId || "";
      const [provId, modId] = rawId.split("::");
      const nextCandidate = candidates.find(
        (c) =>
          c.provider === rawId ||
          c.provider === provId ||
          `${c.provider}::${c.model || "default"}` === `${provId}::${modId}`
      );
      const targetProvider = nextCandidate?.provider || provId || rawId;
      const targetModel = nextCandidate?.model || (modId && modId !== "default" ? modId : undefined);
      const spec = getCloudProvider(targetProvider);
      updateExecutionScope(executionId, {
        providerId: targetProvider,
        activeProvider: targetProvider,
        providerName: spec?.name || targetProvider,
        modelId: targetModel,
        activeModel: targetModel,
        isFallback: true,
        status: "fallback",
        message: event.userMessage,
      });
    } else if (event.type === "success") {
      updateExecutionScope(executionId, {
        status: "executing",
        message: event.userMessage,
      });
    }
    onFailoverEvent?.(event);
  };

  // Use completeWithFailover from the gateway
  const req = {
    systemPrompt: effectiveSystemPrompt,
    userPrompt,
    taskClass,
    local: candidates[0].apiKey === "local-no-credential-required",
    caching: taskType === "long-context",
    segments: [],
  };

  // Consent is inherent to user-configured BYOK providers
  let policy = defaultPolicy();
  for (const c of candidates) {
    if (c.apiKey) {
      policy = recordConsent(policy, c.provider);
    }
  }

  try {
    if (onChunk) {
      let full = "";
      const result = await streamWithFailover(
        req,
        (chunk) => {
          full += chunk;
          onChunk(chunk);
        },
        {
          candidates,
          onEvent: handleFailoverEvent,
          operationId: executionId,
          stageId: taskType,
        },
        policy
      );
      if (!result.ok) {
        const errMsg = (result as { error?: { message?: string } }).error?.message || "AI generation is temporarily unavailable.";
        endExecutionScope(executionId, "error", errMsg);
        throw new Error(errMsg);
      }
      endExecutionScope(executionId, "success");
      const guarded = applyScholarGuardrails(full);
      return guarded.text;
    } else {
      const result = await completeWithFailover(
        req,
        {
          candidates,
          onEvent: handleFailoverEvent,
          operationId: executionId,
          stageId: taskType,
        },
        policy
      );
      if (!result.ok) {
        const errMsg = (result as { error?: { message?: string } }).error?.message || "AI generation is temporarily unavailable.";
        endExecutionScope(executionId, "error", errMsg);
        throw new Error(errMsg);
      }
      endExecutionScope(executionId, "success");
      const rawText = typeof result.value === "string" ? result.value : result.value.text;
      const guarded = applyScholarGuardrails(rawText);
      return guarded.text;
    }
  } catch (err) {
    endExecutionScope(executionId, "error", (err as Error).message);
    throw err;
  }
}
