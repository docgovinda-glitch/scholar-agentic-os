/**
 * Premium request lifecycle (B4): submit, withdraw, approve, decline.
 * The Supabase REST layer is replaced by a small in-memory table that applies
 * PostgREST-style `col=eq.value` filters, so conditional updates behave as in
 * production.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { SCOPES } from "../../src/middleware/requireAdmin";
import { generateMasterKeyBase64 } from "../../../src/services/crypto/crypto";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
process.env.MASTER_KEY = generateMasterKeyBase64();
process.env.GEMINI_API_KEY = "test-gemini-key";

type Row = Record<string, unknown>;
let premiumRequests: Row[] = [];
let entitlements: Row[] = [];
let failEntitlementWrite = false;
let insertConflict = false;

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (body === null ? "" : JSON.stringify(body)) } as Response;
}

/** Apply `a=eq.x&b=eq.y` filters (ignores order/limit/select). */
function matches(row: Row, query: URLSearchParams): boolean {
  for (const [key, value] of query.entries()) {
    if (!value.startsWith("eq.")) continue;
    if (String(row[key]) !== decodeURIComponent(value.slice(3))) return false;
  }
  return true;
}

function mockFetch() {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;

    if (url.pathname.includes("/auth/v1/user")) {
      const token = headers.Authorization?.replace("Bearer ", "");
      if (token === "admin-token") return Promise.resolve(json(200, { id: ADMIN_ID, email: "admin@example.com" }));
      if (token === "user-token") return Promise.resolve(json(200, { id: USER_ID, email: "user@example.com" }));
      return Promise.resolve(json(401, {}));
    }
    if (url.pathname.endsWith("/rest/v1/admin_users")) {
      return Promise.resolve(json(200, url.search.includes(ADMIN_ID) ? [{ user_id: ADMIN_ID, scopes: SCOPES }] : []));
    }
    if (url.pathname.endsWith("/rest/v1/premium_requests")) {
      if (method === "GET") return Promise.resolve(json(200, premiumRequests.filter((r) => matches(r, url.searchParams))));
      if (method === "POST") {
        if (insertConflict) return Promise.resolve(json(409, { code: "23505" }));
        premiumRequests.push({ id: `req-${premiumRequests.length + 1}`, ...JSON.parse(String(init?.body)) });
        return Promise.resolve(json(201, null));
      }
      if (method === "PATCH") {
        const patch = JSON.parse(String(init?.body));
        const changed = premiumRequests.filter((r) => matches(r, url.searchParams));
        changed.forEach((r) => Object.assign(r, patch));
        const wantsRows = String(headers.Prefer ?? "").includes("return=representation");
        return Promise.resolve(json(200, wantsRows ? changed : null));
      }
    }
    if (url.pathname.endsWith("/rest/v1/user_entitlements")) {
      if (failEntitlementWrite) return Promise.resolve(json(500, { message: "boom" }));
      if (method === "POST") entitlements.push(JSON.parse(String(init?.body)));
      return Promise.resolve(json(200, null));
    }
    if (url.pathname.endsWith("/rest/v1/profiles")) return Promise.resolve(json(200, []));
    return Promise.resolve(json(200, method === "GET" ? [] : null));
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.resetModules();
  premiumRequests = [];
  entitlements = [];
  failEntitlementWrite = false;
  insertConflict = false;
  mockFetch();
});

async function buildApp() {
  const { registerAdminRoutes } = await import("../admin");
  const { registerAiAccessRoutes } = await import("../aiAccess");
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app);
  registerAiAccessRoutes(app);
  return app;
}

const asUser = (r: request.Test) => r.set("Authorization", "Bearer user-token");
const asAdmin = (r: request.Test) => r.set("Authorization", "Bearer admin-token");

describe("Premium requests", () => {
  it("a user submits, cannot submit twice, and withdraws", async () => {
    const app = await buildApp();
    expect((await asUser(request(app).post("/api/ai-access/premium-request")).send({ note: "for my thesis" })).status).toBe(200);
    expect(premiumRequests).toHaveLength(1);
    expect(premiumRequests[0]).toMatchObject({ user_id: USER_ID, status: "pending", note: "for my thesis" });

    const second = await asUser(request(app).post("/api/ai-access/premium-request")).send({});
    expect(second.status).toBe(409);

    expect((await asUser(request(app).delete("/api/ai-access/premium-request"))).status).toBe(200);
    expect(premiumRequests[0].status).toBe("withdrawn");
    // Nothing left to withdraw
    expect((await asUser(request(app).delete("/api/ai-access/premium-request"))).status).toBe(404);
  });

  it("two submissions at once: the database conflict is a 409, not a 500", async () => {
    const app = await buildApp();
    insertConflict = true;
    const res = await asUser(request(app).post("/api/ai-access/premium-request")).send({});
    expect(res.status).toBe(409);
  });

  it("an admin approves a pending request once; it grants Premium", async () => {
    const app = await buildApp();
    premiumRequests.push({ id: "req-1", user_id: USER_ID, status: "pending" });

    const res = await asAdmin(request(app).post("/api/admin/ai/premium-requests/req-1/approve")).send({ planId: "plan-a" });
    expect(res.status).toBe(200);
    expect(premiumRequests[0]).toMatchObject({ status: "approved", decided_by: ADMIN_ID });
    expect(entitlements).toEqual([expect.objectContaining({ user_id: USER_ID, plan_id: "plan-a", status: "active" })]);

    // A second approval does not grant again
    const again = await asAdmin(request(app).post("/api/admin/ai/premium-requests/req-1/approve")).send({ planId: "plan-a" });
    expect(again.status).toBe(409);
    expect(again.body.status).toBe("approved");
    expect(entitlements).toHaveLength(1);
  });

  it("a withdrawn or declined request cannot be approved", async () => {
    const app = await buildApp();
    premiumRequests.push({ id: "req-w", user_id: USER_ID, status: "withdrawn" }, { id: "req-d", user_id: USER_ID, status: "declined" });

    for (const id of ["req-w", "req-d"]) {
      const res = await asAdmin(request(app).post(`/api/admin/ai/premium-requests/${id}/approve`)).send({ planId: "plan-a" });
      expect(res.status).toBe(409);
    }
    expect(entitlements).toHaveLength(0);
  });

  it("decline only changes a pending request; an approved one stays approved", async () => {
    const app = await buildApp();
    premiumRequests.push({ id: "req-p", user_id: USER_ID, status: "pending" }, { id: "req-a", user_id: USER_ID, status: "approved" });

    expect((await asAdmin(request(app).post("/api/admin/ai/premium-requests/req-p/decline")).send({ note: "not now" })).status).toBe(200);
    expect(premiumRequests[0]).toMatchObject({ status: "declined", decision_note: "not now" });

    const res = await asAdmin(request(app).post("/api/admin/ai/premium-requests/req-a/decline")).send({});
    expect(res.status).toBe(409);
    expect(premiumRequests[1].status).toBe("approved");
  });

  it("an unknown request is a 404", async () => {
    const app = await buildApp();
    const res = await asAdmin(request(app).post("/api/admin/ai/premium-requests/nope/approve")).send({ planId: "plan-a" });
    expect(res.status).toBe(404);
  });

  it("if granting fails, the request goes back to pending", async () => {
    const app = await buildApp();
    premiumRequests.push({ id: "req-1", user_id: USER_ID, status: "pending" });
    failEntitlementWrite = true;

    const res = await asAdmin(request(app).post("/api/admin/ai/premium-requests/req-1/approve")).send({ planId: "plan-a" });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(premiumRequests[0]).toMatchObject({ status: "pending", decided_by: null });
  });
});
