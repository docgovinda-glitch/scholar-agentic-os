/**
 * Tests for admin authorization — the entire boundary protecting every
 * Admin AI Infrastructure route. Never trust a client-side admin flag;
 * these tests exist to pin down that the check is always a real query
 * against admin_users, fails closed on every error path, and refuses to
 * run at all without an authenticated user already attached.
 */

import { describe, it, expect, afterEach, vi } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { requireAdmin, isAdmin } = await import("../requireAdmin");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(impl(typeof input === "string" ? input : input.toString(), init))
  ) as unknown as typeof fetch;
}

const textResponse = (status: number, body: string) => ({ ok: status >= 200 && status < 300, status, text: async () => body }) as Response;

function mockRes() {
  const res = {
    statusCode: 0 as number,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe("isAdmin", () => {
  it("returns true when admin_users has a row for the user", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([{ user_id: "u1" }])));
    expect(await isAdmin("u1")).toBe(true);
  });

  it("returns false when admin_users has no row for the user", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([])));
    expect(await isAdmin("u1")).toBe(false);
  });

  it("returns false, not throws, when Supabase is unreachable", async () => {
    mockFetch(() => {
      throw new Error("network down");
    });
    await expect(isAdmin("u1")).rejects.toThrow();
  });
});

describe("requireAdmin", () => {
  it("401s when requireAuth never ran (no req.user attached)", async () => {
    const req = {} as any;
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req, res as any, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s a real, authenticated, non-admin user", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([])));
    const req = { user: { id: "u1", email: "a@example.com" } } as any;
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req, res as any, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() for a real admin", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([{ user_id: "u1" }])));
    const req = { user: { id: "u1", email: "admin@example.com" } } as any;
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("fails closed (503, not next()) when the admin check errors", async () => {
    mockFetch(() => {
      throw new Error("network down");
    });
    const req = { user: { id: "u1", email: "a@example.com" } } as any;
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req, res as any, next);

    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
});
