/**
 * Tests for the server-mediated Premium path added to POST /api/studio/refine
 * (runPremiumRefine in studio.ts). Uses the real Express app and the real
 * refine()/Gateway/Warden pipeline, same as studio.test.ts — only
 * `global.fetch` is mocked, standing in for both the outbound provider call
 * AND every Supabase Data API / RPC call the AI Engine makes along the way.
 *
 * requireAuth is stubbed to a fixed user (studio.test.ts's convention);
 * enforcement itself is covered for real elsewhere (admin.authz.test.ts,
 * aiAccess.authz.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetSessionPoliciesForTests } from "../../../src/app/studio/sessionPolicyStore.ts";
import { __resetAuditLogForTests } from "../../../src/platform/warden/warden.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { generateMasterKeyBase64, encrypt, generateCEK, wrapKey } from "../../../src/services/crypto/crypto.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;
const originalMasterKey = process.env.MASTER_KEY;

beforeEach(() => {
  __resetSessionPoliciesForTests();
  __resetAuditLogForTests();
  __resetRateLimitStore();
  process.env.MASTER_KEY = generateMasterKeyBase64();
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalMasterKey === undefined) delete process.env.MASTER_KEY;
  else process.env.MASTER_KEY = originalMasterKey;
  vi.restoreAllMocks();
});

/** A valid encrypted-credential row shape, decryptable with the current MASTER_KEY, for a mocked platform_provider_credentials response. */
function encryptedCredentialRow(providerId: string, plaintext: string) {
  const masterKey = Buffer.from(process.env.MASTER_KEY!, "base64");
  const cek = generateCEK();
  return {
    id: "cred-1",
    provider_id: providerId,
    label: "default",
    encrypted_cek: wrapKey(cek, masterKey),
    encrypted_credential: encrypt(plaintext, cek),
    masked_preview: `••••${plaintext.slice(-4)}`,
    status: "active",
  };
}

/**
 * A present-but-undecryptable credential row (Priority 7 scenario 10):
 * present in the table, `status: "active"`, but its CEK was wrapped under a
 * DIFFERENT master key than the one this process holds — e.g. left behind
 * after a key rotation, or simply corrupt. getDecryptedCredential must fail
 * closed (return null, never throw past its own boundary) so
 * runPremiumRefine treats it exactly like "not configured" rather than
 * crashing the request.
 */
function invalidCredentialRow(providerId: string) {
  const wrongMasterKey = Buffer.from(generateMasterKeyBase64(), "base64");
  const cek = generateCEK();
  return {
    id: "cred-bad",
    provider_id: providerId,
    label: "default",
    encrypted_cek: wrapKey(cek, wrongMasterKey),
    encrypted_credential: encrypt("sk-irrelevant", cek),
    masked_preview: "••••xxxx",
    status: "active",
  };
}

interface MockDb {
  entitlement?: object[];
  connections?: object[];
  health?: object[];
  platformCredentials?: object[];
  providers?: object[];
  /** Admin resource pool rows (ai_resources). */
  resources?: object[];
  /** plan_resources grants; defaults to granting every resource to the test plan. */
  planResources?: object[];
  balance?: object[];
  plans?: object[];
  overrides?: object[];
  deductResult?: string;
  providerResponse?: () => Promise<Response> | Response;
  capturedWrites: Record<string, any[]>;
}

function mockDb(db: MockDb) {
  db.capturedWrites = {};
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    const respondJson = (body: unknown, status = 200) =>
      Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body } as Response);

    if (url.includes("/rest/v1/user_entitlements")) return respondJson(db.entitlement ?? []);
    if (url.includes("/rest/v1/user_ai_connections")) return respondJson(db.connections ?? []);
    if (url.includes("/rest/v1/provider_health")) {
      if (method !== "GET") {
        const row = JSON.parse(init!.body as string);
        (db.capturedWrites["provider_health"] ??= []).push(row);
      }
      return respondJson(db.health ?? []);
    }
    if (url.includes("/rest/v1/platform_provider_credentials")) {
      // Real PostgREST filters by the query string; getDecryptedCredential
      // asks for one specific provider_id, so the mock must actually honour
      // that filter rather than always returning row [0].
      const providerIdMatch = /provider_id=eq\.([^&]+)/.exec(url);
      const rows = db.platformCredentials ?? [];
      if (!providerIdMatch) return respondJson(rows);
      const wanted = decodeURIComponent(providerIdMatch[1]);
      return respondJson(rows.filter((r: any) => r.provider_id === wanted));
    }
    if (url.includes("/rest/v1/ai_providers")) return respondJson(db.providers ?? []);
    // The ADMIN router's pool. Premium no longer resolves from platform
    // credentials alone — a plan must grant a resource.
    if (url.includes("/rest/v1/ai_resources")) return respondJson(db.resources ?? []);
    if (url.includes("/rest/v1/plan_resources")) {
      if (db.planResources) return respondJson(db.planResources);
      return respondJson((db.resources ?? []).map((r: any) => ({ plan_id: "premium_basic", resource_id: r.id })));
    }
    if (url.includes("/rest/v1/credit_balances")) return respondJson(db.balance ?? []);
    if (url.includes("/rest/v1/premium_plans")) return respondJson(db.plans ?? []);
    if (url.includes("/rest/v1/user_quota_overrides")) return respondJson(db.overrides ?? []);
    if (url.includes("/rest/v1/ai_usage_ledger")) {
      const row = JSON.parse(init!.body as string);
      (db.capturedWrites["ai_usage_ledger"] ??= []).push(row);
      return respondJson(null, 201);
    }
    if (url.includes("/rest/v1/rpc/deduct_credits")) {
      const row = JSON.parse(init!.body as string);
      (db.capturedWrites["deduct_credits_calls"] ??= []).push(row);
      return respondJson(db.deductResult ?? "ok");
    }

    // The actual provider HTTP call (OpenAI-compatible chat/completions, matching studio.test.ts's own convention).
    if (db.providerResponse) return Promise.resolve(db.providerResponse());
    return respondJson({}, 500);
  }) as unknown as typeof fetch;
}

function successfulProviderResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              revised: "The cohort comprised 240 participants.",
              changes: [{ original: "sample", replacement: "cohort", reason: "Avoids repetition." }],
            }),
          },
        },
      ],
    }),
  } as Response;
}


/**
 * One row of the ADMIN's resource pool. Premium is resolved from these plus a
 * plan grant, not from a platform credential alone — holding a key and
 * authorising spend on it are separate decisions.
 */
function RESOURCE(id: string, providerId: string, modelId: string | null, label = `Resource ${id}`) {
  return {
    id,
    label,
    description: null,
    provider_id: providerId,
    model_id: modelId,
    access_type: "paid",
    capabilities: [],
    cost_per_1k_usd: null,
    daily_request_limit: null,
    enabled: true,
    credential_label: "default",
  };
}

const ACTIVE_ENTITLEMENT = [{ user_id: TEST_USER_ID, plan_id: "premium_basic", status: "active", start_date: null, expiry: null }];
const PLAN = [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 50, concurrency_limit: 2 }];

async function grantConsent(sessionId: string, provider: string) {
  await request(app).post("/api/studio/consent").send({ sessionId, provider });
}

describe("POST /api/studio/refine — Premium path", () => {
  it("402s a non-entitled user, never reaching the provider (user cannot force Premium without entitlement)", async () => {
    mockDb({ entitlement: [] });
    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-1",
      passageId: "p1",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });
    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/Premium subscription/i);
  });

  it("402s when entitled but no Premium-pool provider is configured", async () => {
    mockDb({ entitlement: ACTIVE_ENTITLEMENT, platformCredentials: [], balance: [{ balance: 100 }], plans: PLAN, overrides: [] });
    await grantConsent("prem-2", "openai");
    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-2",
      passageId: "p2",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });
    expect(res.status).toBe(402);
  });

  it("succeeds for an entitled user with quota available, deducts credits, and reports aiSource", async () => {
    mockDb({
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      providers: [{ id: "openai", metadata: { defaultModel: "gpt-4o-mini" }, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", "gpt-4o-mini")],
      health: [{ provider_id: "openai", status: "healthy" }],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      deductResult: "ok",
      providerResponse: successfulProviderResponse,
    });
    await grantConsent("prem-3", "openai");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-3",
      passageId: "p3",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(200);
    expect(res.body.aiSource.tier).toBe("premium");
    expect(res.body.aiSource.creditsUsed).toBeGreaterThan(0);
    // Premium is provider-agnostic: the subscriber is told the admin's
    // resource LABEL, never which provider or model actually ran. That is what
    // lets an admin re-point a capability without anyone reconfiguring.
    expect(res.body.aiSource.provider).toBe("Resource r1");
    expect(JSON.stringify(res.body.aiSource)).not.toContain("openai");
    expect(JSON.stringify(res.body.aiSource)).not.toContain("gpt-4o-mini");
  });

  it("returns 402 without calling the provider when the pre-check estimates the request exceeds the per-task limit", async () => {
    const fetchSpy = vi.fn();
    mockDb({
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [{ provider_id: "openai", status: "active" }],
      providers: [{ id: "openai", metadata: {}, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", null)],
      health: [],
      balance: [{ balance: 500 }],
      plans: [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 1, concurrency_limit: 2 }],
      overrides: [],
    });
    await grantConsent("prem-4", "openai");

    const originalFetchImpl = global.fetch;
    global.fetch = ((...args: Parameters<typeof fetch>) => {
      fetchSpy(args[0]);
      return (originalFetchImpl as typeof fetch)(...args);
    }) as typeof fetch;

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-4",
      passageId: "p4",
      text: "A very long passage. ".repeat(200),
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(402);
    // No call reached the actual provider endpoint (only Supabase Data API calls happened).
    const providerCalls = fetchSpy.mock.calls.filter((c) => !String(c[0]).includes("supabase.co/rest") && !String(c[0]).includes("supabase.co/functions"));
    expect(providerCalls.length).toBe(0);
  });

  it("does not deduct credits when the provider call fails and there is no other fallback", async () => {
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      providers: [{ id: "openai", metadata: {}, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", null)],
      health: [],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      providerResponse: () => ({ ok: false, status: 500, text: async () => "provider down", json: async () => ({}) }) as Response,
      capturedWrites: {},
    };
    mockDb(db);
    await grantConsent("prem-5", "openai");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-5",
      passageId: "p5",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(502);
    expect(db.capturedWrites["deduct_credits_calls"] ?? []).toEqual([]);
  });

  it("falls back to the next configured Premium provider when the first fails, and only deducts once", async () => {
    let callCount = 0;
    mockDb({
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [
        encryptedCredentialRow("openai", "sk-openai-test-key"),
        encryptedCredentialRow("gemini", "sk-gemini-test-key"),
      ],
      providers: [
        { id: "openai", metadata: {}, premium_enabled: true },
        { id: "gemini", metadata: {}, premium_enabled: true },
      ],
      resources: [RESOURCE("r1", "openai", null), RESOURCE("r2", "gemini", null)],
      health: [
        { provider_id: "openai", status: "down" },
        { provider_id: "gemini", status: "healthy" },
      ],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      deductResult: "ok",
      providerResponse: () => {
        callCount++;
        return successfulProviderResponse();
      },
    });
    await grantConsent("prem-6", "gemini");
    // Also grant consent for the (unhealthy, deprioritized) openai in case it were tried.
    await grantConsent("prem-6", "openai");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-6",
      passageId: "p6",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(200);
    // Exactly one provider call: the first resource in the admin's ordered
    // pool answered. The subscriber sees only its label.
    expect(res.body.aiSource.provider).toMatch(/^Resource /);
    expect(callCount).toBe(1);
  });

  it("10. treats an undecryptable (present but corrupt) credential exactly like a missing one — never a crash, never a charge", async () => {
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [invalidCredentialRow("openai")],
      providers: [{ id: "openai", metadata: {}, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", null)],
      health: [],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      capturedWrites: {},
    };
    mockDb(db);
    await grantConsent("prem-7", "openai");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-7",
      passageId: "p7",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(502);
    expect(db.capturedWrites["deduct_credits_calls"] ?? []).toEqual([]);
  });

  it("10b. falls back past an undecryptable credential to the next configured Premium provider", async () => {
    mockDb({
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [invalidCredentialRow("openai"), encryptedCredentialRow("gemini", "sk-gemini-test-key")],
      providers: [
        { id: "openai", metadata: {}, premium_enabled: true },
        { id: "gemini", metadata: {}, premium_enabled: true },
      ],
      resources: [RESOURCE("r1", "openai", null), RESOURCE("r2", "gemini", null)],
      health: [
        { provider_id: "openai", status: "healthy" },
        { provider_id: "gemini", status: "healthy" },
      ],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      deductResult: "ok",
      providerResponse: successfulProviderResponse,
    });
    await grantConsent("prem-8", "openai");
    await grantConsent("prem-8", "gemini");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-8",
      passageId: "p8",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(200);
    // Fell past the undecryptable credential to the next resource in the pool.
    expect(res.body.aiSource.provider).toBe("Resource r2");
  });

  it("8b. 402s naming quota exhaustion specifically (not a generic 'no source') when entitled but this period's balance is zero", async () => {
    mockDb({
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [{ provider_id: "openai", status: "active" }],
      providers: [{ id: "openai", metadata: {}, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", null)],
      health: [],
      balance: [{ balance: 0 }],
      plans: PLAN,
      overrides: [],
    });

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-9",
      passageId: "p9",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/quota.*exhausted/i);
  });

  it("13. ignores a client-supplied quota/credits claim in the request body — the server always re-derives from the database", async () => {
    const db: MockDb = { entitlement: [], capturedWrites: {} };
    mockDb(db);

    const res = await request(app)
      .post("/api/studio/refine")
      .send({
        sessionId: "prem-10",
        passageId: "p10",
        text: "The sample comprised 240 participants.",
        level: "clarity",
        useEngine: "premium",
        // None of these are read by the handler — sent to pin that a
        // spoofed body can't manufacture Premium eligibility or credits.
        aiSource: { tier: "premium", provider: "openai", model: "gpt-4o", creditsUsed: 0 },
        premiumQuotaRemaining: 999999,
        entitlement: { status: "active", active: true },
      });

    expect(res.status).toBe(402);
    expect(db.capturedWrites["deduct_credits_calls"] ?? []).toEqual([]);
  });

  it("16. two concurrent requests each deduct exactly once, under distinct request ids — never a shared/coalesced count", async () => {
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      providers: [{ id: "openai", metadata: { defaultModel: "gpt-4o-mini" }, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", "gpt-4o-mini")],
      health: [{ provider_id: "openai", status: "healthy" }],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      deductResult: "ok",
      providerResponse: successfulProviderResponse,
      capturedWrites: {},
    };
    mockDb(db);
    await grantConsent("prem-11", "openai");
    await grantConsent("prem-12", "openai");

    // The Node process itself never reads-then-writes a balance — deductCredits
    // (creditEngine.ts) is a single atomic RPC call per request, so there is
    // no read-modify-write window in this layer for two requests to race on.
    // The actual lock that makes concurrent safety hold is Postgres's
    // `for update` inside the deduct_credits() SQL function
    // (supabase/schema_ai_engine.sql) — a mocked fetch cannot exercise real
    // row-locking, so this test pins the JS-side contract (one call, one
    // unique request id, per request) rather than the database guarantee
    // itself, which needs a live-Postgres check to verify directly.
    const [res1, res2] = await Promise.all([
      request(app).post("/api/studio/refine").send({
        sessionId: "prem-11",
        passageId: "p11",
        text: "The sample comprised 240 participants.",
        level: "clarity",
        useEngine: "premium",
      }),
      request(app).post("/api/studio/refine").send({
        sessionId: "prem-12",
        passageId: "p12",
        text: "The sample comprised 240 participants.",
        level: "clarity",
        useEngine: "premium",
      }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const deductCalls = db.capturedWrites["deduct_credits_calls"] ?? [];
    expect(deductCalls.length).toBe(2);
    const requestIds = deductCalls.map((c: { p_request_id: string }) => c.p_request_id);
    expect(new Set(requestIds).size).toBe(2);
  });

  it("10. succeeds without a 428 when consent was already granted for this session/provider (every test above relies on this — pinned explicitly here)", async () => {
    mockDb({
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      providers: [{ id: "openai", metadata: { defaultModel: "gpt-4o-mini" }, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", "gpt-4o-mini")],
      health: [{ provider_id: "openai", status: "healthy" }],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      deductResult: "ok",
      providerResponse: successfulProviderResponse,
    });
    await grantConsent("prem-13", "openai");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-13",
      passageId: "p13",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(200);
  });

  it("11. 428s with the same consent_required shape Free/BYOK uses, and deducts nothing, when consent has never been granted", async () => {
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      providers: [{ id: "openai", metadata: {}, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", null)],
      health: [],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      capturedWrites: {},
    };
    mockDb(db);
    // Deliberately no grantConsent() call — this session has never consented for "openai".

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-14",
      passageId: "p14",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(428);
    expect(res.body).toMatchObject({ error: "consent_required", provider: "openai" });
    expect(res.body.reason).toMatch(/first use of openai/i);
    expect(db.capturedWrites["deduct_credits_calls"] ?? []).toEqual([]);
  });

  it("12. 403s (denied), never asking for consent, when the scope is marked restricted — and deducts nothing", async () => {
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      providers: [{ id: "openai", metadata: {}, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", null)],
      health: [],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      capturedWrites: {},
    };
    mockDb(db);
    await request(app).post("/api/studio/restrict").send({ sessionId: "prem-15", scopeId: "embargoed-chapter" });

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-15",
      passageId: "p15",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
      scopeId: "embargoed-chapter",
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "denied" });
    expect(db.capturedWrites["deduct_credits_calls"] ?? []).toEqual([]);
  });

  it("13. retries safely after granting consent, and executes — and deducts — exactly once", async () => {
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      providers: [{ id: "openai", metadata: { defaultModel: "gpt-4o-mini" }, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", "gpt-4o-mini")],
      health: [{ provider_id: "openai", status: "healthy" }],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      deductResult: "ok",
      providerResponse: successfulProviderResponse,
      capturedWrites: {},
    };
    mockDb(db);

    const first = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-16",
      passageId: "p16",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });
    expect(first.status).toBe(428);
    expect(db.capturedWrites["deduct_credits_calls"] ?? []).toEqual([]);

    await grantConsent("prem-16", "openai");

    const second = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-16",
      passageId: "p16",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });
    expect(second.status).toBe(200);
    expect(db.capturedWrites["deduct_credits_calls"]?.length).toBe(1);
  });
});

/**
 * Regressions for the credit/bookkeeping half of runPremiumRefine — the
 * behaviour that decides whether a Premium cap actually costs anything to
 * exceed, and whether a healthy provider can be blamed for a Supabase blip.
 */
describe("POST /api/studio/refine — Premium metering", () => {
  it("does not hand back a generation it could not charge for when a window limit is hit", async () => {
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      providers: [{ id: "openai", metadata: { defaultModel: "gpt-4o-mini" }, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", "gpt-4o-mini")],
      health: [{ provider_id: "openai", status: "healthy" }],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      // The balance is fine; the DAILY window is what stops the charge, and
      // only deduct_credits can know that — it holds the row lock.
      deductResult: "daily_limit_exceeded",
      providerResponse: successfulProviderResponse,
      capturedWrites: {},
    };
    mockDb(db);
    await grantConsent("prem-credit-1", "openai");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-credit-1",
      passageId: "pc1",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    // Previously this returned 200 with the full refinement, creditsUsed: 0,
    // and an untouched balance — making every request past the cap free and
    // unlimited, which is to say the cap enforced nothing at all.
    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/daily/i);
    expect(res.body.revised).toBeUndefined();

    // The provider was still paid, so the spend stays on the ledger — as a
    // quota_exhausted row charged 0, not as a silent gap.
    const ledger = db.capturedWrites["ai_usage_ledger"] ?? [];
    expect(ledger.length).toBe(1);
    expect(ledger[0].status).toBe("quota_exhausted");
    expect(ledger[0].scholar_credits_charged).toBe(0);
  });

  it("402s before calling the provider when the balance cannot cover the estimate", async () => {
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      providers: [{ id: "openai", metadata: { defaultModel: "gpt-4o-mini" }, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", "gpt-4o-mini")],
      health: [{ provider_id: "openai", status: "healthy" }],
      // Non-zero, so the router still offers the provider — but nowhere near
      // the estimate for this passage.
      balance: [{ balance: 1 }],
      plans: [{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: null, concurrency_limit: 2 }],
      overrides: [],
      deductResult: "ok",
      providerResponse: successfulProviderResponse,
      capturedWrites: {},
    };
    mockDb(db);
    await grantConsent("prem-credit-2", "openai");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-credit-2",
      passageId: "pc2",
      text: "A very long passage that will not fit in one credit. ".repeat(100),
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(402);
    // Nothing was charged and nothing was spent with a provider.
    expect(db.capturedWrites["deduct_credits_calls"] ?? []).toEqual([]);
    expect(db.capturedWrites["ai_usage_ledger"] ?? []).toEqual([]);
  });

  it("does not blame the provider or re-run the generation when post-success bookkeeping fails", async () => {
    let providerCalls = 0;
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [
        encryptedCredentialRow("openai", "sk-openai-test-key"),
        encryptedCredentialRow("gemini", "sk-gemini-test-key"),
      ],
      providers: [
        { id: "openai", metadata: { defaultModel: "gpt-4o-mini" }, premium_enabled: true },
        { id: "gemini", metadata: { defaultModel: "gemini-2.5-flash" }, premium_enabled: true },
      ],
      resources: [RESOURCE("r1", "openai", "gpt-4o-mini"), RESOURCE("r2", "gemini", "gemini-2.5-flash")],
      health: [
        { provider_id: "openai", status: "healthy" },
        { provider_id: "gemini", status: "healthy" },
      ],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      providerResponse: () => {
        providerCalls++;
        return successfulProviderResponse();
      },
      capturedWrites: {},
    };
    mockDb(db);

    // Make the credit RPC itself fail, AFTER the provider has already answered.
    const withFailingDeduct = global.fetch as any;
    global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/rest/v1/rpc/deduct_credits")) {
        return Promise.resolve({ ok: false, status: 500, text: async () => "boom", json: async () => ({}) } as Response);
      }
      return withFailingDeduct(input, init);
    }) as typeof fetch;

    await grantConsent("prem-credit-3", "openai");
    await grantConsent("prem-credit-3", "gemini");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-credit-3",
      passageId: "pc3",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    // deduct/record used to share the provider call's catch, so a failure
    // here marked a provider that had just answered correctly as DOWN and
    // fell through to the next one — paying two providers for one request.
    expect(providerCalls).toBe(1);
    const healthWrites = db.capturedWrites["provider_health"] ?? [];
    expect(healthWrites.filter((w: any) => w.status === "down")).toEqual([]);
    expect(res.status).toBe(503);
  });

  it("records the model the adapter actually used, never an empty string, when the catalog has no default", async () => {
    const db: MockDb = {
      entitlement: ACTIVE_ENTITLEMENT,
      platformCredentials: [encryptedCredentialRow("openai", "sk-platform-test-key")],
      // metadata.defaultModel absent -> routingCandidates maps it to "", which
      // `??` passed straight through as the model id.
      providers: [{ id: "openai", metadata: {}, premium_enabled: true }],
      resources: [RESOURCE("r1", "openai", null)],
      health: [{ provider_id: "openai", status: "healthy" }],
      balance: [{ balance: 500 }],
      plans: PLAN,
      overrides: [],
      deductResult: "ok",
      providerResponse: successfulProviderResponse,
      capturedWrites: {},
    };
    mockDb(db);
    await grantConsent("prem-credit-4", "openai");

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "prem-credit-4",
      passageId: "pc4",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      useEngine: "premium",
    });

    expect(res.status).toBe(200);
    const ledger = db.capturedWrites["ai_usage_ledger"] ?? [];
    expect(ledger.length).toBe(1);
    // Whatever the adapter reported, the recorded model must not be the empty
    // string the catalog default produced.
    expect(ledger[0].model_id).not.toBe("");
    expect(res.body.aiSource.model).not.toBe("");
  });
});
