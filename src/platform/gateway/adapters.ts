/**
 * Provider adapters — one per calling convention, not one per provider.
 *
 * Reuses the existing, already-isomorphic provider catalog
 * (src/config/providerCatalog.ts) for URLs, auth headers, and default
 * models rather than duplicating that table. New OpenAI-compatible
 * providers therefore need zero new adapter code — only a catalog entry.
 *
 * Gemini and Cohere adapters (added alongside streaming support) close the
 * gap this file used to document: server/routes/ai.ts implements both
 * directly (Gemini via the `@google/genai` SDK, Cohere via raw fetch) and
 * was the migration source for both — the request/response shapes below
 * are deliberately built to match what that code already sends and
 * expects, not guessed from provider docs alone.
 *
 * Streaming (`stream()`) is implemented for openai-compatible, anthropic,
 * and gemini — all three have stable, well-documented SSE wire formats.
 * Cohere's `stream()` is deliberately NOT implemented: its v1 chat
 * streaming format was not something this migration could verify against
 * a live call, and shipping a guessed parser for a wire format is worse
 * than the honest gap — `ProviderAdapter.stream` is optional precisely so
 * a provider without one falls back to `complete()` at the gateway level
 * (see gateway.ts's `stream()`) rather than failing outright.
 */

import {
  getCloudProvider,
  chatUrl,
  resolveBaseUrl,
  buildAuthHeaders,
  type CloudProviderSpec,
} from "../../config/providerCatalog";
import { getLocalRunner, runnerChatUrl, type LocalRunnerSpec } from "../../config/localRunnerCatalog";
import type { CompletionRequest, ProviderAdapter } from "./types";
import {
  blacklistModel,
  quarantineModel,
  isModelQuarantined,
  getCachedDiscoveredModels,
  isModelBlacklisted,
  recordProviderFailure,
  isGenerativeChatModel,
} from "../../services/modelDiscovery";
import { isModelUnavailableError } from "../../services/aiErrors";

/**
 * A local runtime runs on the CALLER's own machine — there is no third-party
 * SLA to lean on, so unlike the cloud adapters above (which trust the
 * provider's own timeout behavior), a local call gets its own bound: long
 * enough for a slow machine to finish a real generation, short enough that a
 * hung or crashed local process fails visibly rather than leaving Studio
 * waiting forever.
 */
const LOCAL_GENERATION_TIMEOUT_MS = 120_000;

async function fetchLocalWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCAL_GENERATION_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Local runtime did not respond within ${LOCAL_GENERATION_TIMEOUT_MS / 1000}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function requireLocalModel(runnerId: string, model: string | undefined): string {
  if (!model) {
    throw new Error(`No model specified for local runner "${runnerId}" — discover an installed model before completing.`);
  }
  return model;
}

/**
 * Reads a `text/event-stream` response body, yielding each `data:` line's
 * payload (prefix stripped, trimmed).
 */
async function* readSSE(response: Response): AsyncGenerator<string> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data) yield data;
    }
  }
}

/**
 * Carries the HTTP status, raw body, and retryAfterMs of a failed provider request.
 */
export class AdapterHttpError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly status: number,
    public readonly detail: string,
    public readonly retryAfterMs?: number
  ) {
    super(`${providerId} request failed (${status}): ${detail.slice(0, 300)}`);
    this.name = "AdapterHttpError";
  }
}

export async function checkModelUnavailable(response: Response): Promise<{ isUnavailable: boolean; detail: string }> {
  try {
    const clone = response.clone();
    const text = await clone.text();
    return {
      isUnavailable: isModelUnavailableError(response.status, text),
      detail: text,
    };
  } catch {
    return {
      isUnavailable: response.status === 404,
      detail: "",
    };
  }
}

async function throwForBadResponse(id: string, response: Response, model?: string, cachedDetail?: string): Promise<never> {
  const detail = cachedDetail !== undefined && cachedDetail !== "" ? cachedDetail : (await response.text().catch(() => ""));
  let retryAfterMs: number | undefined = undefined;
  const rawRetry = response.headers?.get?.("retry-after");
  if (rawRetry) {
    const s = Number(rawRetry);
    if (!Number.isNaN(s) && s > 0) {
      retryAfterMs = s * 1000;
    }
  }

  // Update provider health state machine
  const isAuth =
    response.status === 401 ||
    response.status === 403 ||
    (response.status === 400 && /api[_-]?key|credential|unauthorized/i.test(detail));

  if (isAuth) {
    recordProviderFailure(id, "invalid_key", undefined, detail);
  } else if (response.status === 429) {
    recordProviderFailure(id, "rate_limit", retryAfterMs, detail);
  } else if (response.status >= 500) {
    recordProviderFailure(id, "server_error", undefined, detail);
  } else if (model && isModelUnavailableError(response.status, detail)) {
    quarantineModel(id, model, `HTTP ${response.status} model decommissioned/unavailable: ${detail.slice(0, 100)}`);
  }

  throw new AdapterHttpError(id, response.status, detail, retryAfterMs);
}

function getDynamicModelFallbacks(providerId: string, currentModel: string, spec: CloudProviderSpec): string[] {
  quarantineModel(providerId, currentModel, "model_not_found");
  const cached = getCachedDiscoveredModels(providerId) || [];
  const discovered = cached.map((m) => m.id);
  const candidates = discovered.length > 0 ? discovered : spec.models && spec.models.length > 0 ? spec.models : [spec.defaultModel];
  return candidates.filter(
    (m) => m !== currentModel && !isModelQuarantined(providerId, m) && isGenerativeChatModel(providerId, m)
  );
}

class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(public id: string, private spec: CloudProviderSpec) {}

  private buildBody(req: CompletionRequest, stream: boolean, modelOverride?: string) {
    const model = modelOverride || req.model || this.spec.defaultModel;
    const userPrompt = req.userPrompt && req.userPrompt.trim() ? req.userPrompt : "Proceed with research task.";
    
    let systemMessage: any = undefined;
    if (req.systemPrompt && req.systemPrompt.trim()) {
      if (this.id === "openrouter" && req.caching) {
        systemMessage = {
          role: "system",
          content: [
            {
              type: "text",
              text: req.systemPrompt,
              cache_control: { type: "ephemeral" }
            }
          ]
        };
      } else {
        systemMessage = { role: "system", content: req.systemPrompt };
      }
    }

    let userContent: any = userPrompt;
    if (req.images && req.images.length > 0) {
      userContent = [
        { type: "text", text: userPrompt },
        ...req.images.map((img) => {
          const raw = (img as any).dataUrl || (img as any).data || "";
          return {
            type: "image_url",
            image_url: {
              url: raw.startsWith("data:")
                ? raw
                : `data:${img.mimeType || "image/jpeg"};base64,${raw}`,
            },
          };
        }),
      ];
    }

    return JSON.stringify({
      model,
      messages: [
        ...(systemMessage ? [systemMessage] : []),
        { role: "user", content: userContent },
      ],
      temperature: req.temperature ?? 0.3,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
      ...(stream ? { stream: true } : {}),
    });
  }

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    let model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", ...buildAuthHeaders(this.spec, req.apiKey) };
    let response = await fetch(url, { method: "POST", headers, body: this.buildBody(req, false, model), signal: req.signal });
    
    let lastDetail = "";
    // Controlled in-provider fallback on model unavailability (404 or 400/422 decommissioned)
    if (!response.ok) {
      const check = await checkModelUnavailable(response);
      lastDetail = check.detail;
      if (check.isUnavailable) {
        quarantineModel(this.id, model, check.detail || "model_unavailable");
        const fallbacks = getDynamicModelFallbacks(this.id, model, this.spec);
        for (const fbModel of fallbacks) {
          const fallbackBody = this.buildBody(req, false, fbModel);
          const retryRes = await fetch(url, { method: "POST", headers, body: fallbackBody, signal: req.signal });
          if (retryRes.ok) {
            response = retryRes;
            model = fbModel;
            lastDetail = "";
            break;
          }
          const checkRetry = await checkModelUnavailable(retryRes);
          lastDetail = checkRetry.detail;
          if (!checkRetry.isUnavailable) {
            response = retryRes;
            model = fbModel;
            break;
          }
          quarantineModel(this.id, fbModel, checkRetry.detail || "model_unavailable");
        }
      }
    }

    if (!response.ok) return throwForBadResponse(this.id, response, model, lastDetail);
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    return { text, model };
  }

  async stream(req: CompletionRequest, onChunk: (delta: string) => void): Promise<{ text: string; model: string }> {
    let model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", Accept: "text/event-stream", ...buildAuthHeaders(this.spec, req.apiKey) };
    let response = await fetch(url, { method: "POST", headers, body: this.buildBody(req, true, model), signal: req.signal });

    let lastDetail = "";
    // Controlled in-provider fallback on model unavailability (404 or 400/422 decommissioned)
    if (!response.ok) {
      const check = await checkModelUnavailable(response);
      lastDetail = check.detail;
      if (check.isUnavailable) {
        quarantineModel(this.id, model, check.detail || "model_unavailable");
        const fallbacks = getDynamicModelFallbacks(this.id, model, this.spec);
        for (const fbModel of fallbacks) {
          const fallbackBody = this.buildBody(req, true, fbModel);
          const retryRes = await fetch(url, { method: "POST", headers, body: fallbackBody, signal: req.signal });
          if (retryRes.ok) {
            response = retryRes;
            model = fbModel;
            lastDetail = "";
            break;
          }
          const checkRetry = await checkModelUnavailable(retryRes);
          lastDetail = checkRetry.detail;
          if (!checkRetry.isUnavailable) {
            response = retryRes;
            model = fbModel;
            break;
          }
          quarantineModel(this.id, fbModel, checkRetry.detail || "model_unavailable");
        }
      }
    }

    if (!response.ok) return throwForBadResponse(this.id, response, model, lastDetail);

    let text = "";
    for await (const data of readSSE(response)) {
      if (data === "[DONE]") break;
      try {
        const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = parsed.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          text += delta;
          onChunk(delta);
        }
      } catch {
        // A malformed or unexpected line — skip it rather than aborting the whole stream.
      }
    }
    return { text, model };
  }
}

class AnthropicAdapter implements ProviderAdapter {
  constructor(public id: string, private spec: CloudProviderSpec) {}

  private buildBody(req: CompletionRequest, stream: boolean, modelOverride?: string) {
    const model = modelOverride || req.model || this.spec.defaultModel;
    const userPrompt = req.userPrompt && req.userPrompt.trim() ? req.userPrompt : "Proceed with research task.";
    let userContent: any = userPrompt;
    if (req.images && req.images.length > 0) {
      userContent = [
        ...req.images.map((img) => {
          const raw = (img as any).dataUrl || (img as any).data || "";
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: img.mimeType || "image/jpeg",
              data: raw.replace(/^data:[^;]+;base64,/, ""),
            },
          };
        }),
        { type: "text", text: userPrompt },
      ];
    }

    return JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 4096,
      ...(req.systemPrompt && req.systemPrompt.trim() ? { system: req.systemPrompt } : {}),
      messages: [{ role: "user", content: userContent }],
      temperature: req.temperature ?? 0.3,
      ...(stream ? { stream: true } : {}),
    });
  }

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    let model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", ...buildAuthHeaders(this.spec, req.apiKey) };
    let response = await fetch(url, { method: "POST", headers, body: this.buildBody(req, false, model), signal: req.signal });

    let lastDetail = "";
    if (!response.ok) {
      const check = await checkModelUnavailable(response);
      lastDetail = check.detail;
      if (check.isUnavailable) {
        quarantineModel(this.id, model, check.detail || "model_unavailable");
        const fallbacks = getDynamicModelFallbacks(this.id, model, this.spec);
        for (const fbModel of fallbacks) {
          const retryRes = await fetch(url, { method: "POST", headers, body: this.buildBody(req, false, fbModel), signal: req.signal });
          if (retryRes.ok) {
            response = retryRes;
            model = fbModel;
            lastDetail = "";
            break;
          }
          const checkRetry = await checkModelUnavailable(retryRes);
          lastDetail = checkRetry.detail;
          if (!checkRetry.isUnavailable) {
            response = retryRes;
            model = fbModel;
            break;
          }
          quarantineModel(this.id, fbModel, checkRetry.detail || "model_unavailable");
        }
      }
    }

    if (!response.ok) return throwForBadResponse(this.id, response, model, lastDetail);
    const data = (await response.json()) as { content?: { text?: string }[] };
    const content = Array.isArray(data?.content) ? data.content : [];
    const text = content.map((c) => c.text ?? "").join("");
    return { text, model };
  }

  async stream(req: CompletionRequest, onChunk: (delta: string) => void): Promise<{ text: string; model: string }> {
    let model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", Accept: "text/event-stream", ...buildAuthHeaders(this.spec, req.apiKey) };
    let response = await fetch(url, { method: "POST", headers, body: this.buildBody(req, true, model), signal: req.signal });

    let lastDetail = "";
    if (!response.ok) {
      const check = await checkModelUnavailable(response);
      lastDetail = check.detail;
      if (check.isUnavailable) {
        quarantineModel(this.id, model, check.detail || "model_unavailable");
        const fallbacks = getDynamicModelFallbacks(this.id, model, this.spec);
        for (const fbModel of fallbacks) {
          const retryRes = await fetch(url, { method: "POST", headers, body: this.buildBody(req, true, fbModel), signal: req.signal });
          if (retryRes.ok) {
            response = retryRes;
            model = fbModel;
            lastDetail = "";
            break;
          }
          const checkRetry = await checkModelUnavailable(retryRes);
          lastDetail = checkRetry.detail;
          if (!checkRetry.isUnavailable) {
            response = retryRes;
            model = fbModel;
            break;
          }
          quarantineModel(this.id, fbModel, checkRetry.detail || "model_unavailable");
        }
      }
    }

    if (!response.ok) return throwForBadResponse(this.id, response, model, lastDetail);

    let text = "";
    for await (const data of readSSE(response)) {
      try {
        const parsed = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          text += parsed.delta.text;
          onChunk(parsed.delta.text);
        }
      } catch {
        // Non-JSON or unrelated event — skip.
      }
    }
    return { text, model };
  }
}

class GeminiAdapter implements ProviderAdapter {
  public id = "gemini";
  constructor(private spec: CloudProviderSpec) {}

  private buildBody(req: CompletionRequest) {
    const userPrompt = req.userPrompt && req.userPrompt.trim() ? req.userPrompt : "Proceed with research task.";
    const parts: any[] = [{ text: userPrompt }];

    if (req.images && req.images.length > 0) {
      for (const img of req.images) {
        const raw = (img as any).dataUrl || (img as any).data || "";
        if (!raw) continue;
        const mimeType =
          img.mimeType ||
          (raw.startsWith("data:")
            ? raw.split(";")[0].replace("data:", "")
            : "image/jpeg");
        const base64Data = raw.includes(";base64,")
          ? raw.split(";base64,")[1]
          : raw;
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
    }

    return {
      contents: [{ role: "user", parts }],
      ...(req.systemPrompt && req.systemPrompt.trim() ? { systemInstruction: { parts: [{ text: req.systemPrompt }] } } : {}),
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
      },
    };
  }

  private extractText(data: any): string {
    if (!data || typeof data !== "object") return "";
    const candidate = data.candidates?.[0];
    if (!candidate) {
      if (data.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked request: ${data.promptFeedback.blockReason}`);
      }
      if (data.error?.message) {
        throw new Error(`Gemini API error: ${data.error.message}`);
      }
      return "";
    }
    const parts = candidate.content?.parts;
    if (Array.isArray(parts)) {
      return parts.map((p: any) => p?.text ?? "").join("");
    }
    return "";
  }

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    let model = (req.model || this.spec.defaultModel).replace(/^models\//, "");
    const baseUrl = resolveBaseUrl(this.spec);
    const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(req.apiKey)}`;
    let response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(req)),
      signal: req.signal,
    });

    let lastDetail = "";
    // Dynamic Controlled fallback on model unavailability (404 or 400/422 decommissioned)
    if (!response.ok) {
      const check = await checkModelUnavailable(response);
      lastDetail = check.detail;
      if (check.isUnavailable) {
        quarantineModel(this.id, model, check.detail || "model_unavailable");
        const fallbacks = getDynamicModelFallbacks(this.id, model, this.spec);
        for (const fbModel of fallbacks) {
          const cleanFb = fbModel.replace(/^models\//, "");
          const fbUrl = `${baseUrl}/models/${cleanFb}:generateContent?key=${encodeURIComponent(req.apiKey)}`;
          const retryRes = await fetch(fbUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.buildBody(req)),
            signal: req.signal,
          });
          if (retryRes.ok) {
            response = retryRes;
            model = cleanFb;
            lastDetail = "";
            break;
          }
          const checkRetry = await checkModelUnavailable(retryRes);
          lastDetail = checkRetry.detail;
          if (!checkRetry.isUnavailable) {
            response = retryRes;
            model = cleanFb;
            break;
          }
          quarantineModel(this.id, cleanFb, checkRetry.detail || "model_unavailable");
        }
      }
    }

    if (!response.ok) return throwForBadResponse(this.id, response, model, lastDetail);
    const data = (await response.json()) as any;
    return { text: this.extractText(data), model };
  }

  async stream(req: CompletionRequest, onChunk: (delta: string) => void): Promise<{ text: string; model: string }> {
    let model = (req.model || this.spec.defaultModel).replace(/^models\//, "");
    const baseUrl = resolveBaseUrl(this.spec);
    const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(req.apiKey)}`;
    let response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(req)),
      signal: req.signal,
    });

    let lastDetail = "";
    // Dynamic Controlled fallback on model unavailability (404 or 400/422 decommissioned)
    if (!response.ok) {
      const check = await checkModelUnavailable(response);
      lastDetail = check.detail;
      if (check.isUnavailable) {
        quarantineModel(this.id, model, check.detail || "model_unavailable");
        const fallbacks = getDynamicModelFallbacks(this.id, model, this.spec);
        for (const fbModel of fallbacks) {
          const cleanFb = fbModel.replace(/^models\//, "");
          const fbUrl = `${baseUrl}/models/${cleanFb}:streamGenerateContent?alt=sse&key=${encodeURIComponent(req.apiKey)}`;
          const retryRes = await fetch(fbUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.buildBody(req)),
            signal: req.signal,
          });
          if (retryRes.ok) {
            response = retryRes;
            model = cleanFb;
            lastDetail = "";
            break;
          }
          const checkRetry = await checkModelUnavailable(retryRes);
          lastDetail = checkRetry.detail;
          if (!checkRetry.isUnavailable) {
            response = retryRes;
            model = cleanFb;
            break;
          }
          quarantineModel(this.id, cleanFb, checkRetry.detail || "model_unavailable");
        }
      }
    }

    if (!response.ok) return throwForBadResponse(this.id, response, model, lastDetail);

    let text = "";
    for await (const data of readSSE(response)) {
      try {
        const parsed = JSON.parse(data) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const delta = this.extractText(parsed);
        if (delta) {
          text += delta;
          onChunk(delta);
        }
      } catch {
        // Skip malformed chunks rather than aborting the stream.
      }
    }
    return { text, model };
  }
}

class CohereAdapter implements ProviderAdapter {
  public id = "cohere";
  constructor(private spec: CloudProviderSpec) {}

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    const model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", ...buildAuthHeaders(this.spec, req.apiKey) };
    const body = JSON.stringify({
      model,
      preamble: req.systemPrompt || "You are a helpful assistant.",
      message: req.userPrompt,
      temperature: req.temperature ?? 0.5,
    });
    const response = await fetch(url, { method: "POST", headers, body });
    if (!response.ok) return throwForBadResponse(this.id, response, model);
    const data = (await response.json()) as { text?: string };
    return { text: (data.text ?? "").trim(), model };
  }
}

class LocalOpenAICompatibleAdapter implements ProviderAdapter {
  constructor(public id: string, private spec: LocalRunnerSpec) {}

  private buildBody(req: CompletionRequest, model: string) {
    return JSON.stringify({
      model,
      messages: [
        ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
        { role: "user", content: req.userPrompt },
      ],
      temperature: req.temperature ?? 0.3,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
    });
  }

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    const model = requireLocalModel(this.id, req.model);
    const url = runnerChatUrl(this.spec);
    const response = await fetchLocalWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: this.buildBody(req, model),
    });
    if (!response.ok) return throwForBadResponse(this.id, response, model);
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: data.choices?.[0]?.message?.content ?? "", model };
  }
}

class OllamaAdapter implements ProviderAdapter {
  constructor(public id: string, private spec: LocalRunnerSpec) {}

  private buildBody(req: CompletionRequest, model: string) {
    return JSON.stringify({
      model,
      messages: [
        ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
        { role: "user", content: req.userPrompt },
      ],
      stream: false,
      options: { temperature: req.temperature ?? 0.3 },
    });
  }

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    const model = requireLocalModel(this.id, req.model);
    const url = runnerChatUrl(this.spec);
    const response = await fetchLocalWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: this.buildBody(req, model),
    });
    if (!response.ok) return throwForBadResponse(this.id, response, model);
    const data = (await response.json()) as { message?: { content?: string } };
    return { text: data.message?.content ?? "", model };
  }
}

/** Build the adapter for a given provider id, or undefined if unsupported. */
export function getAdapter(providerId: string): ProviderAdapter | undefined {
  const spec = getCloudProvider(providerId);
  if (spec) {
    if (spec.apiStyle === "openai-compatible") return new OpenAICompatibleAdapter(providerId, spec);
    if (spec.apiStyle === "anthropic") return new AnthropicAdapter(providerId, spec);
    if (spec.apiStyle === "gemini") return new GeminiAdapter(spec);
    if (spec.apiStyle === "cohere") return new CohereAdapter(spec);
    return undefined;
  }

  const localSpec = getLocalRunner(providerId);
  if (localSpec) {
    if (localSpec.apiStyle === "ollama-native") return new OllamaAdapter(providerId, localSpec);
    if (localSpec.apiStyle === "openai-compatible") return new LocalOpenAICompatibleAdapter(providerId, localSpec);
  }

  return undefined;
}
