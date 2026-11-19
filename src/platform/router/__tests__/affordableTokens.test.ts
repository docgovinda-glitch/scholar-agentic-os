/** OpenRouter's "requires more credits, or fewer max_tokens ... can only afford N": ask for less, do not blame the key. */
import { describe, expect, it } from "vitest";
import { classify, ProviderHttpError } from "../errors";
import { route } from "../router";
import { CircuitBreaker, MemoryBreakerStore } from "../circuitBreaker";
import type { AdapterChunk, Candidate, ProviderAdapter, RouteRequest, RouterEvent } from "../types";

const MSG = "This request requires more credits, or fewer max_tokens. You requested up to 32768 tokens, but can only afford 3262. To increase, visit https://openrouter.ai/settings/credits and upgrade to a paid account";
const req: RouteRequest = { requestId: "r", task: "drafting", messages: [{ role: "user", content: "hi" }], desiredOutputTokens: 32_768, minOutputTokens: 512 };
const cand = (id: string, group = "openrouter"): Candidate => ({ id, group, lane: "byok", provider: "custom", model: id, label: id, contextWindow: 200_000, maxOutputTokens: 32_768, runsIn: "server", credential: { apiKey: "k" } });
const run = async (chain: Candidate[], adapter: ProviderAdapter, breaker = new CircuitBreaker(new MemoryBreakerStore()), r = req) => {
  const out: RouterEvent[] = [];
  for await (const e of route(r, chain, new AbortController().signal, { site: "server", adapters: { custom: adapter }, breaker, sleep: async () => {} })) out.push(e);
  return { out, breaker };
};
/** Answers only when asked for at most `limit` tokens, like a balance-limited provider. */
const limited = (limit: number, asked: number[]): ProviderAdapter => ({
  async *stream(_c, _r, max): AsyncIterable<AdapterChunk> {
    asked.push(max);
    if (max > limit) throw new ProviderHttpError(402, MSG.replace("3262", String(limit)));
    yield { type: "text", text: "ok" };
    yield { type: "finish", reason: "stop" };
  },
});

describe("affordable output ceiling", () => {
  it("is read from the 402 and still classed as quota", () => {
    const f = classify(new ProviderHttpError(402, MSG), new AbortController().signal);
    expect(f).toMatchObject({ kind: "quota", affordableTokens: 3262 });
    expect(classify(new ProviderHttpError(402, "Insufficient credits"), new AbortController().signal).affordableTokens).toBeUndefined();
  });

  it("retries the same model with what the balance covers and answers", async () => {
    const asked: number[] = [];
    const { out } = await run([cand("m1")], limited(3262, asked));
    expect(asked).toEqual([32_768, Math.floor(3262 * 0.9)]);
    expect(out.at(-1)).toMatchObject({ type: "done", candidateId: "m1" });
    expect(out.some((e) => e.type === "fallback")).toBe(false);
    expect(out.find((e) => e.type === "retry")).toMatchObject({ waitMs: 0 });
  });

  it("opens no circuit, so the next request is not skipped", async () => {
    const breaker = new CircuitBreaker(new MemoryBreakerStore());
    await run([cand("m1")], limited(3262, []), breaker);
    expect((await breaker.acquire("conn:openrouter")).allowed).toBe(true);
    expect((await breaker.acquire("m1")).allowed).toBe(true);
  });

  it("the connection's other models start at the affordable limit instead of failing first", async () => {
    const asked: number[] = [];
    const failFirst: ProviderAdapter = { async *stream(c, r, max): AsyncIterable<AdapterChunk> {
      asked.push(max);
      if (c.id === "m1") throw new ProviderHttpError(500, "boom"); // m1 fails for another reason after learning the limit
      if (max > 3262) throw new ProviderHttpError(402, MSG);
      yield { type: "text", text: "ok" }; yield { type: "finish", reason: "stop" };
    } };
    const lim = limited(3262, asked);
    const mixed: ProviderAdapter = { stream: (c, r, max, sig) => (c.id === "m1" && asked.length > 0 ? failFirst.stream(c, r, max, sig) : lim.stream(c, r, max, sig)) };
    const { out } = await run([cand("m1"), cand("m2")], mixed, undefined, req);
    expect(out.at(-1)).toMatchObject({ type: "done" });
    expect(asked.at(-1)).toBeLessThanOrEqual(3262);
  });

  it("when the balance is below the smallest useful answer it fails as out of credit, with the number in plain words", async () => {
    const { out, breaker } = await run([cand("m1")], limited(300, []));
    expect(out.at(-1)).toMatchObject({ type: "error", code: "exhausted" });
    expect((out.at(-1) as { message: string }).message).toMatch(/only covers about 300 output tokens/);
    expect((await breaker.acquire("conn:openrouter")).allowed).toBe(false); // genuinely unusable: circuit opens
  });
});

describe("the learned ceiling is remembered between requests", () => {
  it("the next request starts at it: no refused request first", async () => {
    const { TtlOutputCaps } = await import("../outputCaps");
    const caps = new TtlOutputCaps();
    const asked: number[] = [];
    const a = limited(3262, asked);
    const go = async () => { for await (const _ of route(req, [cand("m1")], new AbortController().signal, { site: "server", adapters: { custom: a }, breaker: new CircuitBreaker(new MemoryBreakerStore()), outputCaps: caps, sleep: async () => {} })) { /* drain */ } };
    await go();
    expect(asked).toEqual([32_768, 2935]);
    asked.length = 0;
    await go(); // e.g. the continuation of a long answer, or the next request
    expect(asked).toEqual([2935]);
  });

  it("forgets it after the time to live, so added credit is used", async () => {
    const { TtlOutputCaps } = await import("../outputCaps");
    let t = 0;
    const caps = new TtlOutputCaps(1000, 10, () => t);
    caps.set("k", 500);
    expect(caps.get("k")).toBe(500);
    t = 1001;
    expect(caps.get("k")).toBeUndefined();
  });

  it("is bounded", async () => {
    const { TtlOutputCaps } = await import("../outputCaps");
    const caps = new TtlOutputCaps(1000, 3);
    for (let i = 0; i < 10; i++) caps.set(`k${i}`, 1);
    expect(caps.size).toBe(3);
  });
});
