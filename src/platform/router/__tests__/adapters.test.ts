import { describe, it, expect, vi } from "vitest";
import { anthropicAdapter, geminiAdapter, ollamaAdapter, openAiCompatibleAdapter } from "../adapters";
import { classify } from "../errors";
import type { AdapterChunk, Candidate, RouteRequest } from "../types";

const cand = (provider: Candidate["provider"], extra: Partial<Candidate> = {}): Candidate => ({
  id: `${provider}:m`, lane: "byok", provider, model: "m", label: "M", contextWindow: 100_000, maxOutputTokens: 4096, runsIn: "server", credential: { apiKey: "k" }, ...extra,
});
const req: RouteRequest = { requestId: "r", task: "drafting", messages: [{ role: "system", content: "be brief" }, { role: "user", content: "hi" }], desiredOutputTokens: 100, minOutputTokens: 10 };

function streamBody(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({ start(ctl) { for (const c of chunks) ctl.enqueue(enc.encode(c)); ctl.close(); } });
}
const ok = (chunks: string[]) => vi.fn(async () => new Response(streamBody(chunks), { status: 200 }));
async function collect(it: AsyncIterable<AdapterChunk>) { const out: AdapterChunk[] = []; for await (const c of it) out.push(c); return out; }
const signal = new AbortController().signal;

describe("streaming adapters", () => {
  it("OpenAI-compatible: text split across chunks, tool call assembled, usage, finish", async () => {
    const fetchImpl = ok([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"find","arguments":"{\\"q\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"x\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\ndata: [DONE]\n\n',
    ]);
    const out = await collect(openAiCompatibleAdapter(fetchImpl as unknown as typeof fetch).stream(cand("groq"), req, 100, signal));
    expect(out.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("")).toBe("Hello");
    expect(out).toContainEqual({ type: "tool_call", id: "c1", name: "find", argumentsJson: '{"q":"x"}' });
    expect(out).toContainEqual({ type: "usage", inputTokens: 7, outputTokens: 3 });
    expect(out.at(-1)).toEqual({ type: "finish", reason: "tool_calls" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({ stream: true, max_tokens: 100 });
  });

  it("Anthropic: system prompt separated, text deltas, usage from start and delta", async () => {
    const fetchImpl = ok([
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":5}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);
    const out = await collect(anthropicAdapter(fetchImpl as unknown as typeof fetch).stream(cand("anthropic"), req, 100, signal));
    expect(out).toEqual([{ type: "text", text: "Hi" }, { type: "finish", reason: "length" }, { type: "usage", inputTokens: 12, outputTokens: 5 }]);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.system).toBe("be brief");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("Anthropic: an in-stream overloaded error becomes a retryable failure", async () => {
    const fetchImpl = ok(['event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n']);
    const err = await collect(anthropicAdapter(fetchImpl as unknown as typeof fetch).stream(cand("anthropic"), req, 100, signal)).catch((e) => e);
    expect(classify(err, signal)).toMatchObject({ kind: "overloaded", retryable: true });
  });

  it("Gemini: text parts, usage metadata, safety block is a content filter failure", async () => {
    const fetchImpl = ok(['data: {"candidates":[{"content":{"parts":[{"text":"Yo"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":1}}\n\n']);
    const out = await collect(geminiAdapter(fetchImpl as unknown as typeof fetch).stream(cand("google"), req, 100, signal));
    expect(out).toEqual([{ type: "text", text: "Yo" }, { type: "finish", reason: "stop" }, { type: "usage", inputTokens: 4, outputTokens: 1 }]);
    const blocked = ok(['data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n']);
    const err = await collect(geminiAdapter(blocked as unknown as typeof fetch).stream(cand("google"), req, 100, signal)).catch((e) => e);
    expect(classify(err, signal).kind).toBe("content_filter");
  });

  it("Ollama: newline-delimited JSON with final counts", async () => {
    const fetchImpl = ok(['{"message":{"content":"A"}}\n{"message":{"content":"B"}}\n', '{"done":true,"done_reason":"stop","prompt_eval_count":9,"eval_count":2}\n']);
    const out = await collect(ollamaAdapter(fetchImpl as unknown as typeof fetch).stream(cand("ollama", { runsIn: "browser", credential: undefined }), req, 100, signal));
    expect(out).toEqual([{ type: "text", text: "A" }, { type: "text", text: "B" }, { type: "usage", inputTokens: 9, outputTokens: 2 }, { type: "finish", reason: "stop" }]);
  });

  it("HTTP errors carry status, provider message and Retry-After", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Slow down", code: "rate_limit_exceeded" } }), { status: 429, headers: { "retry-after": "3" } }));
    const err = await collect(openAiCompatibleAdapter(fetchImpl as unknown as typeof fetch).stream(cand("openai"), req, 100, signal)).catch((e) => e);
    expect(classify(err, signal)).toMatchObject({ kind: "rate_limit", httpStatus: 429, retryAfterMs: 3000, message: "Slow down" });
  });
});
