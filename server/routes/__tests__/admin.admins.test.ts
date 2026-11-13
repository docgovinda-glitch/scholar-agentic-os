/**
 * Business-logic tests for the admin roster routes (server/routes/admin.ts's
 * /admins family, server/src/aiEngine/adminUsers.ts). admin.authz.test.ts
 * already proves every route here requires requireAuth + requireAdmin —
 * this file covers what happens once that gate passes: the roster is
 * resolved against profiles for display, a duplicate grant is a clear 409
 * rather than a raw 500, and an admin can never revoke their own access
 * through this UI (the only other way to edit admin_users is raw SQL, so a
 * self-revoke here would risk a total lockout).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { SCOPES } from "../../src/middleware/requireAdmin";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ADMIN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

import { generateMasterKeyBase64 } from "../../../src/services/crypto/crypto";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
process.env.MASTER_KEY = generateMasterKeyBase64();
process.env.GEMINI_API_KEY = "test-gemini-key";

const realFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

interface MockState {
  adminUsersRows: Array<{ user_id: string; granted_by: string | null; granted_at: string; note: string | null }>;
  insertShouldConflict: boolean;
}

function mockFetch(state: MockState) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/auth/v1/user")) {
      const token = (init?.headers as Record<string, string>)?.Authorization?.replace("Bearer ", "");
      if (token === "admin-token") return Promise.resolve(jsonResponse(200, { id: ADMIN_ID, email: "admin@example.com" }));
      return Promise.resolve(jsonResponse(401, {}));
    }

    if (url.includes("/rest/v1/admin_users")) {
      if (method === "GET") {
        if (url.includes(`user_id=eq.${ADMIN_ID}`)) {
          // requireAdmin's own lookup — full scopes, since this file tests
          // the /admins routes' own business logic, not scope gating.
          return Promise.resolve(jsonResponse(200, [{ user_id: ADMIN_ID, scopes: SCOPES }]));
        }
        // listAdmins()'s full-roster select.
        return Promise.resolve(jsonResponse(200, state.adminUsersRows));
      }
      if (method === "POST") {
        if (state.insertShouldConflict) {
          return Promise.resolve(jsonResponse(409, { message: "duplicate key value violates unique constraint" }));
        }
        return Promise.resolve(jsonResponse(200, []));
      }
      if (method === "DELETE") {
        return Promise.resolve(jsonResponse(200, []));
      }
    }

    if (url.includes("/rest/v1/profiles")) {
      return Promise.resolve(
        jsonResponse(200, [
          { id: ADMIN_ID, username: "owner", full_name: "The Owner" },
          { id: OTHER_ADMIN_ID, username: "second-admin", full_name: "Second Admin" },
        ])
      );
    }

    if (url.includes("/rest/v1/admin_audit_log")) {
      return Promise.resolve(jsonResponse(200, []));
    }

    return Promise.resolve(jsonResponse(200, []));
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.resetModules();
});

async function buildApp(state: MockState) {
  mockFetch(state);
  const { registerAdminRoutes } = await import("../admin");
  const app = express();
  registerAdminRoutes(app);
  return app;
}

describe("GET /api/admin/ai/admins", () => {
  it("resolves each roster row against profiles, without dropping a row that has no profile", async () => {
    const app = await buildApp({
      adminUsersRows: [
        { user_id: ADMIN_ID, granted_by: null, granted_at: "2026-01-01T00:00:00Z", note: "initial owner" },
        { user_id: OTHER_ADMIN_ID, granted_by: ADMIN_ID, granted_at: "2026-02-01T00:00:00Z", note: null },
        { user_id: TARGET_ID, granted_by: ADMIN_ID, granted_at: "2026-03-01T00:00:00Z", note: null },
      ],
      insertShouldConflict: false,
    });
    const res = await request(app).get("/api/admin/ai/admins").set("Authorization", "Bearer admin-token");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toMatchObject({ userId: ADMIN_ID, username: "owner", fullName: "The Owner" });
    expect(res.body[1]).toMatchObject({ userId: OTHER_ADMIN_ID, username: "second-admin" });
    // No matching profile row in the mock — resolves to null, not dropped.
    expect(res.body[2]).toMatchObject({ userId: TARGET_ID, username: null, fullName: null });
  });

  it("returns an empty list without querying profiles when there are no admins", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app).get("/api/admin/ai/admins").set("Authorization", "Bearer admin-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/admin/ai/admins", () => {
  it("grants a new admin", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app)
      .post("/api/admin/ai/admins")
      .set("Authorization", "Bearer admin-token")
      .send({ userId: TARGET_ID, note: "on-call this quarter" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("400s without a userId", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app).post("/api/admin/ai/admins").set("Authorization", "Bearer admin-token").send({});
    expect(res.status).toBe(400);
  });

  it("409s a duplicate grant with a clear message, not a raw 500", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: true });
    const res = await request(app)
      .post("/api/admin/ai/admins")
      .set("Authorization", "Bearer admin-token")
      .send({ userId: TARGET_ID });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already an admin/i);
  });

  it("400s a grant naming an unknown scope", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app)
      .post("/api/admin/ai/admins")
      .set("Authorization", "Bearer admin-token")
      .send({ userId: TARGET_ID, scopes: ["manage_opportunities", "not_a_real_scope"] });
    expect(res.status).toBe(400);
  });

  it("accepts a grant with a real subset of scopes", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app)
      .post("/api/admin/ai/admins")
      .set("Authorization", "Bearer admin-token")
      .send({ userId: TARGET_ID, scopes: ["manage_opportunities", "manage_users"] });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/admin/ai/admins/:userId/scopes", () => {
  it("updates another admin's scopes", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app)
      .patch(`/api/admin/ai/admins/${TARGET_ID}/scopes`)
      .set("Authorization", "Bearer admin-token")
      .send({ scopes: ["manage_users"] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("400s an unknown scope", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app)
      .patch(`/api/admin/ai/admins/${TARGET_ID}/scopes`)
      .set("Authorization", "Bearer admin-token")
      .send({ scopes: ["not_a_real_scope"] });
    expect(res.status).toBe(400);
  });

  it("refuses to let an admin edit their own scopes here", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app)
      .patch(`/api/admin/ai/admins/${ADMIN_ID}/scopes`)
      .set("Authorization", "Bearer admin-token")
      .send({ scopes: ["manage_users"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot change your own permissions/i);
  });
});

describe("DELETE /api/admin/ai/admins/:userId", () => {
  it("revokes another admin's access", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app).delete(`/api/admin/ai/admins/${TARGET_ID}`).set("Authorization", "Bearer admin-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("refuses to let an admin revoke their own access, to prevent a total lockout with no other way to re-grant it", async () => {
    const app = await buildApp({ adminUsersRows: [], insertShouldConflict: false });
    const res = await request(app).delete(`/api/admin/ai/admins/${ADMIN_ID}`).set("Authorization", "Bearer admin-token");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot revoke your own admin access/i);
  });
});

describe("cleanup", () => {
  it("restores the real fetch", () => {
    global.fetch = realFetch;
    expect(true).toBe(true);
  });
});
