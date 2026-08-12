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
import { SCOPES } from "../../src/middleware/requireAdmin";

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

    // admin_users lookup (server/src/middleware/requireAdmin.ts). The mock
    // admin has every scope — this suite's job is proving every route
    // requires SOME real admin-ness, not exercising individual scopes
    // (that's admin.admins.test.ts and requireAdmin.test.ts's job).
    if (url.includes("/rest/v1/admin_users")) {
      const isAdminQuery = url.includes(`user_id=eq.${ADMIN_ID}`);
      return Promise.resolve(textResponse(200, JSON.stringify(isAdminQuery ? [{ user_id: ADMIN_ID, scopes: SCOPES }] : [])));
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
  { method: "get", path: `/api/admin/ai/quota-overrides/${NON_ADMIN_ID}` },
  { method: "post", path: "/api/admin/ai/quota-overrides", body: { userId: NON_ADMIN_ID } },
  { method: "post", path: "/api/admin/ai/credits/grant", body: { userId: NON_ADMIN_ID, amount: 100 } },
  { method: "get", path: "/api/admin/ai/usage" },
  { method: "get", path: "/api/admin/ai/budget" },
  { method: "patch", path: "/api/admin/ai/budget", body: { monthlyBudgetUsd: 500 } },
  { method: "get", path: "/api/admin/ai/platform-credentials" },
  { method: "post", path: "/api/admin/ai/platform-credentials", body: { providerId: "gemini", credential: "sk-x" } },
  { method: "get", path: "/api/admin/ai/whoami" },
  { method: "get", path: "/api/admin/ai/admins" },
  { method: "post", path: "/api/admin/ai/admins", body: { userId: NON_ADMIN_ID } },
  { method: "delete", path: "/api/admin/ai/admins/00000000-0000-0000-0000-000000000099" },
  { method: "patch", path: "/api/admin/ai/admins/00000000-0000-0000-0000-000000000099/scopes", body: { scopes: ["manage_budget"] } },
  { method: "get", path: "/api/admin/ai/users/search?q=alice" },
  { method: "patch", path: "/api/admin/ai/users/00000000-0000-0000-0000-000000000099/status", body: { status: "suspended" } },
  { method: "delete", path: "/api/admin/ai/users/00000000-0000-0000-0000-000000000099", body: { confirmEmail: "x@example.com" } },
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

// Every mutating route's required scope (server/routes/admin.ts's
// requireScopeInline calls) — a SEPARATE mock admin below has zero scopes,
// so this proves each one is actually enforced, not just "some admin
// passes" (which the suite above already covers with a full-scope admin).
const SCOPED_ROUTES: Array<{ method: "patch" | "post" | "delete"; path: string; body?: object }> = [
  { method: "patch", path: "/api/admin/ai/providers/gemini", body: { enabled: false } },
  { method: "patch", path: "/api/admin/ai/models/gemini:gemini-2.5-flash", body: { enabled: false } },
  { method: "post", path: "/api/admin/ai/premium-plans", body: { id: "premium_basic", name: "Basic" } },
  { method: "post", path: "/api/admin/ai/entitlements/grant", body: { userId: NON_ADMIN_ID, planId: "premium_basic", expiry: null } },
  { method: "post", path: "/api/admin/ai/entitlements/revoke", body: { userId: NON_ADMIN_ID } },
  { method: "post", path: "/api/admin/ai/quota-overrides", body: { userId: NON_ADMIN_ID } },
  { method: "post", path: "/api/admin/ai/credits/grant", body: { userId: NON_ADMIN_ID, amount: 100 } },
  { method: "patch", path: "/api/admin/ai/budget", body: { monthlyBudgetUsd: 500 } },
  { method: "post", path: "/api/admin/ai/platform-credentials", body: { providerId: "gemini", credential: "sk-x" } },
  { method: "post", path: "/api/admin/ai/opportunities/research", body: { query: "free AI API tiers 2026" } },
  { method: "post", path: "/api/admin/ai/opportunities/00000000-0000-0000-0000-000000000001/review", body: { decision: "approved" } },
  { method: "post", path: "/api/admin/ai/admins", body: { userId: NON_ADMIN_ID } },
  { method: "delete", path: "/api/admin/ai/admins/00000000-0000-0000-0000-000000000099" },
  { method: "patch", path: "/api/admin/ai/admins/00000000-0000-0000-0000-000000000099/scopes", body: { scopes: ["manage_budget"] } },
  { method: "patch", path: "/api/admin/ai/users/00000000-0000-0000-0000-000000000099/status", body: { status: "suspended" } },
  { method: "delete", path: "/api/admin/ai/users/00000000-0000-0000-0000-000000000099", body: { confirmEmail: "x@example.com" } },
];

const NO_SCOPE_ADMIN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function mockFetchNoScopeAdmin() {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(jsonResponse(200, { id: NO_SCOPE_ADMIN_ID, email: "noscope-admin@example.com" }));
    }
    if (url.includes("/rest/v1/admin_users")) {
      const isThisAdmin = url.includes(`user_id=eq.${NO_SCOPE_ADMIN_ID}`);
      // A real row exists (requireAdmin passes — this IS an admin) but with
      // an empty scopes array, so every requireScopeInline check must fail.
      return Promise.resolve(textResponse(200, JSON.stringify(isThisAdmin ? [{ user_id: NO_SCOPE_ADMIN_ID, scopes: [] }] : [])));
    }
    return Promise.resolve(textResponse(200, "[]"));
  }) as unknown as typeof fetch;
}

describe.each(SCOPED_ROUTES)("scope boundary: $method $path", ({ method, path, body }) => {
  it("403s a real admin who has no scopes at all (requireAdmin passes, requireScopeInline must not)", async () => {
    mockFetchNoScopeAdmin();
    const app = await buildApp();
    const res = await request(app)[method](path).set("Authorization", "Bearer noscope-token").send(body ?? {});
    expect(res.status).toBe(403);
  });
});

/**
 * Express 4 drops a rejected promise from an `async` handler: no status, no
 * body, no error middleware — the request is simply left open until the client
 * gives up. Most routes in admin.ts had no try/catch of their own, so any
 * Supabase failure hung the admin panel rather than reporting itself.
 *
 * registerAdminRoutes now builds its router with createAsyncRouter(), which
 * wraps every handler. This asserts the property across the WHOLE route table
 * rather than per route, so an admin route added later is covered the moment
 * it joins ROUTES — the same reasoning as the authorization sweep above.
 *
 * A hang IS the failure here: supertest never resolves, so the test times out
 * and fails rather than passing quietly.
 */
function mockFetchSupabaseDown() {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    // Auth and the admin lookup still work — we are testing what happens when
    // the request gets PAST the gate and then the data layer fails.
    if (url.includes("/auth/v1/user")) {
      const token = (init?.headers as Record<string, string>)?.Authorization?.replace("Bearer ", "");
      if (token === "admin-token") return Promise.resolve(jsonResponse(200, { id: ADMIN_ID, email: "admin@example.com" }));
      return Promise.resolve(jsonResponse(401, {}));
    }
    if (url.includes("/rest/v1/admin_users")) {
      return Promise.resolve(textResponse(200, JSON.stringify([{ user_id: ADMIN_ID, scopes: SCOPES }])));
    }

    // Everything else — every table read/write and every RPC — is down.
    return Promise.resolve(textResponse(500, "supabase is unavailable"));
  }) as unknown as typeof fetch;
}

describe.each(ROUTES)("never hangs when Supabase is down: $method $path", ({ method, path, body }) => {
  it("answers with a status instead of leaving the request open", async () => {
    mockFetchSupabaseDown();
    const app = await buildApp();
    const res = await request(app)[method](path).set("Authorization", "Bearer admin-token").send(body ?? {});

    // The specific code is not the point — a route with its own try/catch may
    // answer 503, one relying on the router-level wrapper also answers 503,
    // and a route that needs no Supabase call at all may still answer 200.
    // What matters is that a response arrives at all.
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
  });
});

describe("cleanup", () => {
  it("restores the real fetch", () => {
    global.fetch = realFetch;
    expect(true).toBe(true);
  });
});
