import { describe, it, expect, vi, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { searchUsers, setAccountStatus, hardDeleteUser, DeleteConfirmationMismatchError } = await import("../userAdmin");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response;
}

describe("searchUsers", () => {
  it("returns nothing for a too-short query, without making any request", async () => {
    global.fetch = vi.fn(() => {
      throw new Error("must not be called");
    }) as unknown as typeof fetch;
    expect(await searchUsers("a")).toEqual([]);
  });

  it("matches on username/full name via profiles", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/rest/v1/profiles")) {
        return Promise.resolve(jsonResponse(200, [{ id: "u1", username: "alice", full_name: "Alice A", account_status: "active" }]));
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const results = await searchUsers("alice");
    expect(results).toEqual([{ userId: "u1", email: null, username: "alice", fullName: "Alice A", accountStatus: "active" }]);
  });

  it("matches on email via GoTrue's admin user list when the query looks like an email", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/rest/v1/profiles")) return Promise.resolve(jsonResponse(200, []));
      if (url.includes("/auth/v1/admin/users")) {
        return Promise.resolve(
          jsonResponse(200, { users: [{ id: "u2", email: "bob@example.com" }, { id: "u3", email: "someone-else@example.com" }] })
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const results = await searchUsers("bob@example.com");
    expect(results).toEqual([{ userId: "u2", email: "bob@example.com", username: null, fullName: null, accountStatus: null }]);
  });

  it("merges a profile match and an email match for the same user id", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/rest/v1/profiles")) {
        return Promise.resolve(jsonResponse(200, [{ id: "u1", username: "alice", full_name: "Alice A", account_status: "active" }]));
      }
      if (url.includes("/auth/v1/admin/users")) {
        return Promise.resolve(jsonResponse(200, { users: [{ id: "u1", email: "alice@example.com" }] }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const results = await searchUsers("alice@example.com");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ userId: "u1", email: "alice@example.com", username: "alice" });
  });

  it("does not throw if the GoTrue admin list call fails — profile matches still come back", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/rest/v1/profiles")) {
        return Promise.resolve(jsonResponse(200, [{ id: "u1", username: "alice", full_name: "Alice A", account_status: "active" }]));
      }
      throw new Error("GoTrue unreachable");
    }) as unknown as typeof fetch;

    const results = await searchUsers("alice@example.com");
    expect(results).toEqual([{ userId: "u1", email: null, username: "alice", fullName: "Alice A", accountStatus: "active" }]);
  });
});

describe("setAccountStatus", () => {
  it("writes profiles.account_status and an audit log entry", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, method: (init?.method ?? "GET").toUpperCase(), body: init?.body ? JSON.parse(init.body as string) : null });
      return Promise.resolve(jsonResponse(200, []));
    }) as unknown as typeof fetch;

    await setAccountStatus("u1", "suspended", "admin-1", "abuse report");

    const profileWrite = calls.find((c) => c.url.includes("/rest/v1/profiles") && c.method === "PATCH");
    expect(profileWrite?.body).toMatchObject({ account_status: "suspended" });
    const audit = calls.find((c) => c.url.includes("/rest/v1/admin_audit_log"));
    expect(audit?.body).toMatchObject({ admin_id: "admin-1", action: "suspend_user", target_id: "u1" });
  });

  it("logs restore_user, not suspend_user, when restoring", async () => {
    const calls: { url: string; body: unknown }[] = [];
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
      return Promise.resolve(jsonResponse(200, []));
    }) as unknown as typeof fetch;

    await setAccountStatus("u1", "active", "admin-1");

    const audit = calls.find((c) => c.url.includes("/rest/v1/admin_audit_log"));
    expect(audit?.body).toMatchObject({ action: "restore_user" });
  });
});

describe("hardDeleteUser", () => {
  it("deletes the account when confirmEmail matches the account's real email (case-insensitively)", async () => {
    const calls: { url: string; method: string }[] = [];
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });
      if (url.includes("/auth/v1/admin/users/u1") && method === "GET") {
        return Promise.resolve(jsonResponse(200, { id: "u1", email: "Alice@Example.com" }));
      }
      if (url.includes("/auth/v1/admin/users/u1") && method === "DELETE") {
        return Promise.resolve(jsonResponse(200, {}));
      }
      if (url.includes("/rest/v1/admin_audit_log")) return Promise.resolve(jsonResponse(200, []));
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await hardDeleteUser("u1", "alice@example.com", "admin-1");

    expect(calls.some((c) => c.url.includes("/auth/v1/admin/users/u1") && c.method === "DELETE")).toBe(true);
  });

  it("rejects with DeleteConfirmationMismatchError and never calls DELETE when the email doesn't match", async () => {
    let deleteWasCalled = false;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/auth/v1/admin/users/u1") && method === "GET") {
        return Promise.resolve(jsonResponse(200, { id: "u1", email: "alice@example.com" }));
      }
      if (method === "DELETE") deleteWasCalled = true;
      return Promise.resolve(jsonResponse(200, {}));
    }) as unknown as typeof fetch;

    await expect(hardDeleteUser("u1", "wrong@example.com", "admin-1")).rejects.toBeInstanceOf(DeleteConfirmationMismatchError);
    expect(deleteWasCalled).toBe(false);
  });

  it("throws (and never deletes) when the account can't be looked up at all", async () => {
    let deleteWasCalled = false;
    global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET").toUpperCase() === "DELETE") deleteWasCalled = true;
      return Promise.resolve(jsonResponse(404, { message: "not found" }));
    }) as unknown as typeof fetch;

    await expect(hardDeleteUser("u1", "alice@example.com", "admin-1")).rejects.toThrow();
    expect(deleteWasCalled).toBe(false);
  });
});
