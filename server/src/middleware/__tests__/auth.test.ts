/**
 * Tests for token verification.
 *
 * Written after this middleware took production down. `requireAuth` called
 * `createClient()` per request; that constructor builds a RealtimeClient,
 * which needs a native WebSocket, which `node:20-alpine` does not have — so it
 * threw before looking at any token and every authenticated request answered
 * 500. Nothing caught it, because nothing tested this file at all.
 *
 * The cases below are the ones that actually went wrong or could:
 * a dependency exploding, the identity provider being unreachable, and
 * configuration being absent. Each has a distinct correct status code, and
 * conflating them is what made the outage hard to read from the outside.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SUPABASE_URL = "https://test.supabase.co";
const SERVICE_ROLE = "sb_secret_test";

process.env.VITE_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;

const { requireAuth, verifyAccessToken, __clearTokenCacheForTests } = await import("../auth");

const originalFetch = global.fetch;
beforeEach(() => {
  __clearTokenCacheForTests();
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(impl(typeof input === "string" ? input : input.toString(), init))
  ) as unknown as typeof fetch;
}

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

/** Routes /auth/v1/user to `user` and /rest/v1/profiles to `profileRows` — for the account-status enforcement tests below, which exercise both calls requireAuth now makes. */
function mockFetchWithProfile(user: unknown, profileRows: unknown[]) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/auth/v1/user")) return Promise.resolve(jsonResponse(200, user));
    if (url.includes("/rest/v1/profiles")) return Promise.resolve(jsonResponse(200, profileRows));
    return Promise.resolve(jsonResponse(200, []));
  }) as unknown as typeof fetch;
}

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

describe("verifyAccessToken", () => {
  it("returns the user for a token GoTrue accepts", async () => {
    mockFetch(() => jsonResponse(200, { id: "user-1", email: "a@example.com" }));

    const result = await verifyAccessToken("good-token");

    expect(result.ok).toBe(true);
    expect(result.user).toEqual({ id: "user-1", email: "a@example.com" });
  });

  it("sends both the service key and the user token", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    mockFetch((url, init) => {
      seenUrl = url;
      seenHeaders = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse(200, { id: "user-1", email: null });
    });

    await verifyAccessToken("the-user-token");

    // GoTrue rejects either credential alone, so both must be present.
    expect(seenUrl).toBe(`${SUPABASE_URL}/auth/v1/user`);
    expect(seenHeaders.apikey).toBe(SERVICE_ROLE);
    expect(seenHeaders.Authorization).toBe("Bearer the-user-token");
  });

  it("treats 401 as an invalid token", async () => {
    mockFetch(() => jsonResponse(401, { msg: "invalid JWT" }));
    expect(await verifyAccessToken("bad")).toEqual({ ok: false, reason: "invalid" });
  });

  it("treats a 200 with no user id as invalid, not as success", async () => {
    mockFetch(() => jsonResponse(200, {}));
    expect(await verifyAccessToken("weird")).toEqual({ ok: false, reason: "invalid" });
  });

  it("distinguishes a Supabase outage from a bad token", async () => {
    mockFetch(() => jsonResponse(500, { msg: "internal" }));

    // Not "invalid": the token may be perfectly good.
    expect(await verifyAccessToken("good")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports a thrown fetch as unavailable rather than propagating it", async () => {
    // The shape of the outage: a dependency throwing, not returning.
    global.fetch = vi.fn(() => {
      throw new Error("Node.js detected but native WebSocket not found.");
    }) as unknown as typeof fetch;

    await expect(verifyAccessToken("good")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("requireAuth", () => {
  let next: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    next = vi.fn();
  });

  it("attaches the user and continues on a valid token", async () => {
    mockFetch(() => jsonResponse(200, { id: "user-9", email: "z@example.com" }));
    const req = { headers: { authorization: "Bearer good" } } as never;
    const res = mockRes();

    await requireAuth(req, res as never, next as never);

    expect(next).toHaveBeenCalledOnce();
    expect((req as { user?: unknown }).user).toEqual({ id: "user-9", email: "z@example.com" });
  });

  it.each([
    ["no header", undefined],
    ["not a bearer token", "Basic abc123"],
    ["bearer with nothing after it", "Bearer "],
  ])("401s and does not continue when the header is %s", async (_label, authorization) => {
    mockFetch(() => jsonResponse(200, { id: "should-not-be-reached" }));
    const res = mockRes();

    await requireAuth({ headers: { authorization } } as never, res as never, next as never);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("503s, not 401s, when the identity provider cannot be reached", async () => {
    global.fetch = vi.fn(() => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const res = mockRes();

    await requireAuth({ headers: { authorization: "Bearer good" } } as never, res as never, next as never);

    // 401 here would tell a signed-in user to sign in again during an outage
    // they cannot fix, and would look identical to a genuine rejection.
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("401s on a token the provider rejects", async () => {
    mockFetch(() => jsonResponse(401, { msg: "expired" }));
    const res = mockRes();

    await requireAuth({ headers: { authorization: "Bearer expired" } } as never, res as never, next as never);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("never calls next() on any failure path", async () => {
    for (const impl of [
      () => jsonResponse(401, {}),
      () => jsonResponse(500, {}),
      () => jsonResponse(200, {}),
    ]) {
      next = vi.fn();
      mockFetch(impl);
      await requireAuth({ headers: { authorization: "Bearer t" } } as never, mockRes() as never, next as never);
      expect(next).not.toHaveBeenCalled();
    }
  });
});

describe("requireAuth: account-status enforcement", () => {
  let next: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    next = vi.fn();
  });

  it("403s a valid token whose account is suspended — a valid JWT is no longer enough on its own", async () => {
    mockFetchWithProfile({ id: "user-1", email: "a@example.com" }, [{ account_status: "suspended" }]);
    const res = mockRes();

    await requireAuth({ headers: { authorization: "Bearer good" } } as never, res as never, next as never);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s restricted and deleted accounts too, not only suspended", async () => {
    for (const status of ["restricted", "deleted"]) {
      next = vi.fn();
      mockFetchWithProfile({ id: "user-1", email: "a@example.com" }, [{ account_status: status }]);
      const res = mockRes();
      await requireAuth({ headers: { authorization: "Bearer good" } } as never, res as never, next as never);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("continues for an active account", async () => {
    mockFetchWithProfile({ id: "user-1", email: "a@example.com" }, [{ account_status: "active" }]);
    const res = mockRes();

    await requireAuth({ headers: { authorization: "Bearer good" } } as never, res as never, next as never);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("a restored account (suspended -> active) passes again", async () => {
    mockFetchWithProfile({ id: "user-1", email: "a@example.com" }, [{ account_status: "active" }]);
    const res = mockRes();
    await requireAuth({ headers: { authorization: "Bearer good" } } as never, res as never, next as never);
    expect(next).toHaveBeenCalledOnce();
  });

  it("fails OPEN (still continues) when the profile row is missing entirely", async () => {
    mockFetchWithProfile({ id: "user-1", email: "a@example.com" }, []);
    const res = mockRes();

    await requireAuth({ headers: { authorization: "Bearer good" } } as never, res as never, next as never);

    expect(next).toHaveBeenCalledOnce();
  });

  it("fails OPEN (still continues) when the profiles lookup itself errors — an outage there must not lock out every user", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/auth/v1/user")) return Promise.resolve(jsonResponse(200, { id: "user-1", email: "a@example.com" }));
      throw new Error("profiles table unreachable");
    }) as unknown as typeof fetch;
    const res = mockRes();

    await requireAuth({ headers: { authorization: "Bearer good" } } as never, res as never, next as never);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe("verifyAccessToken — LRU Cache & Local JWT verification (B2)", () => {
  it("serves subsequent token verifications from cache without calling fetch", async () => {
    let fetchCount = 0;
    mockFetch(() => {
      fetchCount++;
      return jsonResponse(200, { id: "user-cached", email: "cached@example.com" });
    });

    const first = await verifyAccessToken("token-to-cache");
    expect(first.ok).toBe(true);
    expect(first.user?.id).toBe("user-cached");
    expect(fetchCount).toBe(1);

    const second = await verifyAccessToken("token-to-cache");
    expect(second.ok).toBe(true);
    expect(second.user?.id).toBe("user-cached");
    expect(fetchCount).toBe(1); // network fetch skipped due to cache hit
  });

  it("verifies JWT locally using SUPABASE_JWT_SECRET without calling fetch", async () => {
    const crypto = await import("crypto");
    const testSecret = "super-secret-jwt-test-key-32-chars!!";
    process.env.SUPABASE_JWT_SECRET = testSecret;

    let fetchCount = 0;
    mockFetch(() => {
      fetchCount++;
      return jsonResponse(200, { id: "should-not-be-called" });
    });

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      sub: "local-jwt-user",
      email: "local@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString("base64url");
    const signature = crypto.createHmac("sha256", testSecret).update(`${header}.${payload}`).digest("base64url");
    const token = `${header}.${payload}.${signature}`;

    const result = await verifyAccessToken(token);
    expect(result.ok).toBe(true);
    expect(result.user).toEqual({ id: "local-jwt-user", email: "local@example.com" });
    expect(fetchCount).toBe(0); // completely local, 0ms latency

    delete process.env.SUPABASE_JWT_SECRET;
  });

  it("rejects an expired local JWT without calling fetch", async () => {
    const crypto = await import("crypto");
    const testSecret = "super-secret-jwt-test-key-32-chars!!";
    process.env.SUPABASE_JWT_SECRET = testSecret;

    let fetchCount = 0;
    mockFetch(() => {
      fetchCount++;
      return jsonResponse(200, { id: "should-not-be-called" });
    });

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      sub: "expired-user",
      email: "expired@example.com",
      exp: Math.floor(Date.now() / 1000) - 100, // expired 100s ago
    })).toString("base64url");
    const signature = crypto.createHmac("sha256", testSecret).update(`${header}.${payload}`).digest("base64url");
    const token = `${header}.${payload}.${signature}`;

    const result = await verifyAccessToken(token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid");
    expect(fetchCount).toBe(0);

    delete process.env.SUPABASE_JWT_SECRET;
  });
});
