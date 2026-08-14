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
import { __resetSessionPoliciesForTests } from "../../../src/app/studio/sessionPolicyStore.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();
  __resetSessionPoliciesForTests();
  __resetRateLimitStore();
  __setEnabledOutputTypesForTests(["OT-10"]);
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

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

  it("402s a non-entitled Premium user, never reaching the provider", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const respondJson = (body: unknown, status = 200) => Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body } as Response);
      if (url.includes("/rest/v1/user_entitlements")) return respondJson([]);
      if (url.includes("/rest/v1/user_ai_connections")) return respondJson([]);
      if (url.includes("/rest/v1/provider_health")) return respondJson([]);
      if (url.includes("/rest/v1/ai_providers")) return respondJson([]);
      return respondJson({}, 500);
    }) as unknown as typeof fetch;

    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});

    const res = await request(app).post(`/api/projects/${projectId}/manuscript/coherence-check`).send({ useEngine: "premium" });
    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/Premium subscription/i);
  });
});
