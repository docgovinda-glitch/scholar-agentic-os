import { describe, it, expect } from "vitest";
import { route } from "../router";
import { CircuitBreaker, MemoryBreakerStore } from "../circuitBreaker";
import { ProviderHttpError } from "../errors";
import type { AdapterChunk, Candidate, ProviderAdapter, RouteRequest, RouterEvent } from "../types";

const cand = (id: string, extra: Partial<Candidate> = {}): Candidate => ({
  id, lane: "byok", provider: "openai", model: id, label: id, contextWindow: 128_000, maxOutputTokens: 8_000,
  runsIn: "server", credential: { apiKey: "k" }, ...extra,
});
const req = (text = "hello"): RouteRequest => ({ requestId: "r1", task: "drafting", messages: [{ role: "user", content: text }], desiredOutputTokens: 2000, minOutputTokens: 200 });
const noSleep = async () => {};
async function collect(gen: AsyncGenerator<RouterEvent>) { const out: RouterEvent[] = []; for await (const e of gen) out.push(e); return out; }
function scripted(plan: Record<string, Array<"ok" | "429" | "500" | "hang">>): ProviderAdapter {
  const calls: Record<string, number> = {};
  return {
    async *stream(c, _r, _max, signal): AsyncIterable<AdapterChunk> {
      const n = (calls[c.id] = (calls[c.id] ?? 0) + 1);
      const step = plan[c.id]?.[n - 1] ?? "ok";
      if (step === "429") throw new ProviderHttpError(429, "Rate limited", { "retry-after": "1" });
      if (step === "500") throw new ProviderHttpError(500, "Upstream error");
      if (step === "hang") { await new Promise((_, rej) => signal.addEventListener("abort", () => rej(signal.reason))); }
      yield { type: "text", text: `from ${c.id}` };
      yield { type: "usage", inputTokens: 5, outputTokens: 3 };
      yield { type: "finish", reason: "stop" };
    },
  };
}
const types = (ev: RouterEvent[]) => ev.filter((e) => e.type !== "metrics").map((e) => e.type);

describe("router", () => {
  it("retries a 429 with a visible countdown, then succeeds", async () => {
    const ev = await collect(route(req(), [cand("a")], new AbortController().signal,
      { site: "server", adapters: { openai: scripted({ a: ["429", "ok"] }) }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: noSleep }));
    expect(types(ev)).toEqual(["route_start", "attempt_start", "retry", "attempt_start", "token", "done"]);
    expect(ev.find((e) => e.type === "retry")).toMatchObject({ waitMs: 1000, reason: "rate_limit" });
  });

  it("never switches models without a fallback event", async () => {
    const ev = await collect(route(req(), [cand("a"), cand("b")], new AbortController().signal,
      { site: "server", adapters: { openai: scripted({ a: ["500", "500"] }) }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: noSleep }));
    expect(types(ev)).toEqual(["route_start", "attempt_start", "retry", "attempt_start", "fallback", "attempt_start", "token", "done"]);
    expect(ev.find((e) => e.type === "fallback")).toMatchObject({ from: "a", to: "b", reason: "server", httpStatus: 500 });
  });

  it("times out a silent provider, aborts it and falls back", async () => {
    const ev = await collect(route(req(), [cand("a"), cand("b")], new AbortController().signal,
      { site: "server", adapters: { openai: scripted({ a: ["hang", "hang"] }) }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: noSleep, timeouts: { firstTokenMs: 30, idleMs: 30 } }));
    expect(ev.find((e) => e.type === "fallback")).toMatchObject({ reason: "timeout_first_token" });
    expect(ev.at(-1)).toMatchObject({ type: "done", candidateId: "b" });
  });

  it("skips a model whose context is too small before sending anything, and warns near the limit", async () => {
    const big = "x".repeat(12_000); // ≈4.1k tokens
    const ev = await collect(route(req(big), [cand("small", { contextWindow: 4_000 }), cand("big", { contextWindow: 6_000 })], new AbortController().signal,
      { site: "server", adapters: { openai: scripted({}) }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: noSleep }));
    expect(types(ev)).toEqual(["route_start", "candidate_skipped", "limit_warning", "attempt_start", "token", "done"]);
  });

  it("opens the circuit after repeated failures and shows the skip", async () => {
    const breaker = new CircuitBreaker(new MemoryBreakerStore(), { failureThreshold: 2, baseCooldownMs: 60_000, maxCooldownMs: 60_000 });
    const opts = { site: "server" as const, adapters: { openai: scripted({ a: ["500", "500", "500", "500"] }) }, breaker, sleep: noSleep };
    await collect(route(req(), [cand("a"), cand("b")], new AbortController().signal, opts));
    const ev = await collect(route(req(), [cand("a"), cand("b")], new AbortController().signal, opts));
    expect(ev[1]).toMatchObject({ type: "candidate_skipped", candidateId: "a", reason: "circuit_open" });
  });

  it("hands local models off to the browser instead of dropping them", async () => {
    const ev = await collect(route(req(), [cand("a"), cand("local", { lane: "local", provider: "ollama", runsIn: "browser", credential: undefined })], new AbortController().signal,
      { site: "server", adapters: { openai: scripted({ a: ["500", "500"] }) }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: noSleep }));
    expect(ev.at(-1)).toMatchObject({ type: "handoff", to: "local" });
  });

  it("reports time-to-first-token and tokens/second while streaming", async () => {
    const ev = await collect(route(req(), [cand("a")], new AbortController().signal,
      { site: "server", adapters: { openai: scripted({}) }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: noSleep }));
    expect(ev.find((e) => e.type === "metrics")).toMatchObject({ candidateId: "a" });
  });

  it("cancellation stops the stream and reports it", async () => {
    const ctl = new AbortController();
    const ev: RouterEvent[] = [];
    for await (const e of route(req(), [cand("a")], ctl.signal, { site: "server", adapters: { openai: scripted({ a: ["hang"] }) }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: noSleep, timeouts: { firstTokenMs: 5_000, idleMs: 5_000 } })) {
      ev.push(e);
      if (e.type === "attempt_start") setTimeout(() => ctl.abort(), 10);
    }
    expect(ev.at(-1)).toMatchObject({ type: "cancelled", candidateId: "a" });
  });
});
