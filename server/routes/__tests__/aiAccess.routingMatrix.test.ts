/**
 * Priority 7's live routing test matrix, at the decision-preview layer:
 * POST /api/ai-access/route (server/routes/aiAccess.ts), which runs the
 * exact same assembleRoutingCandidates() + selectProvider() pipeline the
 * live generation path (server/routes/studio.ts) uses — see
 * routingCandidates.ts's module comment for why the two are built from one
 * shared assembler rather than two implementations that could drift apart.
 *
 * Scenarios that require actually executing a generation (quota deduction,
 * provider fallback on failure, invalid credentials, no-deduct-on-failure,
 * forcing Premium without entitlement, concurrent double-spend) are covered
 * in studio.premium.test.ts instead, against the real refine() pipeline.
 * Together the two files are this project's Priority 7 matrix:
 *
 *   1. single free provider                    → this file
 *   2. two free providers (health ranking)      → this file
 *   3. local + free                             → this file
 *   4. BYOK + free                              → this file
 *   5. Premium available                        → this file
 *   6. non-Premium unavailable                  → this file
 *   7. quota available, deducts                 → studio.premium.test.ts
 *   8. quota exhausted, falls back               → this file + studio.premium.test.ts
 *   9. provider unavailable, falls back           → studio.premium.test.ts
 *  10. invalid credential                        → studio.premium.test.ts
 *  11. provider removed                          → this file
 *  12. cross-user isolation                      → this file
 *  13. quota/entitlement tampering ignored        → this file
 *  14. forced Premium without entitlement         → studio.premium.test.ts
 *  15. failed generation, no deduction            → studio.premium.test.ts
 *  16. concurrent double-spend prevention         → studio.premium.test.ts
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const realFetch = global.fetch;

interface DbState {
  users: Record<string, { id: string; email: string }>;
  entitlements: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  health: Array<Record<string, unknown>>;
  platformCredentials: Array<Record<string, unknown>>;
  providers: Array<Record<string, unknown>>;
  balances: Array<Record<string, unknown>>;
  plans: Array<Record<string, unknown>>;
  overrides: Array<Record<string, unknown>>;
}

function emptyDb(): DbState {
  return { users: {}, entitlements: [], connections: [], health: [], platformCredentials: [], providers: [], balances: [], plans: [], overrides: [] };
}

function respondJson(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body } as Response);
}

function mockFetch(db: DbState) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/auth/v1/user")) {
      const token = (init?.headers as Record<string, string> | undefined)?.Authorization?.replace("Bearer ", "");
      const user = token ? db.users[token] : undefined;
      return user ? respondJson(user, 200) : respondJson({}, 401);
    }

    const userIdMatch = /user_id=eq\.([^&]+)/.exec(url);
    const uid = userIdMatch ? decodeURIComponent(userIdMatch[1]) : undefined;

    if (url.includes("/rest/v1/user_entitlements")) return respondJson(db.entitlements.filter((r) => r.user_id === uid));
    if (url.includes("/rest/v1/user_ai_connections")) return respondJson(db.connections.filter((r) => r.user_id === uid && r.status === "connected"));
    if (url.includes("/rest/v1/provider_health")) return respondJson(db.health);
    if (url.includes("/rest/v1/platform_provider_credentials")) return respondJson(db.platformCredentials.filter((r) => r.status === "active"));
    if (url.includes("/rest/v1/ai_providers")) return respondJson(db.providers);
    if (url.includes("/rest/v1/credit_balances")) return respondJson(db.balances.filter((r) => r.user_id === uid));
    if (url.includes("/rest/v1/premium_plans")) return respondJson(db.plans);
    if (url.includes("/rest/v1/user_quota_overrides")) return respondJson(db.overrides.filter((r) => r.user_id === uid));

    return respondJson({}, 500);
  }) as unknown as typeof fetch;
}

async function buildApp() {
  const { registerAiAccessRoutes } = await import("../aiAccess");
  const app = express();
  registerAiAccessRoutes(app);
  return app;
}

function route(app: express.Express, token: string, taskType: string, extra: Record<string, unknown> = {}) {
  return request(app).post("/api/ai-access/route").set("Authorization", `Bearer ${token}`).send({ taskType, ...extra });
}

const ACTIVE_ENTITLEMENT = (userId: string) => ({ user_id: userId, plan_id: "premium_basic", status: "active", start_date: null, expiry: null });
const PLAN = [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 50, concurrency_limit: 2 }];

beforeEach(() => {
  vi.resetModules();
});

describe("POST /api/ai-access/route — routing matrix", () => {
  it("1. routes to the user's single connected free provider", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    db.connections = [{ user_id: ALICE, provider_id: "gemini", tier: "free", status: "connected" }];
    mockFetch(db);

    const res = await route(await buildApp(), "alice-token", "reasoning");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, choice: { tier: "free", providerId: "gemini" }, fallbacks: [] });
  });

  it("2. with two free providers, ranks by health and lists the other as a fallback", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    db.connections = [
      { user_id: ALICE, provider_id: "gemini", tier: "free", status: "connected" },
      { user_id: ALICE, provider_id: "groq", tier: "free", status: "connected" },
    ];
    db.health = [
      { provider_id: "gemini", status: "degraded" },
      { provider_id: "groq", status: "healthy" },
    ];
    mockFetch(db);

    const res = await route(await buildApp(), "alice-token", "reasoning");
    expect(res.status).toBe(200);
    expect(res.body.choice.providerId).toBe("groq");
    expect(res.body.fallbacks.map((f: { providerId: string }) => f.providerId)).toEqual(["gemini"]);
  });

  it("3. with local + free connected, tier order (not connection order) decides which comes first", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    db.connections = [
      { user_id: ALICE, provider_id: "ollama", tier: "local", status: "connected" },
      { user_id: ALICE, provider_id: "gemini", tier: "free", status: "connected" },
    ];
    mockFetch(db);
    const app = await buildApp();

    const simple = await route(app, "alice-token", "simple");
    expect(simple.body.choice).toMatchObject({ tier: "local", providerId: "ollama" });

    const reasoning = await route(app, "alice-token", "reasoning");
    expect(reasoning.body.choice).toMatchObject({ tier: "free", providerId: "gemini" });
  });

  it("4. with BYOK + free connected, free is preferred and BYOK is the fallback", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    db.connections = [
      { user_id: ALICE, provider_id: "openai", tier: "byok", status: "connected" },
      { user_id: ALICE, provider_id: "gemini", tier: "free", status: "connected" },
    ];
    mockFetch(db);

    const res = await route(await buildApp(), "alice-token", "reasoning");
    expect(res.body.choice).toMatchObject({ tier: "free", providerId: "gemini" });
    expect(res.body.fallbacks).toEqual([expect.objectContaining({ tier: "byok", providerId: "openai" })]);
  });

  it("5. Premium is available and routable when entitled, with quota, and a real platform credential is configured", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    db.entitlements = [ACTIVE_ENTITLEMENT(ALICE)];
    db.balances = [{ user_id: ALICE, balance: 500 }];
    db.plans = PLAN;
    db.platformCredentials = [{ provider_id: "openai", status: "active" }];
    mockFetch(db);

    const res = await route(await buildApp(), "alice-token", "reasoning");
    expect(res.status).toBe(200);
    // The real admin-configured provider id, never the old "scholar-premium-pool" placeholder.
    expect(res.body.choice).toMatchObject({ tier: "premium", providerId: "openai" });
  });

  it("6. Premium never appears as a candidate for a user with no entitlement, even when platform credentials exist", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    db.entitlements = []; // no entitlement row at all
    db.platformCredentials = [{ provider_id: "openai", status: "active" }];
    mockFetch(db);

    const res = await route(await buildApp(), "alice-token", "reasoning");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.reasoning).toMatch(/connect a provider/i);
  });

  it("8. falls back from Premium to a connected free provider when this period's quota is exhausted", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    db.entitlements = [ACTIVE_ENTITLEMENT(ALICE)];
    db.balances = [{ user_id: ALICE, balance: 0 }]; // exhausted
    db.plans = PLAN;
    db.platformCredentials = [{ provider_id: "openai", status: "active" }];
    db.connections = [{ user_id: ALICE, provider_id: "gemini", tier: "free", status: "connected" }];
    mockFetch(db);

    const res = await route(await buildApp(), "alice-token", "reasoning");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.choice).toMatchObject({ tier: "free", providerId: "gemini" });
  });

  it("11. a removed connection no longer appears as a candidate or a fallback", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    // Only "groq" remains connected — "gemini" was removed (DELETE /connections/gemini),
    // so it is simply absent here, exactly as the real table would be after that call.
    db.connections = [{ user_id: ALICE, provider_id: "groq", tier: "free", status: "connected" }];
    mockFetch(db);

    const res = await route(await buildApp(), "alice-token", "reasoning");
    expect(res.body.choice.providerId).toBe("groq");
    expect(res.body.fallbacks).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("gemini");
  });

  it("12. cross-user isolation: each user's decision reflects only their own connections and entitlement", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    db.users["bob-token"] = { id: BOB, email: "bob@example.com" };
    db.connections = [
      { user_id: ALICE, provider_id: "gemini", tier: "free", status: "connected" },
      { user_id: BOB, provider_id: "groq", tier: "free", status: "connected" },
    ];
    db.entitlements = [ACTIVE_ENTITLEMENT(BOB)]; // only Bob is Premium
    db.balances = [{ user_id: BOB, balance: 500 }];
    db.plans = PLAN;
    db.platformCredentials = [{ provider_id: "openai", status: "active" }];
    mockFetch(db);
    const app = await buildApp();

    const aliceDecision = await route(app, "alice-token", "reasoning");
    expect(aliceDecision.body.choice).toMatchObject({ tier: "free", providerId: "gemini" });
    // Alice must never see Bob's Premium entitlement or provider.
    expect(JSON.stringify(aliceDecision.body)).not.toContain("groq");
    expect(JSON.stringify(aliceDecision.body)).not.toMatch(/premium/);

    const bobDecision = await route(app, "bob-token", "reasoning");
    expect(bobDecision.body.choice).toMatchObject({ tier: "free", providerId: "groq" });
    expect(JSON.stringify(bobDecision.body)).not.toContain("gemini");
  });

  it("13. a client claiming its own quota/entitlement in the request body is ignored — the decision only reflects the database", async () => {
    const db = emptyDb();
    db.users["alice-token"] = { id: ALICE, email: "alice@example.com" };
    db.entitlements = []; // genuinely not entitled
    mockFetch(db);

    const res = await route(await buildApp(), "alice-token", "reasoning", {
      // None of these are read by the handler (it destructures only
      // taskType/privacyPreference) — sent to pin that a spoofed body can't
      // manufacture Premium eligibility.
      premiumQuotaRemaining: 999999,
      entitlement: { status: "active", active: true },
      userId: BOB,
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/premium/i);
  });

  it("requires a real, verified session — no anonymous routing decisions", async () => {
    const db = emptyDb();
    mockFetch(db);
    const res = await request(await buildApp()).post("/api/ai-access/route").send({ taskType: "reasoning" });
    expect(res.status).toBe(401);
  });
});

describe("cleanup", () => {
  it("restores the real fetch", () => {
    global.fetch = realFetch;
    expect(true).toBe(true);
  });
});
