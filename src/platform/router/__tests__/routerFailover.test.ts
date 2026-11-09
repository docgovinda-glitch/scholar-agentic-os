import { describe, it, expect, vi } from "vitest";
import { route } from "../router";
import { CircuitBreaker, MemoryBreakerStore } from "../circuitBreaker";
import { classify, ProviderHttpError } from "../errors";
import type { AdapterChunk, Candidate, ProviderAdapter, RouteRequest, RouterEvent } from "../types";

const cand = (id: string, group: string, extra: Partial<Candidate> = {}): Candidate => ({
  id, group, lane: "byok", provider: "custom", model: id, label: id, contextWindow: 128_000, maxOutputTokens: 8_000, runsIn: "server", credential: { apiKey: "k" }, ...extra,
});
const req: RouteRequest = { requestId: "r", task: "drafting", messages: [{ role: "user", content: "hi" }], desiredOutputTokens: 2000, minOutputTokens: 200 };
const noSleep = async () => {};
async function collect(gen: AsyncGenerator<RouterEvent>) { const out: RouterEvent[] = []; for await (const e of gen) out.push(e); return out; }
const opts = (adapter: ProviderAdapter, extra = {}) => ({ site: "server" as const, adapters: { custom: adapter }, breaker: new CircuitBreaker(new MemoryBreakerStore()), sleep: noSleep, ...extra });

/** Each candidate id maps to what its stream does. */
type Step = "ok" | "empty-length" | "empty-stop" | "quota" | "auth" | "gone" | "429";
const scripted = (plan: Record<string, Step>, seen: string[] = []): ProviderAdapter => ({
  async *stream(c): AsyncIterable<AdapterChunk> {
    seen.push(c.id);
    const step = plan[c.id] ?? "ok";
    if (step === "quota") throw new ProviderHttpError(402, "Insufficient credits");
    if (step === "auth") throw new ProviderHttpError(401, "Invalid API key");
    if (step === "gone") throw new ProviderHttpError(404, "The model `x` does not exist");
    if (step === "429") throw new ProviderHttpError(429, "Rate limited", { "retry-after": "0" });
    if (step === "empty-length") { yield { type: "usage", inputTokens: 10, outputTokens: 4096 }; yield { type: "finish", reason: "length" }; return; }
    if (step === "empty-stop") { yield { type: "finish", reason: "stop" }; return; }
    yield { type: "text", text: `from ${c.id}` };
    yield { type: "finish", reason: "stop" };
  },
});

describe("router failover", () => {
  it("a stream that ends with no text is a failure: it falls back instead of returning an empty answer", async () => {
    const ev = await collect(route(req, [cand("a", "g1"), cand("b", "g2")], new AbortController().signal, opts(scripted({ a: "empty-length" }))));
    const fb = ev.find((e) => e.type === "fallback");
    expect(fb).toMatchObject({ from: "a", to: "b", reason: "empty_output" });
    expect((fb as { message: string }).message).toMatch(/output limit/i);
    expect(ev.at(-1)).toMatchObject({ type: "done", candidateId: "b" });
    expect(ev.filter((e) => e.type === "token").map((e) => (e as { text: string }).text).join("")).toBe("from b");
  });

  it("when every model answers nothing, the error says so and never reports success", async () => {
    const ev = await collect(route(req, [cand("a", "g1"), cand("b", "g2")], new AbortController().signal, opts(scripted({ a: "empty-stop", b: "empty-length" }))));
    expect(ev.some((e) => e.type === "done")).toBe(false);
    expect(ev.at(-1)).toMatchObject({ type: "error", code: "exhausted" });
  });

  it("an account-wide failure (credit, key) skips the rest of that connection and goes to the next provider", async () => {
    const seen: string[] = [];
    const chain = [cand("a1", "openrouter"), cand("a2", "openrouter"), cand("a3", "openrouter"), cand("b1", "groq")];
    const ev = await collect(route(req, chain, new AbortController().signal, opts(scripted({ a1: "quota" }, seen))));
    expect(seen).toEqual(["a1", "b1"]);
    expect(ev.find((e) => e.type === "fallback")).toMatchObject({ from: "a1", to: "b1", reason: "quota" });
    expect(ev.at(-1)).toMatchObject({ type: "done", candidateId: "b1" });
  });

  it("a per-model failure (retired model, rate limit) tries the same connection's next model first", async () => {
    const seen: string[] = [];
    const chain = [cand("a1", "groq"), cand("a2", "groq"), cand("b1", "openrouter")];
    const ev = await collect(route(req, chain, new AbortController().signal, opts(scripted({ a1: "gone" }, seen))));
    expect(seen).toEqual(["a1", "a2"]);
    expect(ev.at(-1)).toMatchObject({ type: "done", candidateId: "a2" });
  });

  it("reports each failed model so a retired one can be remembered", async () => {
    const onCandidateFailure = vi.fn();
    await collect(route(req, [cand("a", "g"), cand("b", "g")], new AbortController().signal, opts(scripted({ a: "gone" }), { onCandidateFailure })));
    expect(onCandidateFailure).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), expect.objectContaining({ kind: "model_unavailable" }));
  });

  it("stops starting new candidates once the total time budget is spent", async () => {
    let t = 0;
    const slowAdapter: ProviderAdapter = { async *stream(c) { t += 60_000; throw new ProviderHttpError(500, `boom ${c.id}`); } };
    const ev = await collect(route(req, [cand("a", "g1"), cand("b", "g2"), cand("c", "g3")], new AbortController().signal, opts(slowAdapter, { now: () => t, maxTotalMs: 90_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, maxWaitMs: 0 } })));
    expect(ev.at(-1)).toMatchObject({ type: "error", code: "exhausted" });
    expect((ev.at(-1) as { message: string }).message).toMatch(/within 90s/);
    expect(ev.filter((e) => e.type === "attempt_start").length).toBe(2);
  });
});

describe("classify", () => {
  const sig = new AbortController().signal;
  it("a retired model is model_unavailable and worth trying elsewhere; a bad request is not", () => {
    expect(classify(new ProviderHttpError(404, "model not found"), sig)).toMatchObject({ kind: "model_unavailable", fallbackWorthy: true });
    expect(classify(new ProviderHttpError(400, "The model `x` has been decommissioned"), sig)).toMatchObject({ kind: "model_unavailable", fallbackWorthy: true });
    expect(classify(new ProviderHttpError(400, "messages must not be empty"), sig)).toMatchObject({ kind: "invalid_request", fallbackWorthy: false });
  });
});
