/**
 * Tests for AI-assisted journal-requirements extraction:
 * GET/PUT /api/projects/:id/journal-requirements (source handling added in
 * this phase) and POST /api/projects/:id/journal-requirements/extract
 * (BYOK + Premium paths, mirroring server/routes/studio.ts's refine route —
 * see studio.test.ts / studio.premium.test.ts for the pattern this follows).
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
import { AI_HEADERS, useFetchBackedAi } from "../../test/aiTestKit.ts";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { __resetAuditLogForTests } from "../../../src/platform/warden/warden.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";
import { generateMasterKeyBase64, encrypt, generateCEK, wrapKey } from "../../../src/services/crypto/crypto.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;
const originalMasterKey = process.env.MASTER_KEY;

beforeEach(() => {
  useFetchBackedAi();
  __resetProjectStoreForTests();
  __resetAuditLogForTests();
  __resetRateLimitStore();
  __setEnabledOutputTypesForTests(["OT-10"]);
  process.env.MASTER_KEY = generateMasterKeyBase64();
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalMasterKey === undefined) delete process.env.MASTER_KEY;
  else process.env.MASTER_KEY = originalMasterKey;
  vi.restoreAllMocks();
});

async function createProject(): Promise<string> {
  const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
  return res.body.projectId;
}

const GUIDELINES_TEXT =
  "Nature Test Journal author guidelines. Manuscripts must not exceed 6000 words including references. " +
  "Authors must follow the Vancouver citation style. Submissions must include a Conflict of Interest statement " +
  "and a Data Availability statement. We accept Original Research Article and Review Article submission types. " +
  "Please structure your manuscript as Introduction, Methods, Results, and Discussion.";

function providerJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }),
  } as Response;
}

const VALID_PROPOSAL_JSON = {
  journalName: "Nature Test Journal",
  wordLimit: { max: 6000 },
  citationStyle: "Vancouver",
  requiredDeclarations: ["Conflict of Interest statement", "Data Availability statement"],
  articleType: "Original Research Article",
  structureOverride: ["Introduction", "Methods", "Results", "Discussion"],
  unresolvedFields: [],
};

describe("GET /api/projects/:id/journal-requirements", () => {
  it("404s before anything has been captured", async () => {
    const projectId = await createProject();
    const res = await request(app).get(`/api/projects/${projectId}/journal-requirements`);
    expect(res.status).toBe(404);
  });

  it("returns what was captured after a PUT", async () => {
    const projectId = await createProject();
    await request(app)
      .put(`/api/projects/${projectId}/journal-requirements`)
      .send({ journalName: "Nature Test Journal", requiredDeclarations: [] });
    const res = await request(app).get(`/api/projects/${projectId}/journal-requirements`);
    expect(res.status).toBe(200);
    expect(res.body.journalName).toBe("Nature Test Journal");
  });
});

describe("PUT /api/projects/:id/journal-requirements — source handling", () => {
  it("stamps source: manual when omitted", async () => {
    const projectId = await createProject();
    const res = await request(app)
      .put(`/api/projects/${projectId}/journal-requirements`)
      .send({ journalName: "J", requiredDeclarations: [] });
    expect(res.body.journalRequirements.source).toBe("manual");
  });

  it("stamps source: ai_extracted only when the client explicitly says so", async () => {
    const projectId = await createProject();
    const res = await request(app)
      .put(`/api/projects/${projectId}/journal-requirements`)
      .send({ journalName: "J", requiredDeclarations: [], source: "ai_extracted" });
    expect(res.body.journalRequirements.source).toBe("ai_extracted");
  });

  it("never trusts an arbitrary source value — anything but the literal 'ai_extracted' falls back to manual", async () => {
    const projectId = await createProject();
    const res = await request(app)
      .put(`/api/projects/${projectId}/journal-requirements`)
      .send({ journalName: "J", requiredDeclarations: [], source: "totally-trustworthy" });
    expect(res.body.journalRequirements.source).toBe("manual");
  });
});

describe("POST /api/projects/:id/journal-requirements/extract — validation", () => {
  it("400s when guidelinesText is missing", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/journal-requirements/extract`).send({});
    expect(res.status).toBe(400);
  });

  it("400s when guidelinesText is too short to extract from reliably", async () => {
    const projectId = await createProject();
    const res = await request(app)
      .post(`/api/projects/${projectId}/journal-requirements/extract`)
      .send({ guidelinesText: "Too short.", provider: "openai", apiKey: "sk-test" });
    expect(res.status).toBe(400);
  });

  it("404s for a project the caller does not own", async () => {
    const res = await request(app)
      .post(`/api/projects/not-a-real-project/journal-requirements/extract`)
      .set(AI_HEADERS).send({ guidelinesText: GUIDELINES_TEXT });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/projects/:id/journal-requirements/extract — BYOK path", () => {
  it("succeeds on first use with no consent prompt — guidelines text classifies as public, not user_content", async () => {
    global.fetch = vi.fn().mockResolvedValue(providerJsonResponse(VALID_PROPOSAL_JSON));
    const projectId = await createProject();

    const res = await request(app)
      .post(`/api/projects/${projectId}/journal-requirements/extract`)
      .set(AI_HEADERS).send({ guidelinesText: GUIDELINES_TEXT });

    expect(res.status).toBe(200);
    expect(res.body.proposal.journalName).toBe("Nature Test Journal");
    expect(res.body.proposal.citationStyle).toBe("Vancouver");
    expect(res.body.proposal.requiredDeclarations).toEqual(["Conflict of Interest statement", "Data Availability statement"]);
  });

  it("never saves anything — the project still has no journal requirements captured after extraction", async () => {
    global.fetch = vi.fn().mockResolvedValue(providerJsonResponse(VALID_PROPOSAL_JSON));
    const projectId = await createProject();

    await request(app)
      .post(`/api/projects/${projectId}/journal-requirements/extract`)
      .set(AI_HEADERS).send({ guidelinesText: GUIDELINES_TEXT });

    const res = await request(app).get(`/api/projects/${projectId}/journal-requirements`);
    expect(res.status).toBe(404);
  });

  it("reports unresolvedFields rather than guessing when the text is silent on a field", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      providerJsonResponse({
        journalName: "Nature Test Journal",
        requiredDeclarations: [],
        unresolvedFields: ["citationStyle", "wordLimit"],
      })
    );
    const projectId = await createProject();

    const res = await request(app)
      .post(`/api/projects/${projectId}/journal-requirements/extract`)
      .set(AI_HEADERS).send({ guidelinesText: GUIDELINES_TEXT });

    expect(res.status).toBe(200);
    expect(res.body.proposal.citationStyle).toBeUndefined();
    expect(res.body.proposal.unresolvedFields).toEqual(["citationStyle", "wordLimit"]);
  });

  it("502s with a real error, never a fabricated proposal, when the model's response can't be parsed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "not json at all" } }] }),
    } as unknown as Response);
    const projectId = await createProject();

    const res = await request(app)
      .post(`/api/projects/${projectId}/journal-requirements/extract`)
      .set(AI_HEADERS).send({ guidelinesText: GUIDELINES_TEXT });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/could not be generated/i);
  });

  it("400s with ai_provider_required when no AI is connected", async () => {
    const projectId = await createProject();
    const res = await request(app)
      .post(`/api/projects/${projectId}/journal-requirements/extract`)
      .send({ guidelinesText: GUIDELINES_TEXT });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ai_provider_required");
  });
});

interface MockDb {
  entitlement?: object[];
  connections?: object[];
  platformCredentials?: object[];
  providers?: object[];
  resources?: object[];
  planResources?: object[];
  balance?: object[];
  plans?: object[];
  overrides?: object[];
  deductResult?: string;
  providerResponse?: () => Promise<Response> | Response;
  capturedWrites: Record<string, any[]>;
}

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
        (db.capturedWrites["provider_health"] ??= []).push(JSON.parse(init!.body as string));
      }
      return respondJson([]);
    }
    if (url.includes("/rest/v1/platform_provider_credentials")) {
      const providerIdMatch = /provider_id=eq\.([^&]+)/.exec(url);
      const rows = db.platformCredentials ?? [];
      if (!providerIdMatch) return respondJson(rows);
      const wanted = decodeURIComponent(providerIdMatch[1]);
      return respondJson(rows.filter((r: any) => r.provider_id === wanted));
    }
    if (url.includes("/rest/v1/ai_providers")) return respondJson(db.providers ?? []);
    if (url.includes("/rest/v1/ai_resources")) return respondJson(db.resources ?? []);
    if (url.includes("/rest/v1/plan_resources")) {
      if (db.planResources) return respondJson(db.planResources);
      return respondJson((db.resources ?? []).map((r: any) => ({ plan_id: "premium_basic", resource_id: r.id })));
    }
    if (url.includes("/rest/v1/credit_balances")) return respondJson(db.balance ?? []);
    if (url.includes("/rest/v1/premium_plans")) return respondJson(db.plans ?? []);
    if (url.includes("/rest/v1/user_quota_overrides")) return respondJson(db.overrides ?? []);
    if (url.includes("/rest/v1/ai_usage_ledger")) {
      (db.capturedWrites["ai_usage_ledger"] ??= []).push(JSON.parse(init!.body as string));
      return respondJson(null, 201);
    }
    if (url.includes("/rest/v1/rpc/deduct_credits")) {
      (db.capturedWrites["deduct_credits_calls"] ??= []).push(JSON.parse(init!.body as string));
      return respondJson(db.deductResult ?? "ok");
    }
    if (db.providerResponse) return Promise.resolve(db.providerResponse());
    return respondJson({}, 500);
  }) as unknown as typeof fetch;
}

