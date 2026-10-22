import { describe, it, expect, beforeEach, vi } from "vitest";

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

describe("Proposal Endpoints (/api/projects/:id/proposal)", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
    __setEnabledOutputTypesForTests("all");
  });

  async function createProposalProject(): Promise<string> {
    const res = await request(app)
      .post("/api/projects")
      .send({ outputTypeId: "OT-19" });
    return res.body.projectId;
  }

  it("POST /study-section-simulate returns structured NIH/NSF criteria evaluation", async () => {
    const projectId = await createProposalProject();

    const payload = {
      title: "Autonomous Cryptographic Verification of Scholarly Literature",
      agency: "NSF / NIH Joint Informatics",
      mechanism: "R01 / Research Project Grant",
      specificAims: [
        "Aim 1: Formulate deterministic citation verification protocols achieving 99.8% precision.",
        "Aim 2: Construct multi-agent peer review pipelines across 5 distinct reviewer archetypes.",
        "Aim 3: Conduct double-blind trials across 1,000 biomedical review manuscripts.",
      ],
      significance: "Addresses the hypothesis that Bayesian multi-agent debate eliminates synthetic citation hallucinations.",
      strategy: "Includes explicit pitfall mitigation and alternative statistical pipelines.",
    };

    const res = await request(app)
      .post(`/api/projects/${projectId}/proposal/study-section-simulate`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toContain("Autonomous Cryptographic Verification");
    expect(res.body.agency).toBe("NSF / NIH Joint Informatics");
    expect(res.body.overallImpactScore).toMatch(/\d\.\d/);
    expect(res.body.recommendationForFunding).toBeTruthy();
    expect(res.body.studySectionMembers.length).toBeGreaterThanOrEqual(3);

    // Verify all 5 core NIH/NSF criteria are evaluated
    const criteriaNames = res.body.criteria.map((c: any) => c.criterion);
    expect(criteriaNames).toContain("Significance");
    expect(criteriaNames).toContain("Investigator(s)");
    expect(criteriaNames).toContain("Innovation");
    expect(criteriaNames).toContain("Approach");
    expect(criteriaNames).toContain("Environment");

    // Verify each criterion has valid score on 1-9 scale, critique, and recommendation
    for (const c of res.body.criteria) {
      expect(c.score).toBeGreaterThanOrEqual(1.0);
      expect(c.score).toBeLessThanOrEqual(9.0);
      expect(c.verdict).toBeTruthy();
      expect(c.critique).toBeTruthy();
      expect(c.recommendation).toBeTruthy();
    }
  });

  it("POST /study-section-simulate 404s when project does not exist (IDOR protection)", async () => {
    const res = await request(app)
      .post("/api/projects/proj-nonexistent/proposal/study-section-simulate")
      .send({
        title: "Ghost Project",
      });

    expect(res.status).toBe(404);
  });

  it("POST /aims-audit evaluates Specific Aims text against structural grant standards", async () => {
    const projectId = await createProposalProject();

    const aimsText = `Specific Aims:
Our central hypothesis is that multi-agent consensus protocols eliminate synthetic citation hallucinations with sub-second latency.
Aim 1: Construct a deterministic zero-hallucination verification engine achieving 99.9% precision (p < 0.001) across 10,000 benchmark articles.
Aim 2: Implement multi-agent debate topologies evaluating empirical claims without single-point dependencies.
Aim 3: Validate translational utility across federated health archives.`;

    const res = await request(app)
      .post(`/api/projects/${projectId}/proposal/aims-audit`)
      .send({ aimsText });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.checks)).toBe(true);
    expect(res.body.checks.length).toBeGreaterThanOrEqual(4);

    const checkNames = res.body.checks.map((chk: any) => chk.name);
    expect(checkNames).toContain("Overarching Hypothesis Stated");
    expect(checkNames).toContain("Aim Structural Independence");
    expect(checkNames).toContain("Quantifiable Deliverables & Benchmarks");

    // Overarching hypothesis should pass given the provided text
    const hypothesisCheck = res.body.checks.find((c: any) => c.name === "Overarching Hypothesis Stated");
    expect(hypothesisCheck.status).toBe("passed");
  });

  it("POST /aims-audit 404s when project does not exist", async () => {
    const res = await request(app)
      .post("/api/projects/proj-nonexistent/proposal/aims-audit")
      .send({ aimsText: "Aim 1: ..." });

    expect(res.status).toBe(404);
  });
});
