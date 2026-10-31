import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { id: "user-1" }; next(); },
}));

import express from "express";
import request from "supertest";
import { registerAiRunRoutes, type PremiumPort } from "../aiRun";
import { CircuitBreaker, MemoryBreakerStore } from "../../../src/platform/router/circuitBreaker";
import { ProviderHttpError } from "../../../src/platform/router/errors";
import type { AdapterChunk, Candidate, ProviderAdapter } from "../../../src/platform/router/types";

const SECRET = "sk-test-SECRET-never-echo-1234567890";
const keyring = (entries: unknown[]) => Buffer.from(JSON.stringify(entries)).toString("base64url");

/** Fails for candidates whose model starts with "bad", otherwise answers with its id. */
const fakeAdapter: ProviderAdapter = {
  async *stream(c: Candidate): AsyncIterable<AdapterChunk> {
    if (c.model.startsWith("bad")) throw new ProviderHttpError(500, "Upstream exploded");
    yield { type: "text", text: `answer from ${c.model}` };
    yield { type: "usage", inputTokens: 10, outputTokens: 4 };
    yield { type: "finish", reason: "stop" };
  },
};

function app(premium?: PremiumPort, listModels?: any) {
  const a = express();
  a.use(express.json());
  registerAiRunRoutes(a, {
    adapters: { openai: fakeAdapter, anthropic: fakeAdapter, google: fakeAdapter },
    breaker: new CircuitBreaker(new MemoryBreakerStore()),
    premium,
    routerOptions: { sleep: async () => {} },
    listModels,
  });
  return a;
}

const body = { task: "drafting", messages: [{ role: "user", content: "Write one sentence." }] };
const events = (text: string) => text.split("\n\n").filter((b) => b.includes("event:")).map((b) => b.match(/event: (\w+)/)![1]);

describe("POST /api/ai/run", () => {
  it("no AI connected is a clear 400, not a stream", async () => {
    const res = await request(app()).post("/api/ai/run").send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ai_provider_required");
  });

  it("an unreadable key header is a 400", async () => {
    const res = await request(app()).post("/api/ai/run").set("x-ai-keyring", "%%%").send(body);
    expect(res.status).toBe(400);
  });

  it("falls back to the user's second key with a visible event, and never echoes the key", async () => {
    const res = await request(app()).post("/api/ai/run")
      .set("x-ai-keyring", keyring([{ provider: "openai", model: "bad-model", apiKey: SECRET }, { provider: "anthropic", model: "good-model", apiKey: SECRET }]))
      .send(body).buffer(true).parse((r, cb) => { let d = ""; r.on("data", (c: Buffer) => (d += c)); r.on("end", () => cb(null, d)); });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const text = res.body as string;
    expect(events(text)).toContain("fallback");
    expect(events(text).at(-1)).toBe("done");
    expect(text).toContain("answer from good-model");
    expect(text).toMatch(/"from":"byok:openai:bad-model".*"to":"byok:anthropic:good-model"/s);
    expect(text).not.toContain(SECRET);
  });

  it("Premium runs first and is charged; preferLane=byok puts the user's key first", async () => {
    const charge = vi.fn(async () => true);
    const premium: PremiumPort = {
      async candidates() {
        return { candidates: [{ id: "premium:r1", lane: "premium", provider: "google", model: "pool-model", label: "Scholar Pro · Premium", contextWindow: 100_000, maxOutputTokens: 4096, runsIn: "server", credential: { apiKey: "vault-key" } }] };
      },
      charge,
    };
    const ring = keyring([{ provider: "openai", model: "own-model", apiKey: SECRET }]);
    const parse = (r: any, cb: any) => { let d = ""; r.on("data", (c: Buffer) => (d += c)); r.on("end", () => cb(null, d)); };

    const first = await request(app(premium)).post("/api/ai/run").set("x-ai-keyring", ring).send(body).buffer(true).parse(parse);
    expect(first.body).toContain("answer from pool-model");
    expect(charge).toHaveBeenCalledWith("user-1", expect.objectContaining({ id: "premium:r1" }), { inputTokens: 10, outputTokens: 4, source: "provider" }, expect.any(String));
    expect(first.body).not.toContain("vault-key");

    const own = await request(app(premium)).post("/api/ai/run").set("x-ai-keyring", ring).send({ ...body, preferLane: "byok" }).buffer(true).parse(parse);
    expect(own.body).toContain("answer from own-model");
  });

  it("local models are handed to the browser instead of being dropped", async () => {
    const res = await request(app()).post("/api/ai/run")
      .set("x-ai-keyring", keyring([{ provider: "ollama", model: "llama-local" }]))
      .send(body).buffer(true).parse((r, cb) => { let d = ""; r.on("data", (c: Buffer) => (d += c)); r.on("end", () => cb(null, d)); });
    expect(events(res.body as string)).toEqual(["route_start", "handoff"]);
  });
});

describe("cancellation", () => {
  it("a client that disconnects mid-stream aborts the provider call", async () => {
    let upstreamAborted = false;
    const hanging: ProviderAdapter = {
      async *stream(_c, _r, _m, signal): AsyncIterable<AdapterChunk> {
        yield { type: "text", text: "first words" };
        await new Promise((_, reject) => signal.addEventListener("abort", () => { upstreamAborted = true; reject(signal.reason); }));
      },
    };
    const a = express();
    a.use(express.json());
    registerAiRunRoutes(a, { adapters: { openai: hanging }, breaker: new CircuitBreaker(new MemoryBreakerStore()), routerOptions: { timeouts: { firstTokenMs: 10_000, idleMs: 10_000 } } });
    const server = a.listen(0);
    const port = (server.address() as { port: number }).port;
    const ctl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/ai/run`, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-ai-keyring": keyring([{ provider: "openai", model: "m", apiKey: SECRET }]) },
      body: JSON.stringify(body),
    });
    const reader = res.body!.getReader();
    let seen = "";
    while (!seen.includes("first words")) seen += new TextDecoder().decode((await reader.read()).value);
    ctl.abort();
    await new Promise((r) => setTimeout(r, 100));
    server.close();
    expect(upstreamAborted).toBe(true);
  });
});

describe("GET /api/ai/models", () => {
  it("returns curated models per provider, with a plain error for a failing one, and no keys", async () => {
    const listModels = vi.fn(async (provider: string) => {
      if (provider === "anthropic") throw new (await import("../../../src/platform/router/modelListers")).ModelListError("anthropic", 401, "The key was rejected");
      return [{ id: "acme-pro-6.1", contextWindow: 400_000 }, { id: "acme-pro-5" }, { id: "text-embedding-3" }];
    });
    const res = await request(app(undefined, listModels)).get("/api/ai/models")
      .set("x-ai-keyring", keyring([{ provider: "openai", model: "x", apiKey: SECRET }, { provider: "anthropic", model: "y", apiKey: SECRET }]));
    expect(res.status).toBe(200);
    const openai = res.body.providers.find((p: any) => p.provider === "openai");
    expect(openai.models.map((m: any) => m.id)).toEqual(["acme-pro-6.1"]);
    expect(res.body.providers.find((p: any) => p.provider === "anthropic").error).toBe("The key was rejected");
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });
});
