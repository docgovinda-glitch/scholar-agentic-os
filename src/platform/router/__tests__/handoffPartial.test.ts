import { describe, expect, it } from "vitest";
import { route } from "../router";
import { CircuitBreaker, MemoryBreakerStore } from "../circuitBreaker";
import { ProviderHttpError } from "../errors";
import type { AdapterChunk, Candidate, ProviderAdapter, RouteRequest, RouterEvent } from "../types";

const req: RouteRequest = { requestId: "r", task: "drafting", messages: [{ role: "user", content: "hi" }], desiredOutputTokens: 2000, minOutputTokens: 200 };
const cloud: Candidate = { id: "byok:a:m", group: "a", lane: "byok", provider: "custom", model: "m", label: "cloud", contextWindow: 128_000, maxOutputTokens: 8_000, runsIn: "server", credential: { apiKey: "k" } };
const local: Candidate = { id: "local:ollama:l", group: "ollama", lane: "local", provider: "ollama", model: "l", label: "local", contextWindow: 8_000, maxOutputTokens: 2_000, runsIn: "browser" };

describe("a hand-off after a model failed mid-answer", () => {
  it("tells the consumer to drop what already streamed", async () => {
    const dies: ProviderAdapter = { async *stream(): AsyncIterable<AdapterChunk> { yield { type: "text", text: "partial " }; throw new ProviderHttpError(500, "boom"); } };
    const events: RouterEvent[] = [];
    for await (const e of route(req, [cloud, local], new AbortController().signal, { site: "server", adapters: { custom: dies }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: async () => {}, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, maxWaitMs: 0 } })) events.push(e);
    expect(events.at(-1)).toMatchObject({ type: "handoff", to: "local:ollama:l", partialOutputDiscarded: true });
  });

  it("a clean hand-off (nothing streamed) carries no discard flag", async () => {
    const fails: ProviderAdapter = { async *stream(): AsyncIterable<AdapterChunk> { throw new ProviderHttpError(402, "Insufficient credits"); } };
    const events: RouterEvent[] = [];
    for await (const e of route(req, [cloud, local], new AbortController().signal, { site: "server", adapters: { custom: fails }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: async () => {} })) events.push(e);
    const h = events.at(-1) as Extract<RouterEvent, { type: "handoff" }>;
    expect(h.type).toBe("handoff");
    expect(h.partialOutputDiscarded).toBeUndefined();
  });
});
