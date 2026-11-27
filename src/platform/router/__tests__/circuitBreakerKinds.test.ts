/**
 * The breaker treats failures by kind: spent credit and rejected keys open it at once for a long time, per-minute
 * rate limits recover quickly, and transient glitches never blacklist a healthy key.
 */
import { describe, expect, it } from "vitest";
import { CircuitBreaker, DEFAULT_BREAKER, MemoryBreakerStore, policyFor } from "../circuitBreaker";
import { classify, ProviderHttpError } from "../errors";
import { route } from "../router";
import type { AdapterChunk, Candidate, ProviderAdapter, RouteRequest, RouterEvent } from "../types";

const MIN = 60_000;
const make = () => {
  const clock = { t: 1_000_000 };
  const breaker = new CircuitBreaker(new MemoryBreakerStore(), DEFAULT_BREAKER, () => clock.t);
  return { clock, breaker };
};
const open = async (b: CircuitBreaker, key = "k") => !(await b.acquire(key)).allowed;

describe("CircuitBreaker by failure kind", () => {
  it("quota opens on the first failure for a long cooldown, then allows one probe", async () => {
    const { clock, breaker } = make();
    await breaker.failure("k", { kind: "quota" });
    expect(await open(breaker)).toBe(true);
    const gate = await breaker.acquire("k");
    expect(gate).toMatchObject({ allowed: false, reason: "quota" });
    expect((gate as { retryInMs: number }).retryInMs).toBeGreaterThan(20 * MIN);
    clock.t += DEFAULT_BREAKER.quotaCooldownMs + 1;
    expect((await breaker.acquire("k")).allowed).toBe(true); // the probe
    expect((await breaker.acquire("k")).allowed).toBe(false); // only one
  });

  it("auth opens on the first failure too", async () => {
    const { breaker } = make();
    await breaker.failure("k", { kind: "auth" });
    expect(await open(breaker)).toBe(true);
  });

  it("honours the provider's own retry hint for quota when it is longer than the default", async () => {
    const { clock, breaker } = make();
    await breaker.failure("k", { kind: "quota", retryAfterMs: 3 * 60 * MIN });
    clock.t += 2 * 60 * MIN;
    expect(await open(breaker)).toBe(true);
    clock.t += 61 * MIN;
    expect(await open(breaker)).toBe(false);
  });

  it("a per-minute rate limit with a hint opens for exactly that long, so it recovers quickly", async () => {
    const { clock, breaker } = make();
    await breaker.failure("k", { kind: "rate_limit", retryAfterMs: 41_000 });
    expect(await open(breaker)).toBe(true);
    clock.t += 41_001;
    expect((await breaker.acquire("k")).allowed).toBe(true);
  });

  it("never keeps a per-minute window open longer than the cap, even for a huge hint", () => {
    expect(policyFor(DEFAULT_BREAKER, { kind: "rate_limit", retryAfterMs: 20 * MIN }).cooldownMs).toBe(DEFAULT_BREAKER.maxRateLimitCooldownMs);
  });

  it("a rate limit without a hint counts like a transient failure but with a short cooldown", async () => {
    const { clock, breaker } = make();
    await breaker.failure("k", { kind: "rate_limit" });
    await breaker.failure("k", { kind: "rate_limit" });
    expect(await open(breaker)).toBe(false);
    await breaker.failure("k", { kind: "rate_limit" });
    expect(await open(breaker)).toBe(true);
    clock.t += DEFAULT_BREAKER.rateLimitCooldownMs + 1;
    expect((await breaker.acquire("k")).allowed).toBe(true);
    expect(DEFAULT_BREAKER.rateLimitCooldownMs).toBeLessThan(DEFAULT_BREAKER.baseCooldownMs);
  });

  it("a per-day rate limit opens at once for about an hour", async () => {
    const { clock, breaker } = make();
    await breaker.failure("k", { kind: "rate_limit", daily: true });
    clock.t += 30 * MIN;
    expect(await open(breaker)).toBe(true);
    clock.t += 31 * MIN;
    expect(await open(breaker)).toBe(false);
  });

  it("transient failures (5xx, overload, timeouts, network) need three in a row and a success resets the count", async () => {
    const { breaker } = make();
    for (const kind of ["server", "overloaded", "timeout_first_token", "network"] as const) {
      await breaker.failure("k", { kind });
      await breaker.failure("k", { kind });
      expect(await open(breaker), kind).toBe(false);
      await breaker.success("k");
    }
    await breaker.failure("k", { kind: "server" });
    await breaker.failure("k", { kind: "server" });
    await breaker.failure("k", { kind: "server" });
    expect(await open(breaker)).toBe(true);
  });

  it("a failed probe re-opens with a longer cooldown, up to the cap for its kind", async () => {
    const { clock, breaker } = make();
    await breaker.failure("k", { kind: "quota" });
    clock.t += DEFAULT_BREAKER.quotaCooldownMs + 1;
    await breaker.acquire("k");
    await breaker.failure("k", { kind: "quota" });
    const gate = (await breaker.acquire("k")) as { retryInMs: number };
    expect(gate.retryInMs).toBeGreaterThan(DEFAULT_BREAKER.quotaCooldownMs);
    expect(gate.retryInMs).toBeLessThanOrEqual(DEFAULT_BREAKER.maxHardCooldownMs);
  });

  it("a probe that never reports back does not pause the circuit forever", async () => {
    const { clock, breaker } = make();
    await breaker.failure("k", { kind: "quota" });
    clock.t += DEFAULT_BREAKER.quotaCooldownMs + 1;
    expect((await breaker.acquire("k")).allowed).toBe(true); // probe handed out, never reported
    expect((await breaker.acquire("k")).allowed).toBe(false);
    clock.t += DEFAULT_BREAKER.probeTimeoutMs + 1;
    expect((await breaker.acquire("k")).allowed).toBe(true);
  });

  it("release frees a probe that told us nothing", async () => {
    const { clock, breaker } = make();
    await breaker.failure("k", { kind: "auth" });
    clock.t += DEFAULT_BREAKER.authCooldownMs + 1;
    await breaker.acquire("k");
    await breaker.release("k");
    expect((await breaker.acquire("k")).allowed).toBe(true);
  });

  it("a concurrent failure never shortens an open circuit", async () => {
    const { breaker } = make();
    await breaker.failure("k", { kind: "quota" });
    await breaker.failure("k", { kind: "server" });
    expect(((await breaker.acquire("k")) as { retryInMs: number }).retryInMs).toBeGreaterThan(20 * MIN);
  });

  it("MemoryBreakerStore stays bounded", async () => {
    const store = new MemoryBreakerStore(10);
    const b = new CircuitBreaker(store);
    for (let i = 0; i < 50; i++) await b.failure(`k${i}`, { kind: "quota" });
    expect(store.size).toBe(10);
  });
});

describe("daily limits are told apart from per-minute ones", () => {
  const rl = (msg: string, headers: Record<string, string> = {}) => classify(new ProviderHttpError(429, msg, headers), new AbortController().signal);
  it("Gemini PerDay and Groq tokens-per-day are daily", () => {
    expect(rl("Quota exceeded for metric GenerateRequestsPerDayPerProjectPerModel-FreeTier").daily).toBe(true);
    expect(rl("Rate limit reached: tokens per day (TPD): Limit 100000").daily).toBe(true);
  });
  it("a per-minute limit is not", () => {
    expect(rl("Rate limit reached for requests per minute (RPM)", { "retry-after": "12" })).toMatchObject({ kind: "rate_limit", retryAfterMs: 12_000 });
    expect(rl("Rate limit reached for requests per minute (RPM)").daily).toBeUndefined();
  });
});

describe("the router uses the breaker by kind", () => {
  const req: RouteRequest = { requestId: "r", task: "drafting", messages: [{ role: "user", content: "hi" }], desiredOutputTokens: 2000, minOutputTokens: 200 };
  const cand = (id: string, group: string, key = "k"): Candidate => ({ id, group, lane: "byok", provider: "custom", model: id, label: id, contextWindow: 128_000, maxOutputTokens: 8_000, runsIn: "server", credential: { apiKey: key } });
  const collect = async (g: AsyncGenerator<RouterEvent>) => { const o: RouterEvent[] = []; for await (const e of g) o.push(e); return o; };
  const adapter = (plan: Record<string, "quota" | "auth" | "ok" | "500">, calls: string[]): ProviderAdapter => ({
    async *stream(c): AsyncIterable<AdapterChunk> {
      calls.push(c.id);
      const p = plan[c.id] ?? "ok";
      if (p === "quota") throw new ProviderHttpError(402, "Insufficient credits");
      if (p === "auth") throw new ProviderHttpError(401, "Invalid API key");
      if (p === "500") throw new ProviderHttpError(500, "boom");
      yield { type: "text", text: `from ${c.id}` };
      yield { type: "finish", reason: "stop" };
    },
  });
  const opts = (a: ProviderAdapter, breaker: CircuitBreaker) => ({ site: "server" as const, adapters: { custom: a }, breaker, sleep: async () => {}, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, maxWaitMs: 0 } });

  it("a spent key is skipped on the very next request, without another round trip, for all of its models", async () => {
    const { breaker } = make();
    const calls: string[] = [];
    const chain = [cand("a1", "openrouter"), cand("a2", "openrouter"), cand("b1", "groq")];
    const a = adapter({ a1: "quota" }, calls);
    const first = await collect(route(req, chain, new AbortController().signal, opts(a, breaker)));
    expect(first.at(-1)).toMatchObject({ type: "done", candidateId: "b1" });
    expect(calls).toEqual(["a1", "b1"]);
    calls.length = 0;
    const second = await collect(route(req, chain, new AbortController().signal, opts(a, breaker)));
    expect(calls).toEqual(["b1"]); // neither a1 nor a2 was called
    const skipped = second.filter((e) => e.type === "candidate_skipped");
    expect(skipped.length).toBeGreaterThan(0);
    expect((skipped[0] as { detail: string }).detail).toMatch(/Out of quota or credits; retrying in \d+ min/);
  });

  it("with separate keys for one provider, only the spent key's circuit opens", async () => {
    const { breaker } = make();
    const calls: string[] = [];
    const keys = (c: Candidate) => ({ model: `${c.id}|${c.credential?.apiKey}`, connection: `conn:${c.group}|${c.credential?.apiKey}` });
    const chain = [cand("m", "openai", "key-1"), cand("m#2", "openai#2", "key-2")];
    const a = adapter({ m: "quota" }, calls);
    await collect(route(req, chain, new AbortController().signal, { ...opts(a, breaker), breakerKeys: keys }));
    calls.length = 0;
    await collect(route(req, chain, new AbortController().signal, { ...opts(a, breaker), breakerKeys: keys }));
    expect(calls).toEqual(["m#2"]);
  });

  it("two people with the same provider never share a circuit", async () => {
    const { breaker } = make();
    const calls: string[] = [];
    const keys = (c: Candidate) => ({ model: `${c.id}|${c.credential?.apiKey}`, connection: `conn:${c.group}|${c.credential?.apiKey}` });
    const a = adapter({}, calls);
    const spent: ProviderAdapter = { async *stream() { throw new ProviderHttpError(402, "Insufficient credits"); } };
    await collect(route(req, [cand("m", "openai", "alice")], new AbortController().signal, { ...opts(spent, breaker), breakerKeys: keys }));
    const bob = await collect(route(req, [cand("m", "openai", "bob")], new AbortController().signal, { ...opts(a, breaker), breakerKeys: keys }));
    expect(bob.at(-1)).toMatchObject({ type: "done" });
  });

  it("a transient 5xx does not blacklist the key after one or two failures", async () => {
    const { breaker } = make();
    const calls: string[] = [];
    const chain = [cand("a", "g1")];
    const a = adapter({ a: "500" }, calls);
    await collect(route(req, chain, new AbortController().signal, opts(a, breaker)));
    await collect(route(req, chain, new AbortController().signal, opts(a, breaker)));
    expect(calls).toEqual(["a", "a"]); // still tried the second time
  });
});

describe("a request too big for the model's per-minute cap", () => {
  const groq413 =
    "Request too large for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Requested 11713, please reduce your message size and try again. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing";
  const signal = new AbortController().signal;

  it("is an over-long input for this model, not spent credit: the next model is tried and the connection stays usable", () => {
    for (const status of [413, 429]) {
      const f = classify(new ProviderHttpError(status, groq413), signal);
      expect(f.kind).toBe("context_overflow");
      expect(f.fallbackWorthy).toBe(true);
    }
  });

  it("leaves an ordinary per-minute rate limit as a rate limit", () => {
    const f = classify(new ProviderHttpError(429, "Rate limit reached for model `llama` on requests per minute (RPM): Limit 30, Used 30, Requested 1. Please try again in 2s."), signal);
    expect(f.kind).toBe("rate_limit");
  });
});

describe("a per-minute token cap that says when it frees up", () => {
  const signal = new AbortController().signal;
  it("reads Groq's 'try again in 1.695s' and '464.9ms' as the wait, so the same model is retried after it", () => {
    const tpm = (wait: string) =>
      classify(new ProviderHttpError(429, `Rate limit reached for model \`openai/gpt-oss-120b\` in organization \`org_x\` service tier \`on_demand\` on tokens per minute (TPM): Limit 8000, Used 3825, Requested 4401. Please try again in ${wait}. Need more tokens?`), signal);
    expect(tpm("1.695s")).toMatchObject({ kind: "rate_limit", retryable: true, retryAfterMs: 1695 });
    expect(tpm("464.999999ms")).toMatchObject({ kind: "rate_limit", retryAfterMs: 465 });
    expect(tpm("1m2.5s").retryAfterMs).toBe(62_500);
  });
});
