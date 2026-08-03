/**
 * Phase 3 of the ai.ts -> platform/gateway migration (13 §8.1, 41 §12.2).
 * Covers /api/generate and /api/stream-generate's AI_GATEWAY_GENERAL_PROXY
 * flag branch — the general-purpose proxy the legacy client-side
 * aiGateway.ts (and through it the whole agent/skill pipeline) depends on.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../../server.ts";
import { __resetAuditLogForTests, getAuditLog } from "../../../src/platform/warden/warden.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";

const originalFetch = global.fetch;
const originalFlag = process.env.AI_GATEWAY_GENERAL_PROXY;

describe("server/routes/ai.ts: Phase 3 general proxy gateway migration flag", () => {
  beforeEach(() => {
    __resetAuditLogForTests();
    __resetRateLimitStore();
    delete process.env.AI_GATEWAY_GENERAL_PROXY;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalFlag === undefined) delete process.env.AI_GATEWAY_GENERAL_PROXY;
    else process.env.AI_GATEWAY_GENERAL_PROXY = originalFlag;
  });

  describe("POST /api/generate", () => {
    // Distinct prompt text per test: getCacheKey() hashes {provider, model,
    // systemInstruction, prompt, temperature, responseMimeType} — notably
    // NOT apiKey or baseUrl — and requestCache is a module-level Map with no
    // test-reset hook. Reusing a prompt across cases would let a later test
    // silently short-circuit on an earlier test's cached response instead of
    // exercising the code path it claims to test.

    it("flag off (default): unaffected, and never touches the Warden", async () => {
      global.fetch = vi.fn();
      const res = await request(app)
        .post("/api/generate")
        .send({ provider: "openai", apiKey: "", prompt: "prompt-flag-off" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("API key is required");
      expect(getAuditLog()).toHaveLength(0);
    });

    it("flag on, cloud provider with a client-supplied key: routes through platform/gateway and writes an audit entry", async () => {
      process.env.AI_GATEWAY_GENERAL_PROXY = "true";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "hello from openai" } }] }),
      });

      const res = await request(app)
        .post("/api/generate")
        .send({ provider: "openai", apiKey: "sk-test", prompt: "prompt-flag-on", taskType: "chat" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ text: "hello from openai" });
      expect(getAuditLog()).toHaveLength(1);
      expect(getAuditLog()[0].taskClass).toBe("chat");
    });

    it("flag on but a custom baseUrl override is set: falls back to the legacy path (gateway has no baseUrl override capability)", async () => {
      process.env.AI_GATEWAY_GENERAL_PROXY = "true";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "from custom endpoint" } }] }),
      });

      const res = await request(app)
        .post("/api/generate")
        .send({ provider: "openai", apiKey: "sk-test", prompt: "prompt-baseurl-override", baseUrl: "https://my-custom-host.example.com/v1" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ text: "from custom endpoint" });
      // Legacy path was used — proven by zero Warden audit entries.
      expect(getAuditLog()).toHaveLength(0);
    });

    it("flag on, taskType maps to a non-default TaskClass", async () => {
      process.env.AI_GATEWAY_GENERAL_PROXY = "true";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "structured rules" } }] }),
      });

      const res = await request(app)
        .post("/api/generate")
        .send({ provider: "openai", apiKey: "sk-test", prompt: "prompt-tasktype-requirements", taskType: "requirements" });

      expect(res.status).toBe(200);
      expect(getAuditLog()[0].taskClass).toBe("rule_extraction");
    });
  });

  describe("POST /api/stream-generate", () => {
    it("flag off (default): unaffected, and never touches the Warden", async () => {
      global.fetch = vi.fn();
      const res = await request(app)
        .post("/api/stream-generate")
        .send({ provider: "openai", apiKey: "", prompt: "hi" });
      expect(res.status).toBe(200);
      expect(res.text).toContain("API key is required");
      expect(getAuditLog()).toHaveLength(0);
    });

    it("flag on: streams deltas as SSE data frames and writes an audit entry", async () => {
      process.env.AI_GATEWAY_GENERAL_PROXY = "true";
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hi there" } }] })}\n\n`)
          );
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, body });

      const res = await request(app)
        .post("/api/stream-generate")
        .send({ provider: "openai", apiKey: "sk-test", prompt: "hi" });

      expect(res.status).toBe(200);
      expect(res.text).toContain(`data: ${JSON.stringify({ text: "Hi there" })}`);
      expect(getAuditLog()).toHaveLength(1);
    });

    it("flag on: a provider failure is delivered as an SSE error frame, not an HTTP error status", async () => {
      process.env.AI_GATEWAY_GENERAL_PROXY = "true";
      // 401 (invalid_key) is not retryable, unlike 429/5xx — one attempt, one
      // audit entry, and no multi-second backoff slowing the test down.
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "invalid key" });

      const res = await request(app)
        .post("/api/stream-generate")
        .send({ provider: "openai", apiKey: "sk-test", prompt: "hi" });

      expect(res.status).toBe(200);
      expect(res.text).toContain('"error"');
      expect(getAuditLog()).toHaveLength(1);
    });
  });
});
