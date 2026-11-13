/**
 * Tests for POST /api/projects/:id/manuscript/coherence-check — the global
 * coherence pass wired to the generation job (BYOK + Premium).
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
import { __resetProjectStoreSelectionForTests } from "../../../src/services/store/projectStore.ts";
import { __resetSharedStoreForTests } from "../project.ts";
import { __resetSessionPoliciesForTests } from "../../../src/app/studio/sessionPolicyStore.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";
import { generateMasterKeyBase64, encrypt, generateCEK, wrapKey } from "../../../src/services/crypto/crypto.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;
const originalMasterKey = process.env.MASTER_KEY;

beforeEach(() => {
  // P1-6: Reset ALL layers of store caching to prevent cross-test-file
  // interference. Without both resets, the first test file to run wins the
  // module-level singleton and later files may see the wrong backend.
  __resetSharedStoreForTests();         // nulls server/routes/project.ts storeInstance
  __resetProjectStoreSelectionForTests(); // nulls src/services/store/projectStore.ts cache
  __resetProjectStoreForTests();        // clears the in-memory Map
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

/** A valid encrypted-credential row, decryptable with the current MASTER_KEY — same shape studio.premium.test.ts uses for platform_provider_credentials. */
function encryptedCredentialRow(providerId: string, plaintext: string) {
  const masterKey = Buffer.from(process.env.MASTER_KEY!, "base64");
  const cek = generateCEK();
  return {
    id: `cred-${providerId}`,
    provider_id: providerId,
    label: "default",
    encrypted_cek: wrapKey(cek, masterKey),
    encrypted_credential: encrypt(plaintext, cek),
    masked_preview: `••••${plaintext.slice(-4)}`,
    status: "active",
  };
}

function resourceRow(id: string, providerId: string) {
  return {
    id,
    label: `Resource ${id}`,
    description: null,
    provider_id: providerId,
    model_id: null,
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

async function createProject(): Promise<string> {
  const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
  return res.body.projectId;
}

async function grantConsent(projectId: string, provider: string) {
  await request(app).post("/api/studio/consent").send({ sessionId: `manuscript:${projectId}`, provider });
}

function passResponse(issues: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ issues }) } }] } ),
  } as Response;
}

async function startJobWithTwoSections(projectId: string) {
  await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
  await grantConsent(projectId, "openai");
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ text: "Section text.", memory: "m", citedEvidenceIds: [] }) } }] } ),
  } as Response);
  await request(app).post(`/api/projects/${projectId}/manuscript/next-section`).send({ provider: "openai", apiKey: "sk-test" });
  await request(app).post(`/api/projects/${projectId}/manuscript/next-section`).send({ provider: "openai", apiKey: "sk-test" });
}

describe("POST /api/projects/:id/manuscript/coherence-check", () => {
  it("404s when no job has been started", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/manuscript/coherence-check`).send({ provider: "openai", apiKey: "sk-test" });
    expect(res.status).toBe(404);
  });

  it("400s on an invalid dimensions value", async () => {
    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    const res = await request(app)
      .post(`/api/projects/${projectId}/manuscript/coherence-check`)
      .send({ provider: "openai", apiKey: "sk-test", dimensions: ["not-a-real-dimension"] });
    expect(res.status).toBe(400);
  });

  it("runs the multi-pass check and persists coherenceReport onto the job", async () => {
    const projectId = await createProject();
    await startJobWithTwoSections(projectId);

    global.fetch = vi.fn().mockResolvedValue(passResponse([{ description: "Inconsistent terms.", sectionKeys: ["introduction", "methods"], severity: "moderate" }]));

    const res = await request(app)
      .post(`/api/projects/${projectId}/manuscript/coherence-check`)
      .send({ provider: "openai", apiKey: "sk-test" });

    expect(res.status).toBe(200);
    expect(res.body.generationJob.coherenceReport.passesRun).toEqual(["terminology", "argument_continuity", "methodology"]);
    expect(res.body.generationJob.coherenceReport.issues.length).toBeGreaterThan(0);

    const job = await request(app).get(`/api/projects/${projectId}/manuscript/job`);
    expect(job.body.coherenceReport).toBeDefined();
  });

  it("can re-run just a single requested dimension", async () => {
    const projectId = await createProject();
    await startJobWithTwoSections(projectId);

    global.fetch = vi.fn().mockResolvedValue(passResponse([]));
    const res = await request(app)
      .post(`/api/projects/${projectId}/manuscript/coherence-check`)
      .send({ provider: "openai", apiKey: "sk-test", dimensions: ["methodology"] });

    expect(res.status).toBe(200);
    expect(res.body.generationJob.coherenceReport.passesRun).toEqual(["methodology"]);
  });


});
