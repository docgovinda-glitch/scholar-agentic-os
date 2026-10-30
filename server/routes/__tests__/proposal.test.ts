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
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";
import { scholarBrain } from "../../src/services/scholarBrain.ts";

const AI = { "x-ai-provider": "openai", "x-ai-api-key": "sk-test-not-real" };

function mockBrain(parsedJson: unknown) {
  return vi.spyOn(scholarBrain, "complete").mockResolvedValue({
    text: JSON.stringify(parsedJson),
    parsedJson,
    provider: "openai",
    model: "test",
    wordCount: 10,
    burstinessMetrics: { averageLength: 18, variance: 6, burstinessScore: 0.3, isSufficientlyBurst: true },
  });
}

describe("Proposal Endpoints (/api/projects/:id/proposal)", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
    __setEnabledOutputTypesForTests("all");
  });
  afterEach(() => vi.restoreAllMocks());

  async function createProposalProject(): Promise<string> {
    const res = await request(app)
      .post("/api/projects")
      .send({ outputTypeId: "OT-19" });
    return res.body.projectId;
  }

  // Replaces a test that asserted the keyword-heuristic review (fixed "Outstanding"
  // investigator and "Exceptional Infrastructure" verdicts, a computed percentile),
  // shown whenever AI failed. The route now returns only the AI's review or an
  // honest error (PRODUCT_AUDIT P0-9).
  it("POST /study-section-simulate returns the AI panel's review of the user's proposal", async () => {
    const projectId = await createProposalProject();
    const brain = mockBrain({
      overallImpactScore: "3.1",
      recommendationForFunding: "Revise and resubmit",
      studySectionMembers: [{ role: "Primary Reviewer", verdict: "Moderate" }],
      criteria: [
        { criterion: "Significance", score: 3, verdict: "Good", critique: "c", recommendation: "r" },
        { criterion: "Approach", score: 12, verdict: "out of range" },
      ],
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/proposal/study-section-simulate`)
      .set(AI)
      .send({
        title: "Autonomous Cryptographic Verification of Scholarly Literature",
        agency: "NSF",
        mechanism: "R01",
        specificAims: ["Aim 1: Formulate deterministic citation verification protocols."],
      });

    expect(res.status).toBe(200);
    expect(res.body.agency).toBe("NSF");
    expect(res.body.overallImpactScore).toBe("3.1");
    // A criterion outside the 1-9 scale is dropped, never clamped or defaulted.
    expect(res.body.criteria).toEqual([
      { criterion: "Significance", score: 3, verdict: "Good", critique: "c", recommendation: "r" },
    ]);
    expect(String(brain.mock.calls[0][0].userPrompt)).toContain("deterministic citation verification");
  });

  it("POST /study-section-simulate asks for the user's own aims instead of inventing them", async () => {
    const projectId = await createProposalProject();
    const brain = mockBrain({});
    const res = await request(app)
      .post(`/api/projects/${projectId}/proposal/study-section-simulate`)
      .set(AI)
      .send({ title: "No aims yet" });
    expect(res.status).toBe(400);
    expect(brain).not.toHaveBeenCalled();
  });

  it("POST /study-section-simulate asks the user to connect a provider when none is set", async () => {
    const projectId = await createProposalProject();
    const res = await request(app)
      .post(`/api/projects/${projectId}/proposal/study-section-simulate`)
      .send({ title: "T", specificAims: ["Aim 1"] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ai_provider_required");
    expect(res.body.criteria).toBeUndefined();
  });

  it("POST /study-section-simulate 404s when project does not exist (IDOR protection)", async () => {
    const res = await request(app)
      .post("/api/projects/proj-nonexistent/proposal/study-section-simulate")
      .send({
        title: "Ghost Project",
      });

    expect(res.status).toBe(404);
  });

  // Replaces a test that asserted the regex-based fallback checks (shown as an AI
  // audit whenever AI failed). The route now returns only the AI's checks or an
  // honest error (PRODUCT_AUDIT P0-9).
  it("POST /aims-audit returns the AI's checks for the user's aims", async () => {
    const projectId = await createProposalProject();
    mockBrain({ checks: [{ name: "Overarching Hypothesis Stated", status: "passed", detail: "Clear hypothesis." }] });
    const res = await request(app)
      .post(`/api/projects/${projectId}/proposal/aims-audit`)
      .set(AI)
      .send({ aimsText: "Our central hypothesis is that consensus protocols reduce citation errors. Aim 1: build it." });
    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual([{ name: "Overarching Hypothesis Stated", status: "passed", detail: "Clear hypothesis." }]);
  });

  it("POST /aims-audit reports a failed AI call and returns no checks", async () => {
    const projectId = await createProposalProject();
    vi.spyOn(scholarBrain, "complete").mockRejectedValue(new Error("timeout"));
    const res = await request(app)
      .post(`/api/projects/${projectId}/proposal/aims-audit`)
      .set(AI)
      .send({ aimsText: "Our central hypothesis is that consensus protocols reduce citation errors. Aim 1: build it." });
    expect(res.status).toBe(502);
    expect(res.body.checks).toBeUndefined();
  });

  it("POST /aims-audit 404s when project does not exist", async () => {
    const res = await request(app)
      .post("/api/projects/proj-nonexistent/proposal/aims-audit")
      .send({ aimsText: "Aim 1: ..." });

    expect(res.status).toBe(404);
  });
});
