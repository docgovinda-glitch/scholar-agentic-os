/**
 * Streaming provider adapters for the router. Each adapter makes exactly one
 * request to exactly one model and reports what happened: text, tool calls,
 * usage and the finish reason, or a ProviderHttpError. Adapters never switch
 * models or retry on their own; that is the router's job, and the router says so.
 *
 * Wire formats:
 * - OpenAI-compatible Chat Completions with `stream: true` (OpenAI, Groq,
 *   DeepSeek, Mistral, LM Studio): SSE `data:` chunks, `[DONE]` terminator.
 * - Anthropic Messages with `stream: true`: SSE events (message_start,
 *   content_block_*, message_delta, message_stop).
 * - Gemini `streamGenerateContent?alt=sse`: SSE chunks of GenerateContentResponse.
 * - Ollama `/api/chat` with `stream: true`: newline-delimited JSON.
 */
import { ProviderHttpError } from "./errors";
import type { AdapterChunk, Candidate, ChatMessage, ContentPart, ProviderAdapter, ProviderId, RouteRequest } from "./types";

type FetchImpl = typeof fetch;

async function post(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal, fetchImpl: FetchImpl): Promise<Response> {
  const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text.slice(0, 500);
    let code: string | undefined;
    try {
      const j = JSON.parse(text) as { error?: { message?: string; code?: string; type?: string; status?: string } };
      message = j.error?.message ?? message;
      code = j.error?.code ?? j.error?.type ?? j.error?.status;
    } catch { /* not JSON */ }
    const h: Record<string, string> = {};
    res.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
    throw new ProviderHttpError(res.status, message || `HTTP ${res.status}`, h, code);
  }
  if (!res.body) throw new ProviderHttpError(502, "Empty response body");
  return res;
}

/** Yields the `data:` payloads of an SSE body (and the event name when present). */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event?: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
        let event: string | undefined;
        const data: string[] = [];
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (data.length) yield { event, data: data.join("\n") };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield JSON.parse(line);
      }
    }
    if (buf.trim()) yield JSON.parse(buf);
  } finally {
    reader.releaseLock();
  }
}

const textOf = (c: ChatMessage["content"]) => (typeof c === "string" ? c : c.filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text").map((p) => p.text).join(""));

// ── OpenAI-compatible ────────────────────────────────────────────────────────
const OPENAI_BASES: Partial<Record<ProviderId, string>> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  deepseek: "https://api.deepseek.com",
  mistral: "https://api.mistral.ai/v1",
  lmstudio: "http://localhost:1234/v1",
};

function openAiMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content, ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}) };
    return {
      role: m.role,
      content: m.content.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } })),
    };
  });
}

export function openAiCompatibleAdapter(fetchImpl: FetchImpl = fetch): ProviderAdapter {
  return {
    async *stream(c: Candidate, req: RouteRequest, maxOutputTokens: number, signal: AbortSignal): AsyncGenerator<AdapterChunk> {
      const base = c.credential?.baseUrl ?? OPENAI_BASES[c.provider];
      if (!base) throw new ProviderHttpError(400, `No endpoint for ${c.provider}`);
      const res = await post(`${base.replace(/\/$/, "")}/chat/completions`, c.credential?.apiKey ? { Authorization: `Bearer ${c.credential.apiKey}` } : {}, {
        model: c.model,
        messages: openAiMessages(req.messages),
        stream: true,
        stream_options: { include_usage: true },
        // OpenAI's own API takes max_completion_tokens; the compatible APIs take max_tokens.
        ...(c.provider === "openai" ? { max_completion_tokens: maxOutputTokens } : { max_tokens: maxOutputTokens }),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.tools?.length ? { tools: req.tools.map((t) => ({ type: "function", function: t })) } : {}),
      }, signal, fetchImpl);

      const calls = new Map<number, { id: string; name: string; args: string }>();
      let finish: AdapterChunk | undefined;
      for await (const { data } of sseEvents(res.body!)) {
        if (data === "[DONE]") break;
        const j = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }>;
          usage?: { prompt_tokens: number; completion_tokens: number } | null;
        };
        const choice = j.choices?.[0];
        if (choice?.delta?.content) yield { type: "text", text: choice.delta.content };
        for (const tc of choice?.delta?.tool_calls ?? []) {
          const cur = calls.get(tc.index) ?? { id: tc.id ?? `call_${tc.index}`, name: "", args: "" };
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(tc.index, cur);
        }
        if (choice?.finish_reason) {
          const r = choice.finish_reason;
          finish = { type: "finish", reason: r === "length" ? "length" : r === "tool_calls" ? "tool_calls" : r === "content_filter" ? "content_filter" : "stop" };
        }
        if (j.usage) yield { type: "usage", inputTokens: j.usage.prompt_tokens, outputTokens: j.usage.completion_tokens };
      }
      for (const call of calls.values()) yield { type: "tool_call", id: call.id, name: call.name, argumentsJson: call.args || "{}" };
      if (finish) yield finish;
    },
  };
}

// ── Anthropic Messages ───────────────────────────────────────────────────────
/** About 1,000 tokens: below this the provider does not cache. */
const CACHEABLE_SYSTEM_CHARS = 4_000;

function anthropicBody(req: RouteRequest, c: Candidate, maxOutputTokens: number) {
  const system = req.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n\n");
  const messages = req.messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.role === "tool"
      ? [{ type: "tool_result", tool_use_id: m.toolCallId, content: textOf(m.content) }]
      : typeof m.content === "string"
        ? m.content
        : m.content.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } })),
  }));
  return {
    model: c.model,
    max_tokens: maxOutputTokens,
    stream: true,
    messages,
    // A long system prompt (grounding sources, house rules) repeats across a workspace's calls: marking it
    // cacheable makes repeats cost a fraction of the input price. Short prompts are below the provider's minimum.
    ...(system ? { system: system.length >= CACHEABLE_SYSTEM_CHARS ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : system } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.tools?.length ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
  };
}

export function anthropicAdapter(fetchImpl: FetchImpl = fetch): ProviderAdapter {
  return {
    async *stream(c, req, maxOutputTokens, signal): AsyncGenerator<AdapterChunk> {
      const base = c.credential?.baseUrl ?? "https://api.anthropic.com/v1";
      const res = await post(`${base}/messages`, { "x-api-key": c.credential?.apiKey ?? "", "anthropic-version": "2023-06-01" }, anthropicBody(req, c, maxOutputTokens), signal, fetchImpl);
      let input = 0;
      let output = 0;
      const blocks = new Map<number, { id: string; name: string; args: string }>();
      for await (const { data } of sseEvents(res.body!)) {
        const j = JSON.parse(data) as {
          type: string; index?: number;
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          content_block?: { type: string; id?: string; name?: string };
          delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
          usage?: { output_tokens?: number };
          error?: { type?: string; message?: string };
        };
        if (j.type === "error") throw new ProviderHttpError(j.error?.type === "overloaded_error" ? 529 : 500, j.error?.message ?? "Stream error", {}, j.error?.type);
        if (j.type === "message_start") input = j.message?.usage?.input_tokens ?? 0;
        if (j.type === "content_block_start" && j.content_block?.type === "tool_use" && j.index !== undefined) blocks.set(j.index, { id: j.content_block.id ?? `tool_${j.index}`, name: j.content_block.name ?? "", args: "" });
        if (j.type === "content_block_delta" && j.delta?.type === "text_delta" && j.delta.text) yield { type: "text", text: j.delta.text };
        if (j.type === "content_block_delta" && j.delta?.type === "input_json_delta" && j.index !== undefined) {
          const b = blocks.get(j.index);
          if (b) b.args += j.delta.partial_json ?? "";
        }
        if (j.type === "content_block_stop" && j.index !== undefined && blocks.has(j.index)) {
          const b = blocks.get(j.index)!;
          yield { type: "tool_call", id: b.id, name: b.name, argumentsJson: b.args || "{}" };
        }
        if (j.type === "message_delta") {
          output = j.usage?.output_tokens ?? output;
          const r = j.delta?.stop_reason;
          if (r) yield { type: "finish", reason: r === "max_tokens" ? "length" : r === "tool_use" ? "tool_calls" : "stop" };
        }
      }
      yield { type: "usage", inputTokens: input, outputTokens: output };
    },
  };
}

// ── Google Gemini ────────────────────────────────────────────────────────────
export function geminiAdapter(fetchImpl: FetchImpl = fetch): ProviderAdapter {
  return {
    async *stream(c, req, maxOutputTokens, signal): AsyncGenerator<AdapterChunk> {
      const base = c.credential?.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
      const system = req.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n\n");
      const contents = req.messages.filter((m) => m.role !== "system").map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: typeof m.content === "string" ? [{ text: m.content }] : m.content.map((p) => (p.type === "text" ? { text: p.text } : { inlineData: { mimeType: p.mediaType, data: p.data } })),
      }));
      const res = await post(`${base}/models/${encodeURIComponent(c.model)}:streamGenerateContent?alt=sse`, { "x-goog-api-key": c.credential?.apiKey ?? "" }, {
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { maxOutputTokens, ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) },
        ...(req.tools?.length ? { tools: [{ functionDeclarations: req.tools }] } : {}),
      }, signal, fetchImpl);
      let usage: AdapterChunk | undefined;
      let n = 0;
      for await (const { data } of sseEvents(res.body!)) {
        const j = JSON.parse(data) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean; functionCall?: { name: string; args?: unknown } }> }; finishReason?: string }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          promptFeedback?: { blockReason?: string };
        };
        if (j.promptFeedback?.blockReason) throw new ProviderHttpError(400, `Blocked by safety filter (${j.promptFeedback.blockReason})`, {}, "content_filter");
        const cand = j.candidates?.[0];
        for (const p of cand?.content?.parts ?? []) {
          // Thought summaries are the model thinking aloud, not the answer.
          if (p.text && !p.thought) yield { type: "text", text: p.text };
          if (p.functionCall) yield { type: "tool_call", id: `call_${n++}`, name: p.functionCall.name, argumentsJson: JSON.stringify(p.functionCall.args ?? {}) };
        }
        if (j.usageMetadata) usage = { type: "usage", inputTokens: j.usageMetadata.promptTokenCount ?? 0, outputTokens: j.usageMetadata.candidatesTokenCount ?? 0 };
        if (cand?.finishReason && cand.finishReason !== "FINISH_REASON_UNSPECIFIED") {
          const r = cand.finishReason;
          yield { type: "finish", reason: r === "MAX_TOKENS" ? "length" : r === "SAFETY" || r === "RECITATION" ? "content_filter" : "stop" };
        }
      }
      if (usage) yield usage;
    },
  };
}

// ── Ollama (browser → user's machine) ────────────────────────────────────────
export function ollamaAdapter(fetchImpl: FetchImpl = fetch): ProviderAdapter {
  return {
    async *stream(c, req, maxOutputTokens, signal): AsyncGenerator<AdapterChunk> {
      const base = c.credential?.baseUrl ?? "http://localhost:11434";
      const res = await post(`${base}/api/chat`, {}, {
        model: c.model,
        stream: true,
        messages: req.messages.map((m) => ({ role: m.role, content: textOf(m.content) })),
        options: { num_predict: maxOutputTokens, ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) },
      }, signal, fetchImpl);
      for await (const line of ndjson(res.body!)) {
        const j = line as { message?: { content?: string }; done?: boolean; done_reason?: string; prompt_eval_count?: number; eval_count?: number; error?: string };
        if (j.error) throw new ProviderHttpError(500, j.error);
        if (j.message?.content) yield { type: "text", text: j.message.content };
        if (j.done) {
          yield { type: "usage", inputTokens: j.prompt_eval_count ?? 0, outputTokens: j.eval_count ?? 0 };
          yield { type: "finish", reason: j.done_reason === "length" ? "length" : "stop" };
        }
      }
    },
  };
}

/** Adapters keyed by provider, for `RouterOptions.adapters`. */
export function defaultAdapters(fetchImpl: FetchImpl = fetch): Partial<Record<ProviderId, ProviderAdapter>> {
  const oa = openAiCompatibleAdapter(fetchImpl);
  return { openai: oa, groq: oa, deepseek: oa, mistral: oa, lmstudio: oa, custom: oa, anthropic: anthropicAdapter(fetchImpl), google: geminiAdapter(fetchImpl), ollama: ollamaAdapter(fetchImpl) };
}
