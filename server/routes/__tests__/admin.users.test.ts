/**
 * Business-logic tests for the /users admin routes (search, suspend/
 * restore, hard delete) — admin.authz.test.ts proves these routes require
 * requireAuth + requireAdmin + the manage_users scope; this file covers
 * what those routes actually do once the gate passes.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { SCOPES } from "../../src/middleware/requireAdmin";
import { generateMasterKeyBase64 } from "../../../src/services/crypto/crypto";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
process.env.MASTER_KEY = generateMasterKeyBase64();
process.env.GEMINI_API_KEY = "test-gemini-key";

const realFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

function mockFetch() {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/auth/v1/user")) {
      const token = (init?.headers as Record<string, string>)?.Authorization?.replace("Bearer ", "");
      if (token === "admin-token") return Promise.resolve(jsonResponse(200, { id: ADMIN_ID, email: "admin@example.com" }));
      return Promise.resolve(jsonResponse(401, {}));
    }

    if (url.includes("/rest/v1/admin_users") && url.includes(`user_id=eq.${ADMIN_ID}`)) {
      return Promise.resolve(jsonResponse(200, [{ user_id: ADMIN_ID, scopes: SCOPES }]));
    }

    if (url.includes("/rest/v1/profiles")) {
      if (method === "GET") return Promise.resolve(jsonResponse(200, []));
      return Promise.resolve(jsonResponse(200, []));
    }

    if (url.includes(`/auth/v1/admin/users/${TARGET_ID}`) && method === "GET") {
      return Promise.resolve(jsonResponse(200, { id: TARGET_ID, email: "target@example.com" }));
    }
    if (url.includes(`/auth/v1/admin/users/${TARGET_ID}`) && method === "DELETE") {
      return Promise.resolve(jsonResponse(200, {}));
    }
    if (url.includes("/auth/v1/admin/users")) {
      return Promise.resolve(jsonResponse(200, { users: [] }));
    }

    return Promise.resolve(jsonResponse(200, []));
  }) as unknown as typeof fetch;
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

describe("GET /api/admin/ai/users/search", () => {
  it("200s with an array for a real admin with manage_users", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/admin/ai/users/search?q=alice").set("Authorization", "Bearer admin-token");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("PATCH /api/admin/ai/users/:userId/status", () => {
  it("suspends another user", async () => {
    const app = await buildApp();
    const res = await request(app)
      .patch(`/api/admin/ai/users/${TARGET_ID}/status`)
      .set("Authorization", "Bearer admin-token")
      .send({ status: "suspended", reason: "abuse report" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("400s an invalid status value", async () => {
    const app = await buildApp();
    const res = await request(app)
      .patch(`/api/admin/ai/users/${TARGET_ID}/status`)
      .set("Authorization", "Bearer admin-token")
      .send({ status: "deleted" });
    expect(res.status).toBe(400);
  });

  it("refuses to let an admin change their own account status here", async () => {
    const app = await buildApp();
    const res = await request(app)
      .patch(`/api/admin/ai/users/${ADMIN_ID}/status`)
      .set("Authorization", "Bearer admin-token")
      .send({ status: "suspended" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot change your own account status/i);
  });
});

describe("DELETE /api/admin/ai/users/:userId", () => {
  it("400s without confirmEmail", async () => {
    const app = await buildApp();
    const res = await request(app).delete(`/api/admin/ai/users/${TARGET_ID}`).set("Authorization", "Bearer admin-token").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirmEmail/);
  });

  it("400s a confirmEmail that doesn't match the account's real email", async () => {
    const app = await buildApp();
    const res = await request(app)
      .delete(`/api/admin/ai/users/${TARGET_ID}`)
      .set("Authorization", "Bearer admin-token")
      .send({ confirmEmail: "wrong@example.com" });
    expect(res.status).toBe(400);
  });

  it("deletes the account when confirmEmail matches", async () => {
    const app = await buildApp();
    const res = await request(app)
      .delete(`/api/admin/ai/users/${TARGET_ID}`)
      .set("Authorization", "Bearer admin-token")
      .send({ confirmEmail: "target@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("refuses to let an admin delete their own account here", async () => {
    const app = await buildApp();
    const res = await request(app)
      .delete(`/api/admin/ai/users/${ADMIN_ID}`)
      .set("Authorization", "Bearer admin-token")
      .send({ confirmEmail: "admin@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot delete your own account/i);
  });
});

describe("cleanup", () => {
  it("restores the real fetch", () => {
    global.fetch = realFetch;
    expect(true).toBe(true);
  });
});
