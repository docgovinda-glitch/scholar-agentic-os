import { describe, it, expect } from "vitest";
import { route } from "../router";
import { CircuitBreaker, MemoryBreakerStore } from "../circuitBreaker";
import { classify, ProviderHttpError } from "../errors";
import type { AdapterChunk, Candidate, ProviderAdapter, RouteRequest, RouterEvent } from "../types";

const cand = (id: string, provider: Candidate["provider"] = "openai"): Candidate => ({
  id, lane: "byok", provider, model: id, label: id, contextWindow: 128_000, maxOutputTokens: 8_000,
  runsIn: "server", credential: { apiKey: "k" },
});
const req: RouteRequest = { requestId: "r1", task: "drafting", messages: [{ role: "user", content: "hello" }], desiredOutputTokens: 2000, minOutputTokens: 200 };
const live = new AbortController().signal;
async function collect(gen: AsyncGenerator<RouterEvent>) { const out: RouterEvent[] = []; for await (const e of gen) out.push(e); return out; }

describe("credit exhaustion is classified as fallback-worthy", () => {
  const cases: Array<[string, number, string, string | undefined]> = [
    ["OpenRouter / DeepSeek 402", 402, "Insufficient Balance", undefined],
    ["Anthropic 400 credit balance", 400, "Your credit balance is too low to access the Anthropic API.", "invalid_request_error"],
    ["OpenAI 429 insufficient_quota", 429, "You exceeded your current quota", "insufficient_quota"],
    ["Google 429 RESOURCE_EXHAUSTED", 429, "Quota exceeded for metric", "RESOURCE_EXHAUSTED"],
    ["Google 403 billing", 403, "Billing account disabled", undefined],
  ];
  for (const [name, status, msg, code] of cases) {
    it(name, () => {
      const f = classify(new ProviderHttpError(status, msg, {}, code), live);
      expect(f.kind).toBe("quota");
      expect(f.fallbackWorthy).toBe(true);
      expect(f.retryable).toBe(false);
    });
  }

  it("a plain 401 stays an auth failure and a bad request still stops the chain", () => {
    expect(classify(new ProviderHttpError(401, "Invalid API key"), live)).toMatchObject({ kind: "auth", fallbackWorthy: true });
    expect(classify(new ProviderHttpError(400, "messages: field required"), live).fallbackWorthy).toBe(false);
  });

  it("a retired model moves on to the next AI", () => {
    expect(classify(new ProviderHttpError(404, "model gpt-x not found"), live).fallbackWorthy).toBe(true);
    expect(classify(new ProviderHttpError(400, "The model `x` does not exist"), live).fallbackWorthy).toBe(true);
  });
});

describe("router switches AI when credit runs out", () => {
  const adapter = (spent: Set<string>, status: number, msg: string): ProviderAdapter => ({
    async *stream(c): AsyncIterable<AdapterChunk> {
      if (spent.has(c.id)) throw new ProviderHttpError(status, msg);
      yield { type: "text", text: `from ${c.id}` };
      yield { type: "finish", reason: "stop" };
    },
  });

  it("falls back on a 402 without retrying the empty account", async () => {
    const ev = await collect(route(req, [cand("a"), cand("b")], live, {
      site: "server", adapters: { openai: adapter(new Set(["a"]), 402, "Insufficient credits") },
      breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: async () => {},
    }));
    expect(ev.filter((e) => e.type === "attempt_start")).toHaveLength(2); // one try on a, one on b
    expect(ev.find((e) => e.type === "fallback")).toMatchObject({ from: "a", to: "b", reason: "quota", httpStatus: 402 });
    expect(ev.at(-1)).toMatchObject({ type: "done", candidateId: "b" });
  });

  it("falls through a whole chain of spent accounts to the one with credit", async () => {
    const ev = await collect(route(req, [cand("a"), cand("b"), cand("c")], live, {
      site: "server", adapters: { openai: adapter(new Set(["a", "b"]), 400, "Your credit balance is too low") },
      breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: async () => {},
    }));
    expect(ev.filter((e) => e.type === "fallback")).toHaveLength(2);
    expect(ev.at(-1)).toMatchObject({ type: "done", candidateId: "c" });
  });

  it("pauses an exhausted account after repeated hits so later requests skip it", async () => {
    const breaker = new CircuitBreaker(new MemoryBreakerStore());
    const opts = { site: "server" as const, adapters: { openai: adapter(new Set(["a"]), 402, "Payment required") }, breaker, sleep: async () => {} };
    for (let i = 0; i < 3; i++) await collect(route(req, [cand("a"), cand("b")], live, opts));
    const ev = await collect(route(req, [cand("a"), cand("b")], live, opts));
    expect(ev.find((e) => e.type === "candidate_skipped")).toMatchObject({ candidateId: "a", reason: "circuit_open" });
    expect(ev.at(-1)).toMatchObject({ type: "done", candidateId: "b" });
  });
});
