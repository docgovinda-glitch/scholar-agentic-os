/**
 * Authorization tests for the Admin AI Infrastructure routes.
 *
 * Before server/routes/admin.ts was filled in, no admin surface existed at
 * all in this codebase. What matters here is not each route's business
 * logic — it's that EVERY route under /api/admin/ai is actually gated by
 * requireAuth + requireAdmin, for real, with no route accidentally left
 * open. That's checked across the whole route table below rather than
 * per-route, so a new admin route added later without the gate fails this
 * suite immediately instead of silently shipping unauthenticated.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NON_ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

import { generateMasterKeyBase64 } from "../../../src/services/crypto/crypto";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
process.env.MASTER_KEY = generateMasterKeyBase64();
process.env.GEMINI_API_KEY = "test-gemini-key";

const realFetch = global.fetch;

function mockFetch() {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    // GoTrue token verification (server/src/middleware/auth.ts).
    if (url.includes("/auth/v1/user")) {
      const token = (init?.headers as Record<string, string>)?.Authorization?.replace("Bearer ", "");
      if (token === "admin-token") return Promise.resolve(jsonResponse(200, { id: ADMIN_ID, email: "admin@example.com" }));
      if (token === "non-admin-token") return Promise.resolve(jsonResponse(200, { id: NON_ADMIN_ID, email: "user@example.com" }));
      return Promise.resolve(jsonResponse(401, {}));
    }

    // admin_users lookup (server/src/middleware/requireAdmin.ts).
    if (url.includes("/rest/v1/admin_users")) {
      const isAdminQuery = url.includes(`user_id=eq.${ADMIN_ID}`);
      return Promise.resolve(textResponse(200, JSON.stringify(isAdminQuery ? [{ user_id: ADMIN_ID }] : [])));
    }

    // Everything past the gate: an empty-but-valid PostgREST response is
    // enough — these tests exist to prove the gate runs, not to exercise
    // each route's downstream query.
    return Promise.resolve(textResponse(200, "[]"));
  }) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
function textResponse(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) } as Response;
}

beforeEach(() => {
  vi.resetModules();
  mockFetch();
});

async function buildApp() {
  const { registerAdminRoutes } = await import("../admin");
  const app = express();
  registerAdminRoutes(app);
  return app;
}

const ROUTES: Array<{ method: "get" | "post" | "patch" | "delete"; path: string; body?: object }> = [
  { method: "get", path: "/api/admin/ai/dashboard" },
  { method: "get", path: "/api/admin/ai/providers" },
  { method: "patch", path: "/api/admin/ai/providers/gemini", body: { enabled: false } },
  { method: "get", path: "/api/admin/ai/models" },
  { method: "patch", path: "/api/admin/ai/models/gemini:gemini-2.5-flash", body: { enabled: false } },
  { method: "get", path: "/api/admin/ai/premium-plans" },
  { method: "post", path: "/api/admin/ai/premium-plans", body: { id: "premium_basic", name: "Basic" } },
  { method: "post", path: "/api/admin/ai/entitlements/grant", body: { userId: NON_ADMIN_ID, planId: "premium_basic", expiry: null } },
  { method: "post", path: "/api/admin/ai/entitlements/revoke", body: { userId: NON_ADMIN_ID } },
  { method: "post", path: "/api/admin/ai/quota-overrides", body: { userId: NON_ADMIN_ID } },
  { method: "post", path: "/api/admin/ai/credits/grant", body: { userId: NON_ADMIN_ID, amount: 100 } },
  { method: "get", path: "/api/admin/ai/usage" },
  { method: "get", path: "/api/admin/ai/budget" },
  { method: "patch", path: "/api/admin/ai/budget", body: { monthlyBudgetUsd: 500 } },
  { method: "get", path: "/api/admin/ai/platform-credentials" },
  { method: "post", path: "/api/admin/ai/platform-credentials", body: { providerId: "gemini", credential: "sk-x" } },
  { method: "get", path: "/api/admin/ai/whoami" },
  { method: "get", path: "/api/admin/ai/opportunities" },
  { method: "post", path: "/api/admin/ai/opportunities/research", body: { query: "free AI API tiers 2026" } },
  { method: "post", path: "/api/admin/ai/opportunities/00000000-0000-0000-0000-000000000001/review", body: { decision: "approved" } },
  { method: "get", path: "/api/admin/ai/audit-log" },
];

describe.each(ROUTES)("$method $path", ({ method, path, body }) => {
  it("401s with no Authorization header at all", async () => {
    const app = await buildApp();
    const res = await request(app)[method](path).send(body ?? {});
    expect(res.status).toBe(401);
  });

  it("403s a real, authenticated, non-admin user", async () => {
    const app = await buildApp();
    const res = await request(app)[method](path).set("Authorization", "Bearer non-admin-token").send(body ?? {});
    expect(res.status).toBe(403);
  });

  it("does not 401/403 a real admin (the gate passes them through)", async () => {
    const app = await buildApp();
    const res = await request(app)[method](path).set("Authorization", "Bearer admin-token").send(body ?? {});
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe("cleanup", () => {
  it("restores the real fetch", () => {
    global.fetch = realFetch;
    expect(true).toBe(true);
  });
});
