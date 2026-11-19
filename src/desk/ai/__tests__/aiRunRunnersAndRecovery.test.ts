import { describe, it, expect, vi } from "vitest";
vi.mock("../../api/authHeaders", () => ({ authHeaders: async () => ({ Authorization: "Bearer t" }) }));
import { localCandidates, runAi, runAiText } from "../aiRun";
import { reduceAiRun, initialAiRunState } from "../aiRunState";
import type { RouterEvent } from "../../../platform/router/types";
import type { KeyringEntry } from "../keyring";

const sse = (events: object[]) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); for (const ev of events) c.enqueue(e.encode(`event: x\ndata: ${JSON.stringify(ev)}\n\n`)); c.close(); } }), { status: 200 });
const input = { task: "drafting" as const, messages: [{ role: "user" as const, content: "hi" }] };

const ring: KeyringEntry[] = [
  { provider: "ollama", via: "ollama", model: "llama", baseUrl: "http://localhost:11434" },
  { provider: "lmstudio", via: "jan", model: "jan-m", baseUrl: "http://localhost:1337/v1" },
  { provider: "lmstudio", via: "vllm", model: "vllm-m", baseUrl: "http://localhost:8000/v1" },
  { provider: "lmstudio", via: "vllm", model: "tunnel-m", baseUrl: "https://gpu.trycloudflare.com/v1" },
];

describe("browser hand-off to every local runner", () => {
  it("builds candidates for Jan and vLLM with the ids the server uses, and leaves out a runner the server already tried over https", () => {
    const c = localCandidates(ring, "local:jan:jan-m");
    expect(c.map((x) => x.id)).toEqual(["local:jan:jan-m", "local:vllm:vllm-m"]); // continues from the hand-off point; the tunnel is not offered to the browser
    expect(c[0]).toMatchObject({ provider: "lmstudio", group: "jan", runsIn: "browser", credential: { baseUrl: "http://localhost:1337/v1" } });
    expect(localCandidates(ring, "unknown").length).toBe(3);
  });

  it("runs a Jan / vLLM runner through the OpenAI-compatible adapter at its own address", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "/api/ai/run") return sse([{ type: "route_start", requestId: "r", chain: [] }, { type: "handoff", to: "local:jan:jan-m", label: "jan-m on your device", reason: "Runs on your device" }]);
      urls.push(url);
      return new Response(`data: {"choices":[{"delta":{"content":"from jan"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`, { status: 200 });
    });
    const text = await runAiText(input, new AbortController().signal, undefined, { fetchImpl: fetchImpl as unknown as typeof fetch, keyring: ring });
    expect(text).toBe("from jan");
    expect(urls).toEqual(["http://localhost:1337/v1/chat/completions"]);
  });

  it("a runner that fails moves to the next local runner in the same stream", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "/api/ai/run") return sse([{ type: "handoff", to: "local:jan:jan-m", label: "jan", reason: "Runs on your device" }]);
      if (url.startsWith("http://localhost:1337")) return new Response("down", { status: 500 });
      return new Response(`data: {"choices":[{"delta":{"content":"from vllm"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`, { status: 200 });
    });
    const events: RouterEvent[] = [];
    for await (const ev of runAi(input, new AbortController().signal, { fetchImpl: fetchImpl as unknown as typeof fetch, keyring: ring })) events.push(ev);
    expect(events.some((e) => e.type === "fallback" && e.to === "local:vllm:vllm-m")).toBe(true);
    expect(events.filter((e) => e.type === "token").map((e) => (e as { text: string }).text).join("")).toBe("from vllm");
  });
});

describe("partial output is dropped cleanly when the chain changes site", () => {
  it("runAiText discards text streamed by a server model that failed before a hand-off", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "/api/ai/run") return sse([{ type: "token", text: "PARTIAL FROM CLOUD " }, { type: "handoff", to: "local:ollama:llama", label: "llama", reason: "x failed", partialOutputDiscarded: true }]);
      return new Response('{"message":{"content":"local answer"}}\n{"done":true}\n', { status: 200 });
    });
    const text = await runAiText(input, new AbortController().signal, undefined, { fetchImpl: fetchImpl as unknown as typeof fetch, keyring: ring });
    expect(text).toBe("local answer");
  });

  it("the live status state clears the partial answer on a hand-off and says so", () => {
    let s = reduceAiRun(initialAiRunState, { type: "token", text: "half an ans" }, 0);
    s = reduceAiRun(s, { type: "handoff", to: "local:ollama:llama", label: "llama", reason: "boom", partialOutputDiscarded: true }, 1);
    expect(s.text).toBe("");
    expect(s.phase).toBe("handoff");
    expect(s.notices.at(-1)?.text).toMatch(/partial answer was discarded/);
  });
});
