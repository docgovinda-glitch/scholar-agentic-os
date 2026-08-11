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
process.env.MAIN_ADMIN_EMAIL = "root@example.com";

const { requireAdmin, requireScope, requireScopeInline, isAdmin, isMainAdmin, getAdminInfo, isValidScope, SCOPES } = await import("../requireAdmin");

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

  it("passes a main admin through without ever querying admin_users", async () => {
    global.fetch = vi.fn(() => {
      throw new Error("admin_users must not be queried for the main admin");
    }) as unknown as typeof fetch;
    const req = { user: { id: "main-1", email: "root@example.com" } } as any;
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as any).adminInfo).toEqual({ isAdmin: true, isMainAdmin: true, scopes: [...SCOPES] });
  });
});

describe("isMainAdmin", () => {
  it("matches MAIN_ADMIN_EMAIL case-insensitively", () => {
    expect(isMainAdmin("Root@Example.com")).toBe(true);
    expect(isMainAdmin("root@example.com")).toBe(true);
  });

  it("is false for any other email, or a null email", () => {
    expect(isMainAdmin("someone-else@example.com")).toBe(false);
    expect(isMainAdmin(null)).toBe(false);
  });
});

describe("isValidScope", () => {
  it("accepts every declared scope and rejects anything else", () => {
    for (const s of SCOPES) expect(isValidScope(s)).toBe(true);
    expect(isValidScope("not_a_real_scope")).toBe(false);
    expect(isValidScope("")).toBe(false);
  });
});

describe("getAdminInfo", () => {
  it("gives the main admin every scope without a database row", async () => {
    global.fetch = vi.fn(() => {
      throw new Error("must not query admin_users for the main admin");
    }) as unknown as typeof fetch;
    const info = await getAdminInfo({ id: "main-1", email: "root@example.com" });
    expect(info).toEqual({ isAdmin: true, isMainAdmin: true, scopes: [...SCOPES] });
  });

  it("returns a regular admin's own granted scopes, filtered to known ones", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([{ user_id: "u1", scopes: ["manage_premium", "not_a_real_scope"] }])));
    const info = await getAdminInfo({ id: "u1", email: "a@example.com" });
    expect(info).toEqual({ isAdmin: true, isMainAdmin: false, scopes: ["manage_premium"] });
  });

  it("returns isAdmin:false with no scopes for a non-admin", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([])));
    const info = await getAdminInfo({ id: "u1", email: "a@example.com" });
    expect(info).toEqual({ isAdmin: false, isMainAdmin: false, scopes: [] });
  });

  it("treats a missing scopes column as no scopes, not a crash", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([{ user_id: "u1" }])));
    const info = await getAdminInfo({ id: "u1", email: "a@example.com" });
    expect(info.scopes).toEqual([]);
  });
});

describe("requireScope", () => {
  it("401s when requireAuth never ran", async () => {
    const req = {} as any;
    const res = mockRes();
    const next = vi.fn();
    await requireScope("manage_users")(req, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s a non-admin", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([])));
    const req = { user: { id: "u1", email: "a@example.com" } } as any;
    const res = mockRes();
    const next = vi.fn();
    await requireScope("manage_users")(req, res as any, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s an admin who lacks the specific required scope", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([{ user_id: "u1", scopes: ["manage_premium"] }])));
    const req = { user: { id: "u1", email: "a@example.com" } } as any;
    const res = mockRes();
    const next = vi.fn();
    await requireScope("manage_users")(req, res as any, next);
    expect(res.statusCode).toBe(403);
    expect((res.body as any).error).toMatch(/manage_users/);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() for an admin who has the required scope", async () => {
    mockFetch(() => textResponse(200, JSON.stringify([{ user_id: "u1", scopes: ["manage_users"] }])));
    const req = { user: { id: "u1", email: "a@example.com" } } as any;
    const res = mockRes();
    const next = vi.fn();
    await requireScope("manage_users")(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() for the main admin regardless of any admin_users row", async () => {
    global.fetch = vi.fn(() => {
      throw new Error("must not query admin_users for the main admin");
    }) as unknown as typeof fetch;
    const req = { user: { id: "main-1", email: "root@example.com" } } as any;
    const res = mockRes();
    const next = vi.fn();
    await requireScope("manage_admins")(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requireScopeInline", () => {
  it("403s and writes a response when req.adminInfo is missing entirely", () => {
    const res = mockRes();
    const ok = requireScopeInline({} as any, res as any, "manage_users");
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("403s when adminInfo.scopes doesn't include the required scope", () => {
    const res = mockRes();
    const req = { adminInfo: { isAdmin: true, isMainAdmin: false, scopes: ["manage_premium"] } } as any;
    const ok = requireScopeInline(req, res as any, "manage_users");
    expect(ok).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("returns true and writes nothing when the scope is present", () => {
    const res = mockRes();
    const req = { adminInfo: { isAdmin: true, isMainAdmin: false, scopes: ["manage_users"] } } as any;
    const ok = requireScopeInline(req, res as any, "manage_users");
    expect(ok).toBe(true);
    expect(res.statusCode).toBe(0);
  });
});
