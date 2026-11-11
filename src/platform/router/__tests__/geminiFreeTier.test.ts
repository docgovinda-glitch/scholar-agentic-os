/**
 * Gemini free tier: a per-minute limit is worded "You exceeded your current
 * quota" with a numeric error code. It must be a retryable, per-model rate
 * limit (try the next Gemini model), never "credit spent" for the whole key,
 * and a numeric code must never crash the classifier.
 */
import { describe, it, expect } from "vitest";
import { route } from "../router";
import { CircuitBreaker, MemoryBreakerStore } from "../circuitBreaker";
import { classify, ProviderHttpError } from "../errors";
import { geminiAdapter } from "../adapters";
import type { AdapterChunk, Candidate, ProviderAdapter, RouteRequest, RouterEvent } from "../types";

const live = new AbortController().signal;
const FREE_TIER_429 =
  "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10, model: gemini-2.5-flash\nPlease retry in 41.9s.";

describe("Gemini free-tier errors", () => {
  it("a numeric error code never throws inside the classifier", () => {
    const err = new ProviderHttpError(503, "The model is overloaded.", {}, 503 as unknown as string);
    expect(() => classify(err, live)).not.toThrow();
    expect(classify(err, live).fallbackWorthy).toBe(true);
  });

  it("a per-minute free-tier limit is a retryable rate limit with the provider's retry delay", () => {
    const f = classify(new ProviderHttpError(429, FREE_TIER_429, {}, "RESOURCE_EXHAUSTED"), live);
    expect(f.kind).toBe("rate_limit");
    expect(f.retryable).toBe(true);
    expect(f.retryAfterMs).toBe(41_900);
  });

  it("spent credit is still credit (OpenAI insufficient_quota)", () => {
    expect(classify(new ProviderHttpError(429, "You exceeded your current quota", {}, "insufficient_quota"), live).kind).toBe("quota");
  });

  it("the adapter keeps Google's string status instead of the numeric code", async () => {
    const body = JSON.stringify({ error: { code: 429, message: FREE_TIER_429, status: "RESOURCE_EXHAUSTED" } });
    const fetchImpl = (async () => new Response(body, { status: 429 })) as unknown as typeof fetch;
    const adapter = geminiAdapter(fetchImpl);
    const cand: Candidate = { id: "g", lane: "byok", provider: "google", model: "gemini-2.5-flash", label: "g", contextWindow: 1_000_000, maxOutputTokens: 8000, runsIn: "server", credential: { apiKey: "k" } };
    const req: RouteRequest = { requestId: "r", task: "drafting", messages: [{ role: "user", content: "hi" }], desiredOutputTokens: 100, minOutputTokens: 10 };
    let caught: unknown;
    try {
      for await (const _ of adapter.stream(cand, req, 100, live)) { /* drain */ }
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProviderHttpError);
    expect((caught as ProviderHttpError).code).toBe("RESOURCE_EXHAUSTED");
  });

  it("the router moves to the next Gemini model on the same key instead of giving up on Gemini", async () => {
    const adapter: ProviderAdapter = {
      async *stream(c): AsyncIterable<AdapterChunk> {
        if (c.model === "gemini-2.5-flash") throw new ProviderHttpError(429, FREE_TIER_429, {}, "RESOURCE_EXHAUSTED");
        yield { type: "text", text: `from ${c.model}` };
        yield { type: "finish", reason: "stop" };
      },
    };
    const mk = (model: string): Candidate => ({ id: model, group: "gemini-key", lane: "byok", provider: "google", model, label: model, contextWindow: 1_000_000, maxOutputTokens: 8000, runsIn: "server", credential: { apiKey: "k" } });
    const req: RouteRequest = { requestId: "r", task: "drafting", messages: [{ role: "user", content: "hi" }], desiredOutputTokens: 100, minOutputTokens: 10 };
    const ev: RouterEvent[] = [];
    for await (const e of route(req, [mk("gemini-2.5-flash"), mk("gemini-2.0-flash")], live, {
      site: "server", adapters: { google: adapter } as never, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: async () => {},
    })) ev.push(e);
    expect(ev.at(-1)).toMatchObject({ type: "done", candidateId: "gemini-2.0-flash" });
  });
});
