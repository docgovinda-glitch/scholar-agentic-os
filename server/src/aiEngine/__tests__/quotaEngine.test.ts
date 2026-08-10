import { describe, it, expect, vi, afterEach } from "vitest";
import { checkPerTaskLimit, type QuotaLimits } from "../quotaEngine";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { getEffectiveQuota } = await import("../quotaEngine");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(byUrl: Record<string, unknown[]>) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = Object.keys(byUrl).find((k) => url.includes(k));
    const body = match ? byUrl[match] : [];
    return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) } as Response);
  }) as unknown as typeof fetch;
}

describe("getEffectiveQuota", () => {
  it("uses plan defaults when there is no override", async () => {
    mockFetch({
      premium_plans: [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 50, concurrency_limit: 2 }],
      user_quota_overrides: [],
    });

    const limits = await getEffectiveQuota("u1", "premium_basic");
    expect(limits).toEqual({ monthlyCredits: 5000, dailyCredits: 200, perTaskMaxCredits: 50, concurrencyLimit: 2 });
  });

  it("overrides individual fields without discarding the plan's other defaults", async () => {
    mockFetch({
      premium_plans: [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 50, concurrency_limit: 2 }],
      // Admin raised only the per-task cap for this user.
      user_quota_overrides: [{ user_id: "u1", monthly_credits: null, daily_credits: null, per_task_max_credits: 500, concurrency_limit: null }],
    });

    const limits = await getEffectiveQuota("u1", "premium_basic");
    expect(limits).toEqual({ monthlyCredits: 5000, dailyCredits: 200, perTaskMaxCredits: 500, concurrencyLimit: 2 });
  });

  it("defaults concurrency to 1 when neither plan nor override has one", async () => {
    mockFetch({ premium_plans: [], user_quota_overrides: [] });
    const limits = await getEffectiveQuota("u1", null);
    expect(limits.concurrencyLimit).toBe(1);
  });
});

describe("checkPerTaskLimit", () => {
  const limits: QuotaLimits = { monthlyCredits: 5000, dailyCredits: 200, perTaskMaxCredits: 50, concurrencyLimit: 2 };

  it("allows a task at or under the cap", () => {
    expect(checkPerTaskLimit(50, limits).allowed).toBe(true);
  });

  it("blocks a task over the cap, with a reason", () => {
    const result = checkPerTaskLimit(51, limits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/50-credit per-task limit/);
  });

  it("allows anything when there is no per-task cap", () => {
    expect(checkPerTaskLimit(999999, { ...limits, perTaskMaxCredits: null }).allowed).toBe(true);
  });
});
