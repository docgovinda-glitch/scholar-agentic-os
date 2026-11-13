/**
 * OT-01 drafting relies on the router moving to the next connected provider
 * (Gemini, Groq, OpenRouter, OpenAI, Anthropic...) whenever one fails with an
 * auth, credit, rate-limit, server, timeout or socket error.
 */
import { describe, it, expect } from "vitest";
import { route } from "../router";
import { CircuitBreaker, MemoryBreakerStore } from "../circuitBreaker";
import { classify, ProviderHttpError, TimeoutError } from "../errors";
import type { AdapterChunk, Candidate, ProviderAdapter, RouteRequest, RouterEvent } from "../types";

const live = new AbortController().signal;
const req: RouteRequest = { requestId: "r1", task: "drafting", messages: [{ role: "user", content: "hello" }], desiredOutputTokens: 2000, minOutputTokens: 200 };
const cand = (id: string, provider: Candidate["provider"]): Candidate => ({
  id, lane: "byok", provider, model: id, label: id, contextWindow: 128_000, maxOutputTokens: 8_000,
  runsIn: "server", credential: { apiKey: "k" },
});
async function collect(gen: AsyncGenerator<RouterEvent>) { const out: RouterEvent[] = []; for await (const e of gen) out.push(e); return out; }

describe("every transient provider failure is failover-worthy", () => {
  const failures: Array<[string, unknown]> = [
    ["401 bad key", new ProviderHttpError(401, "Invalid API key")],
    ["402 no credit", new ProviderHttpError(402, "Insufficient credits")],
    ["429 rate limit", new ProviderHttpError(429, "Too many requests")],
    ["500 server error", new ProviderHttpError(500, "Internal error")],
    ["502 bad gateway", new ProviderHttpError(502, "Bad gateway")],
    ["503 unavailable", new ProviderHttpError(503, "Service unavailable")],
    ["504 gateway timeout", new ProviderHttpError(504, "Gateway timeout")],
    ["first-token timeout", new TimeoutError("first_token", 30_000)],
    ["socket hang up", new Error("socket hang up")],
    ["ECONNRESET", new Error("read ECONNRESET")],
  ];
  for (const [name, err] of failures) {
    it(name, () => expect(classify(err, live).fallbackWorthy).toBe(true));
  }
});

describe("the router walks the whole chain of providers", () => {
  it("skips Gemini (503), Groq (429) and OpenRouter (402) and answers from OpenAI", async () => {
    const failing: Record<string, ProviderHttpError> = {
      gemini: new ProviderHttpError(503, "Service unavailable"),
      groq: new ProviderHttpError(429, "Too many requests"),
      openrouter: new ProviderHttpError(402, "Insufficient credits"),
    };
    const adapter: ProviderAdapter = {
      async *stream(c): AsyncIterable<AdapterChunk> {
        if (failing[c.id]) throw failing[c.id];
        yield { type: "text", text: `from ${c.id}` };
        yield { type: "finish", reason: "stop" };
      },
    };
    const chain = [cand("gemini", "google"), cand("groq", "groq"), cand("openrouter", "openrouter"), cand("openai", "openai"), cand("anthropic", "anthropic")];
    const adapters = Object.fromEntries(chain.map((c) => [c.provider, adapter])) as never;
    const ev = await collect(route(req, chain, live, {
      site: "server", adapters, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: async () => {},
    }));
    expect(ev.at(-1)).toMatchObject({ type: "done", candidateId: "openai" });
    expect(ev.filter((e) => e.type === "fallback").length).toBeGreaterThanOrEqual(3);
  });
});
