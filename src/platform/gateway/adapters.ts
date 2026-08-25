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

/**
 * Unlike a cloud provider, a local runner has no catalog default model —
 * which model is even loaded is discovered at request time (see
 * src/desk/regions/localStudioExecution.ts), never guessed here.
 */
function requireLocalModel(runnerId: string, model: string | undefined): string {
  if (!model) {
    throw new Error(`No model specified for local runner "${runnerId}" — discover an installed model before completing.`);
  }
  return model;
}

/**
 * Reads a `text/event-stream` response body, yielding each `data:` line's
 * payload (prefix stripped, trimmed). Deliberately minimal — a single-line
 * JSON payload per event, which is what every provider adapted here
 * actually sends; the full SSE spec's multi-line `data:` fields and
 * `id:`/`retry:` fields are not needed for any of them.
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
 * Carries the HTTP status and raw body of a failed provider request, so a
 * caller that wants to classify the failure (gateway.ts's
 * completeWithFailover, via aiErrors.ts's classifyHttpError) can do so
 * precisely instead of treating every adapter failure as an opaque, equally
 * bad "unknown" error.
 */
export class AdapterHttpError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly status: number,
    public readonly detail: string
  ) {
    super(`${providerId} request failed (${status}): ${detail.slice(0, 300)}`);
    this.name = "AdapterHttpError";
  }
}

async function throwForBadResponse(id: string, response: Response): Promise<never> {
  const detail = await response.text().catch(() => "");
  throw new AdapterHttpError(id, response.status, detail);
}

class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(public id: string, private spec: CloudProviderSpec) {}

  private buildBody(req: CompletionRequest, stream: boolean) {
    const model = req.model || this.spec.defaultModel;
    
    let systemMessage: any = undefined;
    if (req.systemPrompt) {
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

    return JSON.stringify({
      model,
      messages: [
        ...(systemMessage ? [systemMessage] : []),
        { role: "user", content: req.userPrompt },
      ],
      temperature: req.temperature ?? 0.3,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
      ...(stream ? { stream: true } : {}),
    });
  }

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    const model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", ...buildAuthHeaders(this.spec, req.apiKey) };
    const response = await fetch(url, { method: "POST", headers, body: this.buildBody(req, false) });
    if (!response.ok) return throwForBadResponse(this.id, response);
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    return { text, model };
  }

  async stream(req: CompletionRequest, onChunk: (delta: string) => void): Promise<{ text: string; model: string }> {
    const model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", Accept: "text/event-stream", ...buildAuthHeaders(this.spec, req.apiKey) };
    const response = await fetch(url, { method: "POST", headers, body: this.buildBody(req, true) });
    if (!response.ok) return throwForBadResponse(this.id, response);

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
        // A malformed or unexpected line (e.g. a keep-alive comment) — skip it rather than aborting the whole stream.
      }
    }
    return { text, model };
  }
}

class AnthropicAdapter implements ProviderAdapter {
  constructor(public id: string, private spec: CloudProviderSpec) {}

  private buildBody(req: CompletionRequest, stream: boolean) {
    const model = req.model || this.spec.defaultModel;
    return JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.systemPrompt,
      messages: [{ role: "user", content: req.userPrompt }],
      temperature: req.temperature ?? 0.3,
      ...(stream ? { stream: true } : {}),
    });
  }

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    const model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", ...buildAuthHeaders(this.spec, req.apiKey) };
    const response = await fetch(url, { method: "POST", headers, body: this.buildBody(req, false) });
    if (!response.ok) return throwForBadResponse(this.id, response);
    const data = (await response.json()) as { content?: { text?: string }[] };
    const content = Array.isArray(data?.content) ? data.content : [];
    const text = content.map((c) => c.text ?? "").join("");
    return { text, model };
  }

  async stream(req: CompletionRequest, onChunk: (delta: string) => void): Promise<{ text: string; model: string }> {
    const model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", Accept: "text/event-stream", ...buildAuthHeaders(this.spec, req.apiKey) };
    const response = await fetch(url, { method: "POST", headers, body: this.buildBody(req, true) });
    if (!response.ok) return throwForBadResponse(this.id, response);

    let text = "";
    for await (const data of readSSE(response)) {
      try {
        const parsed = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          text += parsed.delta.text;
          onChunk(parsed.delta.text);
        }
      } catch {
        // Non-JSON or unrelated event (e.g. "message_start") — skip.
      }
    }
    return { text, model };
  }
}

class GeminiAdapter implements ProviderAdapter {
  public id = "gemini";
  constructor(private spec: CloudProviderSpec) {}

  private buildBody(req: CompletionRequest) {
    return {
      contents: [{ role: "user", parts: [{ text: req.userPrompt }] }],
      ...(req.systemPrompt ? { systemInstruction: { parts: [{ text: req.systemPrompt }] } } : {}),
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
    const model = req.model || this.spec.defaultModel;
    const url = `${resolveBaseUrl(this.spec)}/models/${model}:generateContent?key=${encodeURIComponent(req.apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(req)),
    });
    if (!response.ok) return throwForBadResponse(this.id, response);
    const data = (await response.json()) as any;
    return { text: this.extractText(data), model };
  }

  async stream(req: CompletionRequest, onChunk: (delta: string) => void): Promise<{ text: string; model: string }> {
    const model = req.model || this.spec.defaultModel;
    const url = `${resolveBaseUrl(this.spec)}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(req.apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.buildBody(req)),
    });
    if (!response.ok) return throwForBadResponse(this.id, response);

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
    if (!response.ok) return throwForBadResponse(this.id, response);
    const data = (await response.json()) as { text?: string };
    return { text: (data.text ?? "").trim(), model };
  }

  // No stream() — see this file's module comment for why.
}

/**
 * Ollama's native chat API (`/api/chat`) — distinct from every cloud adapter
 * above in one load-bearing way: no auth header, ever. A local runtime
 * authenticates with nothing, and this class never builds one — the whole
 * point of "local" is that no credential exists to leak.
 */
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
    if (!response.ok) return throwForBadResponse(this.id, response);
    const data = (await response.json()) as { message?: { content?: string } };
    return { text: data.message?.content ?? "", model };
  }

  // No stream() — Studio's refine() (the only caller today) never calls
  // gateway.stream(); an untested speculative streaming parser is worse
  // than the honest gap (see this file's module comment on Cohere).
}

/**
 * The eight non-Ollama local runners (LM Studio, Jan, LocalAI, llama.cpp,
 * KoboldCPP, vLLM, Text Generation WebUI, OmniRoute) all speak the same
 * OpenAI-compatible wire format a cloud OpenAI-compatible provider does —
 * the request/response shape here deliberately mirrors
 * OpenAICompatibleAdapter above for exactly that reason. What's genuinely
 * different is the target: `runnerChatUrl` (this device's localhost, from
 * localRunnerCatalog.ts) instead of `chatUrl` (a cloud host), and no auth
 * header at all, ever.
 */
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
    if (!response.ok) return throwForBadResponse(this.id, response);
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: data.choices?.[0]?.message?.content ?? "", model };
  }

  // No stream() — see OllamaAdapter's note above; the same reasoning applies.
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
