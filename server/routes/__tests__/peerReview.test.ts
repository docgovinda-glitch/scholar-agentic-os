/**
 * Tests for POST/GET /api/projects/:id/manuscript/peer-review — the
 * multi-lens adversarial peer review wired to the generation job and to
 * gate G5 (BYOK + Premium).
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

function lensResponse(findings: unknown[], overallAssessment = "Assessment.") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ findings, overallAssessment }) } }] } ),
  } as Response;
}

async function startJobWithSection(projectId: string) {
  await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
  await grantConsent(projectId, "openai");
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ text: "Section text.", memory: "m", citedEvidenceIds: [] }) } }] } ),
  } as Response);
  await request(app).post(`/api/projects/${projectId}/manuscript/next-section`).send({ provider: "openai", apiKey: "sk-test" });
}

describe("POST /api/projects/:id/manuscript/peer-review", () => {
  it("404s when no job has been started", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/manuscript/peer-review`).send({ provider: "openai", apiKey: "sk-test" });
    expect(res.status).toBe(404);
  });

  it("400s on an invalid lenses value", async () => {
    const projectId = await createProject();
    await request(app).post(`/api/projects/${projectId}/manuscript/start`).send({});
    const res = await request(app)
      .post(`/api/projects/${projectId}/manuscript/peer-review`)
      .send({ provider: "openai", apiKey: "sk-test", lenses: ["not-a-real-lens"] });
    expect(res.status).toBe(400);
  });

  it("runs all seven lenses as round 1 and updates G5's exit criteria", async () => {
    const projectId = await createProject();
    await startJobWithSection(projectId);

    global.fetch = vi.fn().mockResolvedValue(lensResponse([], "Nothing wrong with this dimension."));
    const res = await request(app).post(`/api/projects/${projectId}/manuscript/peer-review`).send({ provider: "openai", apiKey: "sk-test" });

    expect(res.status).toBe(200);
    expect(res.body.peerReviewHistory.rounds).toHaveLength(1);
    expect(res.body.peerReviewHistory.rounds[0].roundNumber).toBe(1);
    expect(res.body.peerReviewHistory.rounds[0].lensesRun).toHaveLength(7);
    // G5's overall gate status also depends on G4 being signed off, which is
    // out of scope for this test — outstandingBlocking is computed purely
    // from G5's own exit criteria, so it's what actually proves the round
    // was picked up.
    const g5 = res.body.gates.find((g: { gate: string }) => g.gate === "G5");
    expect(g5.outstandingBlocking).toEqual([]);
  });

  it("a second call appends round 2 rather than overwriting round 1 — versioned history", async () => {
    const projectId = await createProject();
    await startJobWithSection(projectId);

    global.fetch = vi.fn().mockResolvedValue(lensResponse([{ summary: "s", detail: "d", severity: "critical", sectionKeys: ["introduction"] }], "Serious issue."));
    await request(app).post(`/api/projects/${projectId}/manuscript/peer-review`).send({ provider: "openai", apiKey: "sk-test", lenses: ["evidence"] });

    global.fetch = vi.fn().mockResolvedValue(lensResponse([], "Resolved."));
    const second = await request(app).post(`/api/projects/${projectId}/manuscript/peer-review`).send({ provider: "openai", apiKey: "sk-test", lenses: ["evidence"] });

    expect(second.body.peerReviewHistory.rounds).toHaveLength(2);
    expect(second.body.peerReviewHistory.rounds[0].roundNumber).toBe(1);
    expect(second.body.peerReviewHistory.rounds[1].roundNumber).toBe(2);
    // Round 1's critical finding is still there, untouched — never overwritten.
    expect(second.body.peerReviewHistory.rounds[0].lensReviews[0].findings[0].severity).toBe("critical");

    // G5 judges only the MOST RECENT round (computeG5ExitCriteria's own
    // rule) — round 1's critical finding no longer blocks once round 2 has
    // none. Checked via outstandingBlocking, not overall status, since
    // status also needs G4 signed off (out of scope here).
    const g5 = second.body.gates.find((g: { gate: string }) => g.gate === "G5");
    expect(g5.outstandingBlocking).toEqual([]);
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

    const res = await request(app).post(`/api/projects/${projectId}/manuscript/peer-review`).send({ useEngine: "premium" });
    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/Premium subscription/i);
  });
});

describe("GET /api/projects/:id/manuscript/peer-review", () => {
  it("starts as an empty history for a new project", async () => {
    const projectId = await createProject();
    const res = await request(app).get(`/api/projects/${projectId}/manuscript/peer-review`);
    expect(res.status).toBe(200);
    expect(res.body.rounds).toEqual([]);
  });
});
