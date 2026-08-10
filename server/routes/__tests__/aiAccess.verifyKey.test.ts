/**
 * Tests for POST /api/ai-access/verify-provider-key. The property worth
 * pinning: the outbound call never carries a Tavily/OpenAI/etc key in a way
 * that leaks it back to the client, and a rejected/unreachable provider is
 * reported honestly rather than as a false "connected".
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import { app } from "../../../server.ts";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("POST /api/ai-access/verify-provider-key", () => {
  it("400s on missing fields", async () => {
    const res = await request(app).post("/api/ai-access/verify-provider-key").send({ providerId: "openai" });
    expect(res.status).toBe(400);
  });

  it("400s on an unknown provider id", async () => {
    const res = await request(app).post("/api/ai-access/verify-provider-key").send({ providerId: "not-a-real-provider", apiKey: "x" });
    expect(res.status).toBe(400);
  });

  it("reports ok:true with a models count for a valid key", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }) } as Response);
    const res = await request(app).post("/api/ai-access/verify-provider-key").send({ providerId: "openai", apiKey: "sk-real-looking-key" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, modelsDetected: 2 });
  });

  it("reports ok:false with a clear reason for a rejected key, without echoing the key back", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
    const res = await request(app).post("/api/ai-access/verify-provider-key").send({ providerId: "openai", apiKey: "sk-bad-key" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("sk-bad-key");
  });

  it("reports ok:false when the provider is unreachable, rather than throwing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const res = await request(app).post("/api/ai-access/verify-provider-key").send({ providerId: "openai", apiKey: "sk-test" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
  });

  it("sends the key via ?key= for Gemini, not an Authorization header", async () => {
    let capturedUrl = "";
    let capturedHeaders: any = {};
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedHeaders = init?.headers ?? {};
      return Promise.resolve({ ok: true, json: async () => ({ models: [] }) } as Response);
    }) as unknown as typeof fetch;

    await request(app).post("/api/ai-access/verify-provider-key").send({ providerId: "gemini", apiKey: "AIzaTestKey" });

    expect(capturedUrl).toContain("key=AIzaTestKey");
    expect(capturedHeaders.Authorization).toBeUndefined();
  });

  it("accepts the key without a live check for a provider with no models endpoint", async () => {
    global.fetch = vi.fn();
    // cloudflare has requiresCustomBaseUrl and modelsPath: null per providerCatalog.ts.
    const res = await request(app).post("/api/ai-access/verify-provider-key").send({ providerId: "cloudflare", apiKey: "x" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
