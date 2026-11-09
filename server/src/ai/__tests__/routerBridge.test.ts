import { describe, it, expect, beforeEach } from "vitest";
import { setLiveModelsFetch, clearLiveModelState } from "../liveModels";
import express from "express";
import request from "supertest";
import { aiRouteDecorator, configureRouterBridge, keyringFromRequest } from "../routerBridge";
import { callOpenRouterText, streamOpenRouterText } from "../../../utils/llm";
import { CircuitBreaker, MemoryBreakerStore } from "../../../../src/platform/router/circuitBreaker";
import { ProviderHttpError } from "../../../../src/platform/router/errors";
import type { AdapterChunk, Candidate, ProviderAdapter } from "../../../../src/platform/router/types";

process.env.LLM_CHALLENGE_SECRET = "test-challenge-secret";
// No test reaches a real provider: model lists fail, so named models are trusted as given.
beforeEach(() => { clearLiveModelState(); setLiveModelsFetch((async () => { throw new Error("offline"); }) as unknown as typeof fetch); });
const SECRET = "sk-test-SECRET-1234567890";
const calls: string[] = [];
const fake: ProviderAdapter = {
  async *stream(c: Candidate): AsyncIterable<AdapterChunk> {
    calls.push(`${c.provider}:${c.model}`);
    if (c.model.startsWith("bad")) throw new ProviderHttpError(503, "Overloaded right now");
    yield { type: "text", text: `ok from ${c.model}` };
    yield { type: "usage", inputTokens: 3, outputTokens: 2 };
  },
};
const ring = (e: unknown[]) => Buffer.from(JSON.stringify(e)).toString("base64url");

function app() {
  const a = express();
  a.use(express.json());
  a.use(aiRouteDecorator);
  a.post("/step", async (req, res) => {
    try {
      const text = await callOpenRouterText(req, res, "system", "user prompt", undefined, "drafting");
      res.json({ text });
    } catch (e) {
      if ((e as Error).message === "RequireFrontendLLMException") return;
      res.status(502).json({ error: (e as Error).message });
    }
  });
  a.post("/stream", async (req, res) => {
    const text = await streamOpenRouterText(req, res, "system", "user prompt", undefined, "drafting").catch((e) => { res.write(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`); return undefined; });
    if (text !== undefined) res.write(`event: done\ndata: ${JSON.stringify({ text })}\n\n`);
    res.end();
  });
  return a;
}

beforeEach(() => {
  calls.length = 0;
  configureRouterBridge({ adapters: { openai: fake, anthropic: fake, google: fake }, breaker: new CircuitBreaker(new MemoryBreakerStore()), premium: undefined });
});

describe("existing AI steps through the router", () => {
  it("fails over across the user's keys and reports it in aiRoute, without echoing keys", async () => {
    const res = await request(app()).post("/step").set("x-ai-keyring", ring([{ provider: "openai", model: "bad-1", apiKey: SECRET }, { provider: "anthropic", model: "good-1", apiKey: SECRET }])).send({});
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("ok from good-1");
    expect(res.body.aiRoute.answeredBy).toEqual({ label: "good-1 · your key", lane: "byok" });
    expect(res.body.aiRoute.notices.map((n: { kind: string }) => n.kind)).toContain("fallback");
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it("legacy single-provider headers still work (gemini → google)", async () => {
    const res = await request(app()).post("/step").set({ "x-ai-provider": "gemini", "x-ai-model": "flash-x", "x-ai-api-key": SECRET }).send({});
    expect(res.body.text).toBe("ok from flash-x");
    expect(calls).toEqual(["google:flash-x"]);
  });

  it("no AI connected keeps the browser hand-off (426 with a signed challenge)", async () => {
    const res = await request(app()).post("/step").send({});
    expect(res.status).toBe(426);
    expect(res.body).toMatchObject({ requireFrontendLLM: true, systemPrompt: "system", userPrompt: "user prompt" });
    expect(res.body.challengeToken).toBeTruthy();
  });

  it("a provider failure is never silently handed to the browser: all keys failing is an error", async () => {
    const res = await request(app()).post("/step").set("x-ai-keyring", ring([{ provider: "openai", model: "bad-only", apiKey: SECRET }])).send({});
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/All models failed.*Overloaded/);
  });

  it("on a deployed server, a local model next in line is handed to the browser", async () => {
    const saved = process.env.ALLOW_SERVER_LOCAL_AI;
    process.env.ALLOW_SERVER_LOCAL_AI = "false"; // as in production
    try {
      const res = await request(app()).post("/step").set("x-ai-keyring", ring([{ provider: "openai", model: "bad-1", apiKey: SECRET }, { provider: "ollama", model: "llama" }])).send({});
      expect(res.status).toBe(426);
    } finally {
      if (saved === undefined) delete process.env.ALLOW_SERVER_LOCAL_AI; else process.env.ALLOW_SERVER_LOCAL_AI = saved;
    }
  });

  it("where the server can reach local models (development, self-hosted), it calls them itself", async () => {
    const saved = process.env.ALLOW_SERVER_LOCAL_AI;
    process.env.ALLOW_SERVER_LOCAL_AI = "true";
    configureRouterBridge({ adapters: { openai: fake, lmstudio: fake } });
    try {
      const res = await request(app()).post("/step").set({ "x-ai-provider": "lmstudio", "x-ai-model": "stub" }).send({});
      expect(res.status).toBe(200);
      expect(res.body.text).toBe("ok from stub");
      expect(res.body.aiRoute.answeredBy.lane).toBe("local");
    } finally {
      if (saved === undefined) delete process.env.ALLOW_SERVER_LOCAL_AI; else process.env.ALLOW_SERVER_LOCAL_AI = saved;
    }
  });

  it("streaming steps forward the switch as log and route events", async () => {
    const res = await request(app()).post("/stream").set("x-ai-keyring", ring([{ provider: "openai", model: "bad-1", apiKey: SECRET }, { provider: "anthropic", model: "good-1", apiKey: SECRET }]))
      .send({}).buffer(true).parse((r, cb) => { let d = ""; r.on("data", (c: Buffer) => (d += c)); r.on("end", () => cb(null, d)); });
    const text = res.body as string;
    expect(text).toMatch(/event: log\ndata: .*Switched from bad-1 · your key to good-1 · your key/);
    expect(text).toContain('event: route');
    expect(text).toContain('"text":"ok from good-1"');
  });

  it("puts the legacy primary provider first unless the keyring already has it", () => {
    const ring = Buffer.from(JSON.stringify([{ provider: "anthropic", model: "a1", apiKey: "k1" }])).toString("base64url");
    const merged = keyringFromRequest({ headers: { "x-ai-keyring": ring, "x-ai-provider": "openrouter", "x-ai-model": "r1", "x-ai-api-key": "k2", "x-ai-base-url": "https://openrouter.example/api/v1" } });
    expect(merged.map((e) => `${e.provider}:${e.model}`)).toEqual(["custom:r1", "anthropic:a1"]);

    const same = keyringFromRequest({ headers: { "x-ai-keyring": ring, "x-ai-provider": "anthropic", "x-ai-model": "a1", "x-ai-api-key": "k1" } });
    expect(same).toHaveLength(1);
  });

  it("a custom local-runner address is used, not the default (P1-13)", async () => {
    const saved = process.env.ALLOW_SERVER_LOCAL_AI;
    process.env.ALLOW_SERVER_LOCAL_AI = "true";
    const seen: Array<string | undefined> = [];
    const recorder: ProviderAdapter = {
      async *stream(c: Candidate): AsyncIterable<AdapterChunk> {
        seen.push(c.credential?.baseUrl);
        yield { type: "text", text: "ok" };
        yield { type: "usage", inputTokens: 1, outputTokens: 1 };
      },
    };
    configureRouterBridge({ adapters: { ollama: recorder } });
    try {
      const res = await request(app()).post("/step").set({ "x-ai-provider": "ollama", "x-ai-model": "llama", "x-ai-base-url": "http://10.0.0.7:11500" }).send({});
      expect(res.status).toBe(200);
      expect(seen).toEqual(["http://10.0.0.7:11500"]);
    } finally {
      if (saved === undefined) delete process.env.ALLOW_SERVER_LOCAL_AI; else process.env.ALLOW_SERVER_LOCAL_AI = saved;
    }
  });
});


describe("legacy single-provider headers for every catalog provider", () => {
  const ringOf = (headers: Record<string, string>) => keyringFromRequest({ headers });
  it("maps a catalog provider to its endpoint and leaves the model to the live list", () => {
    expect(ringOf({ "x-ai-provider": "openrouter", "x-ai-api-key": "k" })).toEqual([expect.objectContaining({ provider: "custom", via: "openrouter", model: "auto", baseUrl: "https://openrouter.ai/api/v1" })]);
    expect(ringOf({ "x-ai-provider": "claude", "x-ai-api-key": "k" })).toEqual([expect.objectContaining({ provider: "anthropic", model: "auto" })]);
    expect(ringOf({ "x-ai-provider": "gemini", "x-ai-api-key": "k", "x-ai-model": "gemini-x" })).toEqual([expect.objectContaining({ provider: "google", model: "gemini-x" })]);
  });
  it("does not duplicate a connection the keyring already holds", () => {
    const ring = Buffer.from(JSON.stringify([{ provider: "custom", via: "openrouter", model: "m1", apiKey: "k", baseUrl: "https://openrouter.ai/api/v1" }])).toString("base64url");
    expect(ringOf({ "x-ai-keyring": ring, "x-ai-provider": "openrouter", "x-ai-api-key": "k" }).length).toBe(1);
  });
  it("keeps a self-hosted http endpoint for the server guard to decide on, instead of dropping the connection", () => {
    expect(ringOf({ "x-ai-provider": "my-llm", "x-ai-api-key": "k", "x-ai-model": "m", "x-ai-base-url": "http://10.0.0.5:8000/v1/chat/completions" })).toEqual([expect.objectContaining({ provider: "custom", model: "m", baseUrl: "http://10.0.0.5:8000/v1" })]);
  });
  it("ignores a provider that needs an address it was not given", () => {
    expect(ringOf({ "x-ai-provider": "cloudflare", "x-ai-api-key": "k" })).toEqual([]);
  });
});

import { routedText, DEFAULT_OUTPUT_BY_TASK } from "../routerBridge";
import type { Request } from "express";

describe("using the provider's allowance efficiently", () => {
  const reqWith = (entry: Record<string, unknown>) => ({ headers: { "x-ai-keyring": ring([{ provider: "openai", model: "m", apiKey: SECRET, ...entry }]) }, user: undefined }) as unknown as Request;
  const seen: Array<{ max: number; messages: unknown[] }> = [];
  function install(script: Array<{ text: string; finish: "stop" | "length" }>) {
    seen.length = 0;
    let n = 0;
    configureRouterBridge({
      adapters: { openai: { async *stream(_c, r, max): AsyncIterable<AdapterChunk> {
        seen.push({ max, messages: r.messages });
        const step = script[Math.min(n++, script.length - 1)];
        yield { type: "text", text: step.text };
        yield { type: "finish", reason: step.finish };
      } } },
      breaker: new CircuitBreaker(new MemoryBreakerStore()),
    });
  }

  it("asks for a roomy output limit on long tasks and a small one on quick tasks, bounded by the model's own limit", async () => {
    install([{ text: "ok", finish: "stop" }]);
    await routedText(reqWith({ maxOutputTokens: 100_000, contextWindow: 200_000 }), { task: "drafting", userPrompt: "write" });
    expect(seen[0].max).toBe(DEFAULT_OUTPUT_BY_TASK.drafting);
    await routedText(reqWith({ maxOutputTokens: 100_000, contextWindow: 200_000 }), { task: "fast", userPrompt: "label" });
    expect(seen[1].max).toBe(DEFAULT_OUTPUT_BY_TASK.fast);
    await routedText(reqWith({ maxOutputTokens: 6_000 }), { task: "drafting", userPrompt: "write" });
    expect(seen[2].max).toBe(6_000);
  });

  it("continues an answer cut off at the output limit, so a long draft arrives whole", async () => {
    install([{ text: "First half, ", finish: "length" }, { text: "second half.", finish: "stop" }]);
    const text = await routedText(reqWith({}), { task: "drafting", userPrompt: "write" });
    expect(text).toBe("First half, second half.");
    expect(seen.length).toBe(2);
    const second = seen[1].messages as Array<{ role: string; content: string }>;
    expect(second.at(-2)).toMatchObject({ role: "assistant", content: "First half, " });
    expect(second.at(-1)?.content).toMatch(/Continue exactly where it stopped/);
  });

  it("stops after two continuations, and keeps what was written if a continuation fails", async () => {
    install([{ text: "a", finish: "length" }, { text: "b", finish: "length" }, { text: "c", finish: "length" }, { text: "d", finish: "stop" }]);
    expect(await routedText(reqWith({}), { task: "drafting", userPrompt: "write" })).toBe("abc");
    expect(seen.length).toBe(3);
  });

  it("does not continue when the caller asked for a short answer", async () => {
    install([{ text: "short", finish: "length" }, { text: "more", finish: "stop" }]);
    expect(await routedText(reqWith({}), { task: "drafting", userPrompt: "write", maxOutputTokens: 300 })).toBe("short");
    expect(seen.length).toBe(1);
  });
});
