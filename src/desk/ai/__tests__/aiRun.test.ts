import { describe, it, expect, vi } from "vitest";
vi.mock("../../api/client", () => ({ authHeaders: async () => ({ Authorization: "Bearer t" }) }));
import { AiRunError, runAi, runAiText } from "../aiRun";
import type { RouterEvent } from "../../../platform/router/types";

const sse = (events: object[]) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const ev of events) c.enqueue(e.encode(`event: x\ndata: ${JSON.stringify(ev)}\n\n`)); c.close(); } }), { status: 200 });
const input = { task: "drafting" as const, messages: [{ role: "user" as const, content: "hi" }] };

describe("runAi", () => {
  it("streams server events and returns the text", async () => {
    const fetchImpl = vi.fn(async () => sse([{ type: "route_start", requestId: "r", chain: [] }, { type: "token", text: "Hel" }, { type: "token", text: "lo" }, { type: "done", candidateId: "c", label: "M", lane: "byok", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, source: "provider" }, trace: [] }]));
    const text = await runAiText(input, new AbortController().signal, undefined, { fetchImpl: fetchImpl as unknown as typeof fetch, keyring: [{ provider: "openai", model: "m", apiKey: "k" }] });
    expect(text).toBe("Hello");
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["x-ai-keyring"]).toBeTruthy();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("continues on the device after a server hand-off, in the same event stream", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "/api/ai/run") return sse([{ type: "route_start", requestId: "r", chain: [] }, { type: "handoff", to: "local:ollama:llama", label: "llama on your device", reason: "Runs on your device" }]);
      expect(url).toBe("http://localhost:11434/api/chat");
      return new Response('{"message":{"content":"local answer"}}\n{"done":true,"prompt_eval_count":3,"eval_count":2}\n', { status: 200 });
    });
    const types: string[] = [];
    let text = "";
    for await (const ev of runAi(input, new AbortController().signal, { fetchImpl: fetchImpl as unknown as typeof fetch, keyring: [{ provider: "ollama", model: "llama" }] })) {
      types.push(ev.type);
      if (ev.type === "token") text += ev.text;
    }
    expect(types).toContain("handoff");
    expect(types.at(-1)).toBe("done");
    expect(text).toBe("local answer");
  });

  it("a refused request is an AiRunError with the server's plain message", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "No AI is connected.", code: "ai_provider_required" }), { status: 400 }));
    const err = await runAiText(input, new AbortController().signal, undefined, { fetchImpl: fetchImpl as unknown as typeof fetch, keyring: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(AiRunError);
    expect(err).toMatchObject({ status: 400, code: "ai_provider_required", message: "No AI is connected." });
  });

  it("a partial answer dropped by a fallback is not kept in the text", async () => {
    const evs: RouterEvent[] = [
      { type: "route_start", requestId: "r", chain: [] },
      { type: "token", text: "half" },
      { type: "fallback", from: "a", fromLabel: "A", to: "b", toLabel: "B", reason: "timeout_idle", message: "stalled", partialOutputDiscarded: true },
      { type: "token", text: "whole" },
      { type: "done", candidateId: "b", label: "B", lane: "byok", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, source: "provider" }, trace: [] },
    ];
    const text = await runAiText(input, new AbortController().signal, undefined, { fetchImpl: (async () => sse(evs)) as unknown as typeof fetch, keyring: [] });
    expect(text).toBe("whole");
  });
});
