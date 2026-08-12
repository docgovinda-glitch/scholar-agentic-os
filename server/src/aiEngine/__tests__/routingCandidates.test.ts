import { describe, it, expect, vi, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { assembleRoutingCandidates } = await import("../routingCandidates");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(byTable: Record<string, unknown[]>) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = Object.keys(byTable).find((t) => url.includes(`/rest/v1/${t}`));
    const body = match ? byTable[match] : [];
    return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) } as Response);
  }) as unknown as typeof fetch;
}

describe("assembleRoutingCandidates", () => {
  it("includes connected Local/Free/BYOK connections as candidates", async () => {
    mockFetch({
      user_ai_connections: [
        { provider_id: "gemini", tier: "free" },
        { provider_id: "openai", tier: "byok" },
      ],
      user_entitlements: [],
      provider_health: [],
      ai_providers: [],
    });

    const { candidates, premiumQuotaRemaining } = await assembleRoutingCandidates("u1");
    expect(candidates).toEqual([
      { tier: "free", providerId: "gemini", eligible: true, health: "unknown" },
      { tier: "byok", providerId: "openai", eligible: true, health: "unknown" },
    ]);
    expect(premiumQuotaRemaining).toBeNull();
  });

  it("adds a Premium candidate per REAL active platform credential, not a placeholder id, only when entitlement is active", async () => {
    mockFetch({
      user_ai_connections: [],
      user_entitlements: [{ user_id: "u1", plan_id: "premium_basic", status: "active", start_date: null, expiry: null }],
      provider_health: [{ provider_id: "gemini", status: "healthy" }],
      platform_provider_credentials: [{ provider_id: "gemini", status: "active" }],
      credit_balances: [{ balance: 250 }],
      premium_plans: [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 50, concurrency_limit: 2 }],
      user_quota_overrides: [],
      // premium_enabled is the admin's opt-in to spend Scholar's own
      // credential on this provider; without it a stored key is inert.
      ai_providers: [{ id: "gemini", metadata: {}, premium_enabled: true }],
    });

    const { candidates, premiumQuotaRemaining, entitlementActive, quota } = await assembleRoutingCandidates("u1");
    expect(candidates).toEqual([{ tier: "premium", providerId: "gemini", eligible: true, health: "healthy", modelId: undefined }]);
    expect(premiumQuotaRemaining).toBe(250);
    expect(entitlementActive).toBe(true);
    expect(quota?.dailyCredits).toBe(200);
  });

  it("ignores an active platform credential whose provider the admin has not opted in to Premium", async () => {
    mockFetch({
      user_ai_connections: [],
      user_entitlements: [{ user_id: "u1", plan_id: "premium_basic", status: "active", start_date: null, expiry: null }],
      provider_health: [{ provider_id: "gemini", status: "healthy" }],
      platform_provider_credentials: [{ provider_id: "gemini", status: "active" }],
      credit_balances: [{ balance: 250 }],
      premium_plans: [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 50, concurrency_limit: 2 }],
      user_quota_overrides: [],
      ai_providers: [{ id: "gemini", metadata: {} }],
    });

    const { candidates } = await assembleRoutingCandidates("u1");
    expect(candidates).toEqual([]);
  });

  it("passes the admin's chosen Premium model through as the candidate's modelId", async () => {
    mockFetch({
      user_ai_connections: [],
      user_entitlements: [{ user_id: "u1", plan_id: "premium_basic", status: "active", start_date: null, expiry: null }],
      provider_health: [{ provider_id: "gemini", status: "healthy" }],
      platform_provider_credentials: [{ provider_id: "gemini", status: "active" }],
      credit_balances: [{ balance: 250 }],
      premium_plans: [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 50, concurrency_limit: 2 }],
      user_quota_overrides: [],
      ai_providers: [{ id: "gemini", metadata: {}, premium_enabled: true, premium_models: ["gemini-2.5-pro"] }],
    });

    const { candidates } = await assembleRoutingCandidates("u1");
    expect(candidates[0].modelId).toBe("gemini-2.5-pro");
  });

  it("adds no Premium candidate at all when the user has no entitlement, even if platform credentials exist", async () => {
    mockFetch({
      user_ai_connections: [],
      user_entitlements: [],
      provider_health: [],
      ai_providers: [],
    });

    const { candidates, premiumQuotaRemaining } = await assembleRoutingCandidates("u1");
    expect(candidates).toEqual([]);
    expect(premiumQuotaRemaining).toBeNull();
  });

  it("adds no Premium candidate when entitled but no platform credential is configured for any provider", async () => {
    mockFetch({
      user_ai_connections: [],
      user_entitlements: [{ user_id: "u1", plan_id: "premium_basic", status: "active", start_date: null, expiry: null }],
      provider_health: [],
      platform_provider_credentials: [],
      credit_balances: [{ balance: 100 }],
      premium_plans: [],
      user_quota_overrides: [],
      ai_providers: [],
    });

    const { candidates } = await assembleRoutingCandidates("u1");
    expect(candidates).toEqual([]);
  });

  it("builds defaultModelByProvider from ai_providers metadata", async () => {
    mockFetch({
      user_ai_connections: [],
      user_entitlements: [],
      provider_health: [],
      ai_providers: [{ id: "gemini", metadata: { defaultModel: "gemini-2.5-flash" } }],
    });

    const { defaultModelByProvider } = await assembleRoutingCandidates("u1");
    expect(defaultModelByProvider.get("gemini")).toBe("gemini-2.5-flash");
  });
});
