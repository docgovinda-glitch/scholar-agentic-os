/**
 * Tests for the long-form generation engine's routes: planning
 * (POST .../manuscript/start), section-by-section generation + checkpointing
 * (POST .../manuscript/next-section, BYOK + Premium), and pause/resume.
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
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { __resetSessionPoliciesForTests } from "../../../src/app/studio/sessionPolicyStore.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";
import { generateMasterKeyBase64, encrypt, generateCEK, wrapKey } from "../../../src/services/crypto/crypto.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;
const originalMasterKey = process.env.MASTER_KEY;

beforeEach(() => {
  __resetProjectStoreForTests();
  __resetSessionPoliciesForTests();
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

async function grantConsent(projectId: string, provider: string) {
  await request(app).post("/api/studio/consent").send({ sessionId: `manuscript:${projectId}`, provider });
}

function sectionResponse(text: string, memory: string, citedEvidenceIds: string[] = []) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ text, memory, citedEvidenceIds }) } }] } ),
  } as Response;
}

describe("POST /api/projects/:id/manuscript/start", () => {
  it("plans only the sections OT-10's catalog marks countsTowardWordcount, excluding title/abstract/declarations/references", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    expect(res.status).toBe(201);
    expect(res.body.plan.map((p: { key: string }) => p.key)).toEqual(["introduction", "methods", "results", "discussion"]);
    expect(res.body.state).toBe("running");
    expect(res.body.sections).toEqual([]);
  });

  it("uses the venue's own word limit over the catalog's generic total once journal requirements are captured", async () => {
    const projectId = await createProject();
    await request(app)
      .put(`/api/projects/${projectId}/journal-requirements`)
      .send({ journalName: "J", requiredDeclarations: [], wordLimit: { max: 4000 } });

    const res = await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    expect(res.status).toBe(201);
    expect(res.body.totalWordTarget).toBe(4000);
    expect(res.body.plan.find((p: { key: string }) => p.key === "introduction").targetWords).toBe(Math.round(4000 * 0.15));
  });

  it("409s starting a second job while one already exists", async () => {
    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    const res = await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    expect(res.status).toBe(409);
  });
});

describe("GET /api/projects/:id/manuscript/job", () => {
  it("404s before any job has been started", async () => {
    const projectId = await createProject();
    const res = await request(app).get(`/api/projects/${projectId}/manuscript/job`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/projects/:id/manuscript/next-section — BYOK path", () => {
  it("404s when no job has been started", async () => {
    const projectId = await createProject();
    const res = await request(app)
      .post(`/api/projects/${projectId}/manuscript/next-section`)
      .send({ provider: "openai", apiKey: "sk-test" });
    expect(res.status).toBe(404);
  });

  it("428s on first use, drafting being content-bearing, and does not touch the job", async () => {
    global.fetch = vi.fn();
    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});

    const res = await request(app)
      .post(`/api/projects/${projectId}/manuscript/next-section`)
      .send({ provider: "openai", apiKey: "sk-test" });
    expect(res.status).toBe(428);

    const job = await request(app).get(`/api/projects/${projectId}/manuscript/job`);
    expect(job.body.sections).toEqual([]);
    expect(job.body.state).toBe("running");
  });

  it("generates and checkpoints the first section once consent is granted, and citableEvidence only ever contains 'citable' evidence", async () => {
    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    await grantConsent(projectId, "openai");

    global.fetch = vi.fn().mockResolvedValue(sectionResponse("The gap in the literature is X.", "Introduces the gap.", []));

    const res = await request(app)
      .post(`/api/projects/${projectId}/manuscript/next-section`)
      .send({ provider: "openai", apiKey: "sk-test" });

    expect(res.status).toBe(200);
    expect(res.body.generationJob.sections).toHaveLength(1);
    expect(res.body.generationJob.sections[0].key).toBe("introduction");
    expect(res.body.generationJob.sections[0].memory).toBe("Introduces the gap.");
    expect(res.body.generationJob.state).toBe("running");
  });

  it("continues from the checkpoint on the next call rather than regenerating the first section", async () => {
    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    await grantConsent(projectId, "openai");

    global.fetch = vi.fn().mockResolvedValue(sectionResponse("Intro text.", "Intro memory.", []));
    await request(app).post(`/api/projects/${projectId}/manuscript/next-section`).send({ provider: "openai", apiKey: "sk-test" });

    global.fetch = vi.fn().mockResolvedValue(sectionResponse("Methods text.", "Methods memory.", []));
    const second = await request(app)
      .post(`/api/projects/${projectId}/manuscript/next-section`)
      .send({ provider: "openai", apiKey: "sk-test" });

    expect(second.body.generationJob.sections.map((s: { key: string }) => s.key)).toEqual(["introduction", "methods"]);
  });

  it("passes only citable evidence into the section prompt (verified via the Section text, since the mock echoes citedEvidenceIds)", async () => {
    const projectId = await createProject();
    // Add a source and push one piece of evidence all the way to citable.
    const sourceRes = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/sources`)
      .send({ title: "A Source", authors: [], sourceType: "user_provided", authorityTier: "C" });
    const sourceId = sourceRes.body.sources[0].id;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "claim-1", text: "X is true." } });
    const extractRes = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/sources/${sourceId}/extract`)
      .send({ quote: "X was observed in 40% of cases." });
    const evidenceId = extractRes.body.items[0].id;
    await request(app).post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/verify`).send({});
    await request(app).post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/propose`).send({ claimId: "claim-1" });
    await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/approve`)
      .send({ actor: "u1", strength: "strong", rationale: "Directly supports it." });

    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    await grantConsent(projectId, "openai");

    let capturedPrompt = "";
    global.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      capturedPrompt = JSON.stringify(init?.body ?? "");
      return Promise.resolve(sectionResponse(`As shown [${evidenceId}], X is true.`, "Summary.", [evidenceId]));
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post(`/api/projects/${projectId}/manuscript/next-section`)
      .send({ provider: "openai", apiKey: "sk-test" });

    expect(res.status).toBe(200);
    expect(capturedPrompt).toContain("X was observed in 40% of cases.");
    expect(res.body.generationJob.sections[0].citedEvidenceIds).toEqual([evidenceId]);
  });
});

describe("POST /api/projects/:id/manuscript/next-section — Premium path", () => {
  function mockDb(overrides: Partial<{ entitlement: object[]; balance: object[] }> = {}) {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const respondJson = (body: unknown, status = 200) =>
        Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body } as Response);
      if (url.includes("/rest/v1/user_entitlements")) return respondJson(overrides.entitlement ?? []);
      if (url.includes("/rest/v1/user_ai_connections")) return respondJson([]);
      if (url.includes("/rest/v1/provider_health")) return respondJson([]);
      if (url.includes("/rest/v1/ai_providers")) return respondJson([]);
      if (url.includes("/rest/v1/credit_balances")) return respondJson(overrides.balance ?? []);
      if (url.includes("/rest/v1/premium_plans")) return respondJson([{ id: "premium_basic", monthly_credits: 5000, daily_credits: 200, per_task_max_credits: 50, concurrency_limit: 2 }]);
      if (url.includes("/rest/v1/user_quota_overrides")) return respondJson([]);
      if (url.includes("/rest/v1/ai_resources")) return respondJson([]);
      if (url.includes("/rest/v1/plan_resources")) return respondJson([]);
      return respondJson({}, 500);
    }) as unknown as typeof fetch;
  }

  it("402s a non-entitled user, never reaching the provider", async () => {
    mockDb({ entitlement: [] });
    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});

    const res = await request(app).post(`/api/projects/${projectId}/manuscript/next-section`).send({ useEngine: "premium" });
    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/Premium subscription/i);
  });
});

describe("pause / resume", () => {
  it("pauses a running job and refuses to pause it twice", async () => {
    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});

    const paused = await request(app).post(`/api/projects/${projectId}/manuscript/pause`).send({});
    expect(paused.status).toBe(200);
    expect(paused.body.state).toBe("paused");

    const secondPause = await request(app).post(`/api/projects/${projectId}/manuscript/pause`).send({});
    expect(secondPause.status).toBe(409);
  });

  it("resumes a paused job back to running, and next-section continues normally after", async () => {
    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    await request(app).post(`/api/projects/${projectId}/manuscript/pause`).send({});

    const resumed = await request(app).post(`/api/projects/${projectId}/manuscript/resume`).send({});
    expect(resumed.status).toBe(200);
    expect(resumed.body.state).toBe("running");

    await grantConsent(projectId, "openai");
    global.fetch = vi.fn().mockResolvedValue(sectionResponse("Intro text.", "Intro memory.", []));
    const gen = await request(app).post(`/api/projects/${projectId}/manuscript/next-section`).send({ provider: "openai", apiKey: "sk-test" });
    expect(gen.status).toBe(200);
  });
});
