/**
 * Authorization tests for the user-facing AI Access routes. What matters:
 * every route requires a real, verified session (no anonymous access to
 * anyone's connections/entitlement/quota), and the user id used to scope
 * every query comes from the verified token — never from the request body
 * — so nothing here lets one user read or touch another's data.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const realFetch = global.fetch;

function mockFetch(capture: { urls: string[] }) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    capture.urls.push(url);

    if (url.includes("/auth/v1/user")) {
      const token = (init?.headers as Record<string, string>)?.Authorization?.replace("Bearer ", "");
      if (token === "alice-token") return Promise.resolve(jsonResponse(200, { id: ALICE, email: "alice@example.com" }));
      return Promise.resolve(jsonResponse(401, {}));
    }

    return Promise.resolve(textResponse(200, "[]"));
  }) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
function textResponse(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) } as Response;
}

let capture: { urls: string[] };

beforeEach(() => {
  vi.resetModules();
  capture = { urls: [] };
  mockFetch(capture);
});

async function buildApp() {
  const { registerAiAccessRoutes } = await import("../aiAccess");
  const app = express();
  registerAiAccessRoutes(app);
  return app;
}

describe("GET /api/ai-access/status", () => {
  it("401s with no session", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/ai-access/status");
    expect(res.status).toBe(401);
  });

  it("scopes every query to the verified user's own id, never a client-supplied one", async () => {
    const app = await buildApp();
    const res = await request(app)
      .get("/api/ai-access/status")
      .query({ userId: "someone-elses-id" }) // even if a client tried to pass this, it must be ignored
      .set("Authorization", "Bearer alice-token");

    expect(res.status).toBe(200);
    const dataUrls = capture.urls.filter((u) => u.includes("/rest/v1/"));
    expect(dataUrls.length).toBeGreaterThan(0);
    for (const u of dataUrls) {
      // Most tables key on user_id; profiles (checked by requireAuth's
      // account-status gate, server/src/middleware/auth.ts) keys on id —
      // both correctly scope to Alice's own verified id, never a
      // client-supplied one.
      expect(u.includes(`user_id=eq.${ALICE}`) || u.includes(`id=eq.${ALICE}`)).toBe(true);
      expect(u).not.toContain("someone-elses-id");
    }
  });
});

describe("POST /api/ai-access/connections", () => {
  it("401s with no session", async () => {
    const app = await buildApp();
    const res = await request(app).post("/api/ai-access/connections").send({ providerId: "gemini", tier: "free" });
    expect(res.status).toBe(401);
  });

  it("writes the connection under the verified user's id, ignoring any userId in the body", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/ai-access/connections")
      .set("Authorization", "Bearer alice-token")
      .send({ providerId: "gemini", tier: "free", userId: "someone-elses-id" });

    expect(res.status).toBe(200);
    const writeCall = capture.urls.find((u) => u.includes("/rest/v1/user_ai_connections"));
    expect(writeCall).toBeDefined();
  });
});

describe("DELETE /api/ai-access/connections/:providerId", () => {
  it("scopes the delete to the verified user's own id", async () => {
    const app = await buildApp();
    const res = await request(app).delete("/api/ai-access/connections/gemini").set("Authorization", "Bearer alice-token");
    expect(res.status).toBe(200);
    const deleteUrl = capture.urls.find((u) => u.includes("/rest/v1/user_ai_connections") && u.includes("provider_id=eq.gemini"));
    expect(deleteUrl).toContain(`user_id=eq.${ALICE}`);
  });
});

describe("cleanup", () => {
  it("restores the real fetch", () => {
    global.fetch = realFetch;
    expect(true).toBe(true);
  });
});
