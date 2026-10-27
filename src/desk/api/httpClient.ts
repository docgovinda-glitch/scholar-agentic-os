import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";
import { getClientAiRuntimeConfig } from "../../services/useAiConfig";
import { originalFetch } from "../originalFetch";
import {
  commitProjectToDatabase,
  getMigratedDraftRealId,
  isEphemeralProject,
  isCommittingProject,
} from "./ephemeralMigration";
import { executeAgenticLLM } from "./aiExecution";
import type { RoutingTaskType } from "../aiAccess/aiAccessApi";

/** Raised when the server rejects the session. Callers re-authenticate rather than retry. */
export class UnauthenticatedError extends Error {
  readonly kind = "unauthenticated" as const;
  constructor(message = "Your session has expired. Sign in again to continue.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * Authorization header for the current Supabase session.
 *
 * Read fresh on every request rather than captured once at module load:
 * supabase-js refreshes the access token in the background, and a cached
 * header would keep sending a token that has since expired — surfacing as
 * sporadic 401s after roughly an hour of use.
 */
async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET/DELETE with credentials attached. Uses localized indicators at call sites without blocking the viewport. */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  // If endpoint targets an uncommitted ephemeral project, commit it first before hitting server
  const draftMatch = typeof input === "string" ? input.match(/\/api\/projects\/(draft-[^/]+)(\/.*)?/) : null;
  if (draftMatch) {
    const draftId = draftMatch[1];
    const migratedId = getMigratedDraftRealId(draftId);
    if (migratedId) {
      input = input.replace(draftId, migratedId);
    } else if (isEphemeralProject(draftId) && !isCommittingProject(draftId)) {
      try {
        const committed = await commitProjectToDatabase(draftId);
        input = input.replace(draftId, committed.projectId);
      } catch (e) {
        console.warn(`[authedFetch] Failed to auto-commit draft ${draftId}:`, e);
      }
    }
  }

  const aiConfig = await getClientAiRuntimeConfig().catch(() => null);
  const transientAiHeaders: Record<string, string> = {};
  if (aiConfig && aiConfig.isConfigured) {
    if (aiConfig.provider) transientAiHeaders["x-ai-provider"] = aiConfig.provider;
    if (aiConfig.modelId) transientAiHeaders["x-ai-model"] = aiConfig.modelId;
    if (aiConfig.apiKey) transientAiHeaders["x-ai-api-key"] = aiConfig.apiKey;
    if (aiConfig.baseUrl) transientAiHeaders["x-ai-base-url"] = aiConfig.baseUrl;
  }

  const headers = {
    ...transientAiHeaders,
    ...(init.headers as Record<string, string> | undefined),
    ...(await authHeaders()),
  };
  return await originalFetch(input, { ...init, headers });
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
    const data = (await res.json().catch(() => null)) as {
      requireFrontendLLM?: boolean;
      challengeToken?: string;
      systemPrompt: string;
      userPrompt: string;
      taskType?: RoutingTaskType;
      canonicalSources?: unknown;
    } | null;
    if (data && data.requireFrontendLLM) {
      const llmResult = await executeAgenticLLM(data.systemPrompt, data.userPrompt, data.taskType || "reasoning");
      const baseBody = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
      res = await authedFetch(input, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...baseBody,
          llmResult,
          challengeToken: data.challengeToken,
          canonicalSources: data.canonicalSources,
        }),
      });
    } else {
      // Re-create the response since we consumed it
      res = new Response(JSON.stringify(data), { status: 426, headers: res.headers });
    }
  }
  return res;
}

/** 
 * authedStreamFetch expects the backend to stream Server-Sent Events (SSE). 
 * If it gets a 426, it simulates SSE chunks via the local LLM engine.
 */
export interface StreamEventData {
  message?: string;
  chunk?: string;
  token?: string;
  data?: unknown;
  status?: string;
  ok?: boolean;
  [key: string]: unknown;
}

export async function authedStreamFetch(
  input: string,
  method: string,
  body: unknown,
  onEvent: (event: string, data: StreamEventData) => void
): Promise<void> {
  const res = await authedFetch(input, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 426) {
    const data = (await res.json().catch(() => null)) as {
      requireFrontendLLM?: boolean;
      challengeToken?: string;
      systemPrompt: string;
      userPrompt: string;
      taskType?: RoutingTaskType;
    } | null;
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
        let parsed: unknown;
        const textResult = typeof finalResult === "string" ? finalResult : JSON.stringify(finalResult);
        try {
          parsed = JSON.parse(textResult);
        } catch (_) {
          const fenceMatch = textResult.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
          if (fenceMatch && fenceMatch[1]) {
            try { parsed = JSON.parse(fenceMatch[1].trim()); } catch (_) {}
          }
          if (!parsed) {
            const firstBrace = textResult.indexOf('{');
            const lastBrace = textResult.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              try { parsed = JSON.parse(textResult.slice(firstBrace, lastBrace + 1)); } catch (_) {}
            }
          }
          if (!parsed) {
            const firstBracket = textResult.indexOf('[');
            const lastBracket = textResult.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket > firstBracket) {
              try { parsed = JSON.parse(textResult.slice(firstBracket, lastBracket + 1)); } catch (_) {}
            }
          }
          if (!parsed) {
            throw new Error("Invalid JSON from LLM: " + textResult.slice(0, 120));
          }
        }
        // Then we POST it back to let the backend do its DB updates
        const baseBody = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
        const postRes = await authedFetch(input, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...baseBody, llmResult: parsed, challengeToken: data.challengeToken }),
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
              } catch (e) {
                return;
              }
              if (fallbackCurrentEvent) {
                const evtToDispatch = fallbackCurrentEvent;
                fallbackCurrentEvent = ""; // reset early
                onEvent(evtToDispatch, evtData);
              }
            }
          }
        }
      } catch (err: unknown) {
        try {
          const message = err instanceof Error ? err.message : String(err);
          await Promise.resolve(onEvent("error", { message }));
        } catch (_) {}
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
    } catch (_) {
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
      } catch (e) {
        // ignore JSON parse errors for incomplete/malformed chunks
        return;
      }
      
      if (currentEvent) {
        const evtToDispatch = currentEvent;
        currentEvent = ""; // reset early
        onEvent(evtToDispatch, evtData);
      }
    }
  }
}

export async function json<T>(res: Response): Promise<T> {
  // 401 is distinct from a generic failure: the fix is to sign in again, not
  // to retry, and the shell needs to be able to tell those apart.
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    throw new UnauthenticatedError((body as { error?: string }).error || undefined);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
