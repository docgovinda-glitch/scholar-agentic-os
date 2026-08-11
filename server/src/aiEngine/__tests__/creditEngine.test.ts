import { describe, it, expect, vi, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { deductCredits, grantCredits } = await import("../creditEngine");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(result: unknown) {
  let capturedUrl = "";
  let capturedBody: any = null;
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = typeof input === "string" ? input : input.toString();
    capturedBody = init?.body ? JSON.parse(init.body as string) : null;
    return Promise.resolve({ ok: true, status: 200, json: async () => result } as Response);
  }) as unknown as typeof fetch;
  return { getUrl: () => capturedUrl, getBody: () => capturedBody };
}

describe("deductCredits", () => {
  it("calls the deduct_credits RPC with the exact expected shape", async () => {
    const spy = mockFetch("ok");
    const result = await deductCredits("u1", 30, 200, 5000, "usage", "req-1", "generation");

    expect(result).toBe("ok");
    expect(spy.getUrl()).toContain("/rest/v1/rpc/deduct_credits");
    expect(spy.getBody()).toEqual({
      p_user_id: "u1",
      p_amount: 30,
      p_daily_limit: 200,
      p_monthly_limit: 5000,
      p_reason: "usage",
      p_request_id: "req-1",
      p_note: "generation",
      p_weekly_limit: null,
    });
  });

  it("forwards a weekly limit when one is passed", async () => {
    const spy = mockFetch("ok");
    await deductCredits("u1", 30, 200, 5000, "usage", "req-1", "generation", 1000);
    expect(spy.getBody()).toMatchObject({ p_weekly_limit: 1000 });
  });

  it("propagates daily_limit_exceeded / weekly_limit_exceeded / insufficient_balance as the return value, not an exception", async () => {
    mockFetch("daily_limit_exceeded");
    expect(await deductCredits("u1", 30, 10, null, "usage", "req-1")).toBe("daily_limit_exceeded");

    mockFetch("weekly_limit_exceeded");
    expect(await deductCredits("u1", 30, null, null, "usage", "req-1", undefined, 10)).toBe("weekly_limit_exceeded");
  });

  it("throws on a genuine RPC failure (5xx, misconfiguration)", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, text: async () => "boom" } as Response)) as unknown as typeof fetch;
    await expect(deductCredits("u1", 30, null, null, "usage", "req-1")).rejects.toThrow();
  });
});

describe("grantCredits", () => {
  it("calls the grant_credits RPC with the exact expected shape", async () => {
    const spy = mockFetch(null);
    await grantCredits("u1", 500, "admin_grant", "welcome bonus");

    expect(spy.getUrl()).toContain("/rest/v1/rpc/grant_credits");
    expect(spy.getBody()).toEqual({ p_user_id: "u1", p_amount: 500, p_reason: "admin_grant", p_note: "welcome bonus" });
  });
});
