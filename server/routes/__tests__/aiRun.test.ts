import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { id: "user-1" }; next(); },
}));

import express from "express";
import request from "supertest";
import { registerAiRunRoutes, type PremiumPort } from "../aiRun";
import { CircuitBreaker, MemoryBreakerStore } from "../../../src/platform/router/circuitBreaker";
import { ProviderHttpError } from "../../../src/platform/router/errors";
import type { AdapterChunk, Candidate, ProviderAdapter } from "../../../src/platform/router/types";
import { clearLiveModelState, setLiveModelsFetch } from "../../src/ai/liveModels";

// No test may reach a real provider: by default every model list fails, so named models are trusted as given.
beforeEach(() => { clearLiveModelState(); setLiveModelsFetch((async () => { throw new Error("offline"); }) as unknown as typeof fetch); });

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

  it("a custom endpoint on a private address is refused with the reason, and the key is not echoed", async () => {
    const res = await request(app()).post("/api/ai/run")
      .set("x-ai-keyring", keyring([{ provider: "custom", model: "m", apiKey: SECRET, baseUrl: "https://169.254.169.254/v1" }]))
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ai_endpoint_blocked");
    expect(res.body.error).toContain("private");
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
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


  it("on a deployed server, local models are handed to the browser instead of being dropped", async () => {
    const saved = process.env.ALLOW_SERVER_LOCAL_AI;
    process.env.ALLOW_SERVER_LOCAL_AI = "false"; // as in production
    try {
      const res = await request(app()).post("/api/ai/run")
        .set("x-ai-keyring", keyring([{ provider: "ollama", model: "llama-local" }]))
        .send(body).buffer(true).parse((r, cb) => { let d = ""; r.on("data", (c: Buffer) => (d += c)); r.on("end", () => cb(null, d)); });
      expect(events(res.body as string)).toEqual(["route_start", "handoff"]);
    } finally {
      if (saved === undefined) delete process.env.ALLOW_SERVER_LOCAL_AI; else process.env.ALLOW_SERVER_LOCAL_AI = saved;
    }
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


const sse = (r: any, cb: any) => { let d = ""; r.on("data", (c: Buffer) => (d += c)); r.on("end", () => cb(null, d)); };
const liveList = (ids: string[]) => (async () => new Response(JSON.stringify({ data: ids.map((id) => ({ id, created: 1_790_000_000 })) }), { status: 200 })) as unknown as typeof fetch;
function appWith(adapter: ProviderAdapter) {
  const a = express();
  a.use(express.json());
  registerAiRunRoutes(a, { adapters: { custom: adapter, groq: adapter, openai: adapter }, breaker: new CircuitBreaker(new MemoryBreakerStore()), routerOptions: { sleep: async () => {} } });
  return a;
}
/** Answers with its model id, except models listed as empty (no text) or gone (404). */
const picky = (empty: string[] = [], gone: string[] = []): ProviderAdapter => ({
  async *stream(c: Candidate): AsyncIterable<AdapterChunk> {
    if (gone.includes(c.model)) throw new ProviderHttpError(404, `The model \`${c.model}\` does not exist`);
    if (empty.includes(c.model)) { yield { type: "finish", reason: "length" }; return; }
    yield { type: "text", text: `answer from ${c.model}` };
    yield { type: "finish", reason: "stop" };
  },
});

describe("POST /api/ai/run with live models", () => {
  it("a connection with no saved model uses the best model the provider lists now", async () => {
    setLiveModelsFetch(liveList(["acme-pro-5", "acme-chat-5", "acme-flash-5"]));
    const res = await request(appWith(picky())).post("/api/ai/run")
      .set("x-ai-keyring", keyring([{ provider: "custom", via: "openrouter", model: "auto", apiKey: SECRET, baseUrl: "https://openrouter.ai/api/v1" }]))
      .send(body).buffer(true).parse(sse);
    expect(res.body).toContain("answer from acme-chat-5");
  });

  it("a model that answers nothing falls back to the next live model of the same connection, without a failure", async () => {
    setLiveModelsFetch(liveList(["acme-chat-5", "acme-flash-5"]));
    const res = await request(appWith(picky(["acme-chat-5"]))).post("/api/ai/run")
      .set("x-ai-keyring", keyring([{ provider: "groq", model: "auto", apiKey: SECRET }]))
      .send(body).buffer(true).parse(sse);
    const text = res.body as string;
    expect(events(text)).toContain("fallback");
    expect(text).toMatch(/"reason":"empty_output"/);
    expect(text).toContain("answer from acme-flash-5");
    expect(events(text).at(-1)).toBe("done");
  });

  it("a model the provider retired is replaced, and remembered so the next request skips it", async () => {
    setLiveModelsFetch(liveList(["acme-chat-5", "acme-flash-5"]));
    const a = appWith(picky([], ["acme-chat-5"]));
    const ring = keyring([{ provider: "groq", model: "auto", apiKey: SECRET }]);
    const first = await request(a).post("/api/ai/run").set("x-ai-keyring", ring).send(body).buffer(true).parse(sse);
    expect(first.body).toContain("answer from acme-flash-5");
    const second = await request(a).post("/api/ai/run").set("x-ai-keyring", ring).send(body).buffer(true).parse(sse);
    expect(events(second.body as string)).not.toContain("fallback");
    expect(second.body).toContain("answer from acme-flash-5");
  });

  it("a credit-exhausted connection moves to the next provider without trying its other models", async () => {
    setLiveModelsFetch(liveList(["acme-chat-5", "acme-flash-5"]));
    const seen: string[] = [];
    const adapter: ProviderAdapter = { async *stream(c) { seen.push(`${c.group}:${c.model}`); if (c.group === "openrouter") throw new ProviderHttpError(402, "Insufficient credits"); yield { type: "text", text: `answer from ${c.group}` }; } };
    const res = await request(appWith(adapter)).post("/api/ai/run")
      .set("x-ai-keyring", keyring([
        { provider: "custom", via: "openrouter", model: "auto", apiKey: SECRET, baseUrl: "https://openrouter.ai/api/v1" },
        { provider: "groq", model: "auto", apiKey: SECRET },
      ])).send(body).buffer(true).parse(sse);
    expect(res.body).toContain("answer from groq");
    expect(seen.filter((s) => s.startsWith("openrouter")).length).toBe(1);
  });
});

describe("POST /api/ai/verify", () => {
  const verify = (a: express.Express, b: unknown, key: string | undefined = SECRET) => {
    const r = request(a).post("/api/ai/verify");
    return (key ? r.set("x-ai-api-key", key) : r).send(b as object);
  };

  it("lists the live models, tests one with a real request and recommends the one that answered", async () => {
    setLiveModelsFetch(liveList(["acme-pro-5", "acme-chat-5", "acme-flash-5"]));
    const res = await verify(appWith(picky(["acme-chat-5"])), { providerId: "openrouter" });
    expect(res.body.ok).toBe(true);
    expect(res.body.tested.model).toBe("acme-pro-5");
    expect(res.body.options.map((o: { id: string }) => o.id)).toEqual(expect.arrayContaining(["acme-chat-5", "acme-pro-5", "acme-flash-5"]));
    expect(res.body.options[0].why).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it("works for providers outside the six native ones (all catalog providers)", async () => {
    setLiveModelsFetch(liveList(["x-chat-1"]));
    for (const providerId of ["cerebras", "xai", "together", "cohere", "huggingface", "nvidia"]) {
      const res = await verify(appWith(picky()), { providerId });
      expect(res.body, providerId).toMatchObject({ ok: true, tested: { model: "x-chat-1" } });
    }
  });

  it("a rejected key is reported as such, not as 'no models'", async () => {
    setLiveModelsFetch((async () => new Response("no", { status: 401 })) as unknown as typeof fetch);
    const res = await verify(appWith(picky()), { providerId: "groq" });
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/rejected/i);
    expect(res.body.needsModel).toBeFalsy();
  });

  it("a key with no credit is reported as valid-but-out-of-credit", async () => {
    setLiveModelsFetch(liveList(["acme-chat-5"]));
    const broke: ProviderAdapter = { async *stream() { throw new ProviderHttpError(402, "Insufficient credits"); } };
    const res = await verify(appWith(broke), { providerId: "groq" });
    expect(res.body).toMatchObject({ ok: false });
    expect(res.body.error).toMatch(/no credit or quota/i);
  });

  it("a provider that publishes no model list asks for a model, and tests the one given", async () => {
    setLiveModelsFetch(liveList([]));
    const none = await verify(appWith(picky()), { providerId: "qwen" });
    expect(none.body).toMatchObject({ ok: false, needsModel: true, unsupported: true });
    const given = await verify(appWith(picky()), { providerId: "qwen", model: "my-model" });
    expect(given.body).toMatchObject({ ok: true, tested: { model: "my-model" } });
  });

  it("rejects a missing key, an unknown provider and a private endpoint", async () => {
    expect((await verify(appWith(picky()), { providerId: "groq" }, "")).status).toBe(400);
    expect((await verify(appWith(picky()), { providerId: "no-such" })).status).toBe(400);
    const blocked = await verify(appWith(picky()), { providerId: "cloudflare", baseUrl: "https://169.254.169.254/v1" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/private|internal/i);
  });
});
