/**
 * Phase 2 of the ai.ts -> platform/gateway migration (13 §8.1, 41 §12.2).
 * Covers generateViaGatewayOrLegacy()'s flag branch and the pre-consent
 * policy, exercised through one representative phase endpoint
 * (/api/generate/data-discovery) rather than all 8 — the branching logic
 * being tested lives entirely in the shared helper, not per-endpoint.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../../server.ts";
import { __resetAuditLogForTests, getAuditLog } from "../../../src/platform/warden/warden.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";

const originalFetch = global.fetch;
const originalFlag = process.env.AI_GATEWAY_PHASE_ENDPOINTS;
const originalKey = process.env.GEMINI_API_KEY;

function requestBody() {
  return { title: "A Study", methodology: "Mixed methods", field: "Education", keywords: "learning" };
}

describe("server/routes/ai.ts: Phase 2 gateway migration flag", () => {
  beforeEach(() => {
    __resetAuditLogForTests();
    __resetRateLimitStore();
    delete process.env.AI_GATEWAY_PHASE_ENDPOINTS;
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalFlag === undefined) delete process.env.AI_GATEWAY_PHASE_ENDPOINTS;
    else process.env.AI_GATEWAY_PHASE_ENDPOINTS = originalFlag;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  it("flag off (default): unaffected by the migration, still fails the same way with no key configured, and never touches the Warden", async () => {
    const res = await request(app).post("/api/generate/data-discovery").send(requestBody());
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("GEMINI_API_KEY environment variable is not defined");
    expect(getAuditLog()).toHaveLength(0);
  });

  it("flag on: routes through platform/gateway and succeeds transparently (pre-consented policy)", async () => {
    process.env.AI_GATEWAY_PHASE_ENDPOINTS = "true";
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ sources: [] }) }] } }],
      }),
    });

    const res = await request(app).post("/api/generate/data-discovery").send(requestBody());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sources: [] });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url] = (global.fetch as any).mock.calls[0];
    expect(url).toContain("key=test-key");
    // The real, new thing this migration adds: a Warden audit entry per call.
    expect(getAuditLog()).toHaveLength(1);
    expect(getAuditLog()[0].decision).toBe("allow");
  });

  it("flag on but provider is not gemini: still falls back to the legacy path unconditionally", async () => {
    process.env.AI_GATEWAY_PHASE_ENDPOINTS = "true";
    global.fetch = vi.fn();

    const res = await request(app)
      .post("/api/generate/data-discovery")
      .send({ ...requestBody(), aiSettings: { provider: "ollama", ollamaEndpoint: "http://localhost:11434" } });

    // Legacy Ollama path attempts a real fetch to the local endpoint and fails
    // (nothing is listening in the test environment) — proving it never took
    // the gateway branch, since the gateway branch would have required
    // GEMINI_API_KEY instead.
    expect(res.status).toBe(500);
    expect(getAuditLog()).toHaveLength(0);
  });

  it("flag on: a provider-level failure still surfaces as a 500 with a useful message, and is recorded in the audit log", async () => {
    process.env.AI_GATEWAY_PHASE_ENDPOINTS = "true";
    process.env.GEMINI_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid API key",
    });

    const res = await request(app).post("/api/generate/data-discovery").send(requestBody());

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Invalid API key");
    expect(getAuditLog()).toHaveLength(1);
  });
});
