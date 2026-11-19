/**
 * Server side of large keyrings, local runners, bounded chains and the browser hand-off for routedCompletion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { parseKeyring, keyringToCandidates, type KeyringEntry } from "../../../routes/aiRun";
import { MAX_KEYRING_ENTRIES } from "../../../../src/platform/router/keyringAssemble";
import { alternatesPerConnection, clearLiveModelState, expandKeyring, fitCandidateBudget, MAX_CHAIN_CANDIDATES, setLiveModelsFetch, type ExpandResult } from "../liveModels";
import { screenCandidates, serverAdapters } from "../aiEndpointGuard";
import { aiRouteDecorator, configureRouterBridge, chainFor, routedCompletion } from "../routerBridge";
import { browserHandOffSupport } from "../browserHandoff";
import { sendAiFailure, BrowserAiRequiredError, LocalModelUnreachableError } from "../aiRouteErrors";
import { serverBreakerKeys } from "../breaker";
import { CircuitBreaker, MemoryBreakerStore } from "../../../../src/platform/router/circuitBreaker";
import { computePromptHash, signLlmChallenge } from "../../../utils/llm";
import type { AdapterChunk, Candidate, ProviderAdapter } from "../../../../src/platform/router/types";

process.env.LLM_CHALLENGE_SECRET = "test-challenge-secret";
const ring = (e: unknown[]) => Buffer.from(JSON.stringify(e)).toString("base64url");
const entry = (i: number, extra: Partial<KeyringEntry> = {}): KeyringEntry => ({ provider: "custom", via: `prov${i}`, model: `m${i}`, apiKey: `k${i}`, baseUrl: `https://api.prov${i}.example/v1`, ...extra });

describe("keyring parsing beyond eight entries", () => {
  it("accepts up to the limit and refuses more", () => {
    const ok = Array.from({ length: MAX_KEYRING_ENTRIES }, (_, i) => entry(i));
    expect(parseKeyring(ring(ok))).toHaveLength(MAX_KEYRING_ENTRIES);
    expect(MAX_KEYRING_ENTRIES).toBeGreaterThan(8);
    expect(() => parseKeyring(ring([...ok, entry(99)]))).toThrow();
  });

  it("a full keyring of realistic entries fits the 32 KB header limit set in server.ts", () => {
    const full = Array.from({ length: MAX_KEYRING_ENTRIES }, (_, i) => entry(i, { apiKey: `sk-${"x".repeat(120)}`, label: `Provider ${i} · backup key 2`, contextWindow: 128_000, maxOutputTokens: 8_192 }));
    expect(ring(full).length).toBeLessThan(16 * 1024);
  });
});

describe("local runners become candidates", () => {
  const saved = process.env.ALLOW_SERVER_LOCAL_AI;
  afterEach(() => { if (saved === undefined) delete process.env.ALLOW_SERVER_LOCAL_AI; else process.env.ALLOW_SERVER_LOCAL_AI = saved; });

  it("Jan, llama.cpp and vLLM keep their own id and run in the browser on a deployed server", () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    const cands = keyringToCandidates([
      { provider: "lmstudio", via: "jan", model: "a", baseUrl: "http://localhost:1337/v1" },
      { provider: "lmstudio", via: "llamacpp", model: "b", baseUrl: "http://localhost:8080/v1" },
      { provider: "lmstudio", via: "vllm", model: "c", baseUrl: "http://localhost:8000/v1" },
    ]);
    expect(cands.map((c) => c.id)).toEqual(["local:jan:a", "local:llamacpp:b", "local:vllm:c"]);
    expect(cands.every((c) => c.lane === "local" && c.runsIn === "browser")).toBe(true);
    expect(cands.map((c) => c.group)).toEqual(["jan", "llamacpp", "vllm"]);
  });

  it("a runner behind a public https tunnel runs on the server, labelled as remote", () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    const [c] = keyringToCandidates([{ provider: "lmstudio", via: "vllm", model: "m", baseUrl: "https://gpu.trycloudflare.com/v1" }]);
    expect(c).toMatchObject({ lane: "local", runsIn: "server", credential: { baseUrl: "https://gpu.trycloudflare.com/v1" } });
    expect(c.label).toContain("vLLM");
    expect(c.label).toContain("remote");
  });

  it("a loopback runner is not screened, a tunnelled one is (private lookalikes are refused)", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "true";
    const loop = keyringToCandidates([{ provider: "lmstudio", via: "jan", model: "a", baseUrl: "http://localhost:1337/v1" }]);
    expect((await screenCandidates(loop)).kept).toHaveLength(1);
    const tunnel = keyringToCandidates([{ provider: "ollama", via: "ollama", model: "a", baseUrl: "https://gpu.trycloudflare.com" }]);
    const mapped = tunnel.map((c): Candidate => ({ ...c, credential: { baseUrl: "https://example.com" } }));
    // It reaches the real guard (https + public host check) instead of being waved through as "local".
    const screened = await screenCandidates(mapped);
    expect(screened.kept.length + screened.blocked.length).toBe(1);
  });

  it("the server adapter for a runner refuses a private https address and never calls it", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    const base = vi.fn(async () => new Response("{}"));
    const lm = serverAdapters(base as unknown as typeof fetch).lmstudio!;
    const c: Candidate = { id: "local:jan:a", lane: "local", provider: "lmstudio", model: "a", label: "a", contextWindow: 8000, maxOutputTokens: 1000, runsIn: "server", credential: { baseUrl: "http://localhost:1337/v1" } };
    await expect((async () => { for await (const _ of lm.stream(c, { requestId: "r", task: "fast", messages: [{ role: "user", content: "hi" }], desiredOutputTokens: 100, minOutputTokens: 10 }, 100, new AbortController().signal)) { /* drain */ } })()).rejects.toThrow(/can't reach a model on your computer/);
    expect(base).not.toHaveBeenCalled();
  });
});

describe("the chain stays bounded for a large keyring", () => {
  beforeEach(() => { clearLiveModelState(); });
  afterEach(() => setLiveModelsFetch(undefined));

  it("fewer alternates as connections grow, none for a very large keyring", () => {
    expect(alternatesPerConnection(3)).toBe(2);
    expect(alternatesPerConnection(10)).toBe(1);
    expect(alternatesPerConnection(24)).toBe(0);
  });

  it("fitCandidateBudget keeps every connection's first model and grants alternates in order", () => {
    const part = (n: number): ExpandResult => ({ entries: Array.from({ length: n }, (_, i) => entry(i, { model: `m${i}` })), notices: [] });
    const fitted = fitCandidateBudget([part(3), part(3), part(3), part(3)], 6);
    expect(fitted.map((p) => p.entries.length)).toEqual([3, 1, 1, 1]); // 4 primaries + 2 spare alternates, granted in order
    expect(fitCandidateBudget([part(3), part(1), part(3)], 100).map((p) => p.entries.length)).toEqual([3, 1, 3]);
    expect(fitCandidateBudget([part(3), part(0), part(2)], 3).map((p) => p.entries.length)).toEqual([2, 0, 1]);
  });

  it("expanding a large keyring stays within MAX_CHAIN_CANDIDATES with every connection represented, while a short one keeps its alternates", async () => {
    const models = ["acme-pro-5", "acme-chat-5", "acme-flash-5", "acme-chat-4"].map((id, i) => ({ id, created: 1_790_000_000 - i }));
    setLiveModelsFetch((async () => new Response(JSON.stringify({ data: models }), { status: 200 })) as unknown as typeof fetch);
    const entries = (n: number) => Array.from({ length: n }, (_, i) => ({ provider: "groq" as const, via: `prov${i}`, model: "auto", apiKey: `k${i}` }));
    const big = await expandKeyring(entries(24), "drafting");
    expect(big.entries.length).toBeLessThanOrEqual(MAX_CHAIN_CANDIDATES);
    expect(new Set(big.entries.map((e) => e.via)).size).toBe(24);
    expect((await expandKeyring(entries(12), "drafting")).entries.length).toBe(24); // one alternate each
    expect((await expandKeyring(entries(3), "drafting")).entries.length).toBe(9); // two alternates each
  });
});

describe("circuit names are per credential", () => {
  const c = (key: string, group = "openai"): Candidate => ({ id: "byok:openai:m", lane: "byok", provider: "openai", group, model: "m", label: "m", contextWindow: 1, maxOutputTokens: 1, runsIn: "server", credential: { apiKey: key } });
  it("two people on the same provider get different circuits, a backup key gets its own, and no key text appears", () => {
    const a = serverBreakerKeys(c("alice-secret-key"));
    const b = serverBreakerKeys(c("bob-secret-key"));
    expect(a.model).not.toBe(b.model);
    expect(a.connection).not.toBe(b.connection);
    expect(serverBreakerKeys(c("alice-secret-key", "openai#2")).connection).not.toBe(a.connection);
    expect(JSON.stringify([a, b])).not.toMatch(/secret/);
  });
});

describe("routedCompletion hands a local model's prompt to the browser", () => {
  const ok: ProviderAdapter = { async *stream(): AsyncIterable<AdapterChunk> { yield { type: "text", text: "cloud answer" }; yield { type: "finish", reason: "stop" }; } };
  const savedLocal = process.env.ALLOW_SERVER_LOCAL_AI;
  beforeEach(() => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    clearLiveModelState();
    setLiveModelsFetch((async () => { throw new Error("offline"); }) as unknown as typeof fetch);
    configureRouterBridge({ adapters: { openai: ok }, breaker: new CircuitBreaker(new MemoryBreakerStore()) });
  });
  afterEach(() => { if (savedLocal === undefined) delete process.env.ALLOW_SERVER_LOCAL_AI; else process.env.ALLOW_SERVER_LOCAL_AI = savedLocal; setLiveModelsFetch(undefined); });

  const localOnly = ring([{ provider: "lmstudio", via: "jan", model: "local-m", baseUrl: "http://localhost:1337/v1" }]);
  const app = (opts: { handOff?: boolean; support?: boolean } = {}) => {
    const a = express();
    a.use(express.json());
    a.use((req, _res, next) => { (req as unknown as { user: { id: string } }).user = { id: "u1" }; next(); });
    a.use(aiRouteDecorator);
    a.post("/step", async (req, res) => {
      try {
        const text = await routedCompletion(req, { task: "reasoning", systemPrompt: "sys", userPrompt: "the prompt", handOff: opts.handOff }, opts.support === false ? undefined : browserHandOffSupport);
        res.json({ text });
      } catch (e) { sendAiFailure(res, e, "Test step"); }
    });
    a.post("/sse", async (req, res) => {
      res.setHeader("Content-Type", "text/event-stream"); res.flushHeaders();
      try { await routedCompletion(req, { task: "reasoning", userPrompt: "p" }, browserHandOffSupport); res.end(); }
      catch (e) { res.write(`event: error\ndata: ${JSON.stringify({ kind: (e as Error).name })}\n\n`); res.end(); }
    });
    return a;
  };

  it("a JSON route answers 426 with the exact prompt, a signed challenge and an actionable message", async () => {
    const res = await request(app()).post("/step").set("x-ai-keyring", localOnly).send({});
    expect(res.status).toBe(426);
    expect(res.body).toMatchObject({ requireFrontendLLM: true, systemPrompt: "sys", userPrompt: "the prompt", taskType: "reasoning" });
    expect(typeof res.body.challengeToken).toBe("string");
    expect(res.body.error).toMatch(/model on your computer/i);
  });

  it("the replayed request with the browser's answer is used, via browserResults and via llmResult", async () => {
    const first = await request(app()).post("/step").set("x-ai-keyring", localOnly).send({});
    const token = first.body.challengeToken as string;
    const viaList = await request(app()).post("/step").set("x-ai-keyring", localOnly).send({ browserResults: [{ challengeToken: token, llmResult: "local answer" }] });
    expect(viaList.status).toBe(200);
    expect(viaList.body.text).toBe("local answer");
    const single = await request(app()).post("/step").set("x-ai-keyring", localOnly).send({ llmResult: "single answer", challengeToken: token });
    expect(single.body.text).toBe("single answer");
  });

  it("an answer signed for another prompt or another user is ignored: the route hands off again", async () => {
    const wrongPrompt = signLlmChallenge({ userId: "u1", routeId: "x", promptHash: computePromptHash("sys", "different"), expiresAt: Date.now() + 60_000 });
    const wrongUser = signLlmChallenge({ userId: "mallory", routeId: "x", promptHash: computePromptHash("sys", "the prompt"), expiresAt: Date.now() + 60_000 });
    for (const challengeToken of [wrongPrompt, wrongUser, "garbage"]) {
      const res = await request(app()).post("/step").set("x-ai-keyring", localOnly).send({ browserResults: [{ challengeToken, llmResult: "forged" }] });
      expect(res.status).toBe(426);
    }
  });

  it("falls back to a clear 400 when it cannot hand off: handOff false, no support passed, or a stream already open", async () => {
    for (const opts of [{ handOff: false }, { support: false }]) {
      const res = await request(app(opts)).post("/step").set("x-ai-keyring", localOnly).send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ai_local_model_unreachable");
    }
    const sse = await request(app()).post("/sse").set("x-ai-keyring", localOnly).send({}).buffer(true).parse((r, cb) => { let d = ""; r.on("data", (c: Buffer) => (d += c)); r.on("end", () => cb(null, d)); });
    expect(sse.body as string).toContain("LocalModelUnreachableError");
  });

  it("a background call with no response (no hand-off possible) gets the actionable error, not a crash", async () => {
    const req = { headers: { "x-ai-keyring": localOnly }, body: {} } as never;
    await expect(routedCompletion(req, { task: "reasoning", userPrompt: "p" }, browserHandOffSupport)).rejects.toBeInstanceOf(LocalModelUnreachableError);
  });

  it("cloud keys still answer directly, and the hand-off error class is the one sendAiFailure answers with 426", async () => {
    const res = await request(app()).post("/step").set("x-ai-keyring", ring([{ provider: "openai", model: "gpt-x", apiKey: "k" }])).send({});
    expect(res.body.text).toBe("cloud answer");
    expect(new BrowserAiRequiredError({ challengeToken: "t", systemPrompt: "", userPrompt: "", taskType: "x" }).name).toBe("BrowserAiRequiredError");
  });

  it("a remote https runner is on the chain ahead of browser-local ones, so it is called from the server first", async () => {
    const mixed = ring([
      { provider: "lmstudio", via: "jan", model: "j", baseUrl: "http://localhost:1337/v1" },
      { provider: "lmstudio", via: "vllm", model: "v", baseUrl: "https://api.openai.com/v1" }, // a public https host the guard accepts without a DNS lookup
    ]);
    const chain = await chainFor({ headers: { "x-ai-keyring": mixed } } as never, "reasoning");
    expect(chain.map((c) => `${c.group}:${c.runsIn}`)).toEqual(["vllm:server", "jan:browser"]);
  });
});
