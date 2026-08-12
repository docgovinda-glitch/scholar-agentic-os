/**
 * The two-router architecture, pinned as behaviour rather than convention.
 *
 * These are the guarantees the platform owner asked for, and each is the kind
 * that erodes quietly: a future change that let the admin router read a user's
 * connections, or that leaked a provider name into the Premium catalogue,
 * would still "work" and would still pass every other test in this suite.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { assembleUserCandidates, PREMIUM_PSEUDO_PROVIDER } = await import("../userRouter");
const { premiumCatalogueForUser, toPublicResources, resolvePremiumResources } = await import("../adminRouter");

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

const USER = "11111111-1111-4111-8111-111111111111";

interface Db {
  connections?: object[];
  entitlements?: object[];
  health?: object[];
  balances?: object[];
  plans?: object[];
  overrides?: object[];
  resources?: object[];
  planResources?: object[];
}

/** Records every table the code under test touched, so we can assert on absence. */
let touched: string[] = [];

function mockDb(db: Db) {
  touched = [];
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const table = /\/rest\/v1\/([a-z_]+)/.exec(url)?.[1];
    if (table) touched.push(table);

    const json = (body: unknown) =>
      Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body } as Response);

    if (url.includes("/rest/v1/user_ai_connections")) return json(db.connections ?? []);
    if (url.includes("/rest/v1/user_entitlements")) return json(db.entitlements ?? []);
    if (url.includes("/rest/v1/provider_health")) return json(db.health ?? []);
    if (url.includes("/rest/v1/credit_balances")) return json(db.balances ?? []);
    if (url.includes("/rest/v1/premium_plans")) return json(db.plans ?? []);
    if (url.includes("/rest/v1/user_quota_overrides")) return json(db.overrides ?? []);
    if (url.includes("/rest/v1/ai_resources")) return json(db.resources ?? []);
    if (url.includes("/rest/v1/plan_resources")) return json(db.planResources ?? []);
    return json([]);
  }) as unknown as typeof fetch;
}

const ENTITLED = [{ user_id: USER, plan_id: "premium_basic", status: "active", start_date: null, expiry: null }];
const PLAN = [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 50, concurrency_limit: 2 }];

function resource(id: string, providerId: string, label: string, modelId: string | null = null) {
  return {
    id,
    label,
    description: null,
    provider_id: providerId,
    model_id: modelId,
    access_type: "paid",
    capabilities: [],
    cost_per_1k_usd: null,
    enabled: true,
    credential_label: "default",
  };
}

describe("User AI Router — private, and always in the path", () => {
  it("routes through the router even when the user configured exactly one provider", async () => {
    mockDb({ connections: [{ user_id: USER, provider_id: "ollama", tier: "local" }] });
    const state = await assembleUserCandidates(USER);

    // One provider is still a routing decision, not a bypass: adding a second
    // later must change configuration only, never the execution path.
    expect(state.candidates).toEqual([{ tier: "local", providerId: "ollama", eligible: true, health: "unknown" }]);
  });

  it("carries every configured provider across tiers", async () => {
    mockDb({
      connections: [
        { user_id: USER, provider_id: "ollama", tier: "local" },
        { user_id: USER, provider_id: "groq", tier: "free" },
        { user_id: USER, provider_id: "openai", tier: "byok" },
      ],
    });
    const state = await assembleUserCandidates(USER);
    expect(state.candidates.map((c) => c.providerId).sort()).toEqual(["groq", "ollama", "openai"]);
  });

  it("never reads the admin's resource pool", async () => {
    mockDb({ connections: [{ user_id: USER, provider_id: "ollama", tier: "local" }] });
    await assembleUserCandidates(USER);

    // The user's router has no business knowing what the platform owns.
    expect(touched).not.toContain("ai_resources");
    expect(touched).not.toContain("plan_resources");
    expect(touched).not.toContain("platform_provider_credentials");
  });

  it("represents Premium as ONE opaque capability, never the providers behind it", async () => {
    mockDb({
      connections: [],
      entitlements: ENTITLED,
      balances: [{ balance: 500 }],
      plans: PLAN,
      resources: [resource("r1", "openai", "Advanced writing"), resource("r2", "gemini", "Fast drafting")],
      planResources: [{ plan_id: "premium_basic", resource_id: "r1" }],
    });
    const state = await assembleUserCandidates(USER);
    const premium = state.candidates.filter((c) => c.tier === "premium");

    expect(premium).toHaveLength(1);
    expect(premium[0].providerId).toBe(PREMIUM_PSEUDO_PROVIDER);
    expect(JSON.stringify(state.candidates)).not.toContain("openai");
    expect(JSON.stringify(state.candidates)).not.toContain("gemini");
  });
});

describe("Admin AI Router — the platform's own pool", () => {
  it("never reads any user's private provider configuration", async () => {
    mockDb({
      entitlements: ENTITLED,
      plans: PLAN,
      resources: [resource("r1", "openai", "Advanced writing")],
      planResources: [{ plan_id: "premium_basic", resource_id: "r1" }],
    });
    await resolvePremiumResources(USER, "reasoning");

    // Resolving what the PLATFORM will run must never involve looking at what
    // the user configured for themselves.
    expect(touched).not.toContain("user_ai_connections");
  });

  it("grants only the resources a plan was given — never the whole pool", async () => {
    mockDb({
      entitlements: ENTITLED,
      plans: PLAN,
      resources: [resource("r1", "openai", "Advanced writing"), resource("r2", "gemini", "Fast drafting")],
      planResources: [{ plan_id: "premium_basic", resource_id: "r2" }],
    });
    const resolved = await resolvePremiumResources(USER);

    expect(resolved.map((r) => r.id)).toEqual(["r2"]);
  });

  it("grants nothing to a plan with no resources, rather than defaulting to everything", async () => {
    mockDb({
      entitlements: ENTITLED,
      plans: PLAN,
      resources: [resource("r1", "openai", "Advanced writing")],
      planResources: [],
    });
    expect(await resolvePremiumResources(USER)).toEqual([]);
  });

  it("resolves nothing at all for a user with no entitlement", async () => {
    mockDb({
      entitlements: [],
      resources: [resource("r1", "openai", "Advanced writing")],
      planResources: [{ plan_id: "premium_basic", resource_id: "r1" }],
    });
    expect(await resolvePremiumResources(USER)).toEqual([]);
  });
});

describe("Provider-agnostic Premium", () => {
  it("strips provider, model, cost and credential from anything a subscriber sees", () => {
    const publicView = toPublicResources([resource("r1", "openai", "Advanced writing", "gpt-4o") as never]);

    expect(publicView).toEqual([{ id: "r1", label: "Advanced writing", description: null, capabilities: [] }]);
    const serialised = JSON.stringify(publicView);
    expect(serialised).not.toContain("openai");
    expect(serialised).not.toContain("gpt-4o");
    expect(serialised).not.toContain("credential");
  });

  it("keeps the subscriber's view identical when the admin re-points a capability to another provider", async () => {
    mockDb({
      entitlements: ENTITLED,
      plans: PLAN,
      resources: [resource("r1", "openai", "Advanced writing", "gpt-4o")],
      planResources: [{ plan_id: "premium_basic", resource_id: "r1" }],
    });
    const before = await premiumCatalogueForUser(USER);

    // Same resource id and label, different provider underneath — exactly what
    // an admin swapping providers does.
    mockDb({
      entitlements: ENTITLED,
      plans: PLAN,
      resources: [resource("r1", "anthropic", "Advanced writing", "claude-sonnet-4")],
      planResources: [{ plan_id: "premium_basic", resource_id: "r1" }],
    });
    const after = await premiumCatalogueForUser(USER);

    expect(after.resources).toEqual(before.resources);
  });

  it("tells a non-subscriber nothing about what Premium contains", async () => {
    mockDb({
      entitlements: [],
      resources: [resource("r1", "openai", "Advanced writing")],
      planResources: [{ plan_id: "premium_basic", resource_id: "r1" }],
    });
    const catalogue = await premiumCatalogueForUser(USER);

    expect(catalogue).toEqual({ active: false, planId: null, resources: [] });
  });
});
