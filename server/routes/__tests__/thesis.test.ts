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

describe("Thesis Endpoints (/api/projects/:id/thesis)", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
    __setEnabledOutputTypesForTests("all");
  });

  async function createThesisProject(): Promise<string> {
    const res = await request(app)
      .post("/api/projects")
      .send({ outputTypeId: "OT-09" });
    return res.body.projectId;
  }

  it("POST /viva-simulate returns structured external examiner defense panel", async () => {
    const projectId = await createThesisProject();

    const payload = {
      title: "Non-Markovian Memory Topologies in Autonomous Consensus Networks",
      degreeLevel: "PhD Dissertation",
      theoreticalFramework: "Dynamic Neural Field Theory & Bayesian Epistemic Uncertainty",
      researchQuestions: [
        "How do non-Markovian memory architectures mitigate consensus latency under Byzantine failure?",
        "To what extent does epistemic uncertainty calibration reduce synthetic hallucination?",
      ],
      methodology: "Triangulated Mixed-Methods: High-Throughput Empirical Simulation + Qualitative Protocol Analysis",
    };

    const res = await request(app)
      .post(`/api/projects/${projectId}/thesis/viva-simulate`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toContain("Non-Markovian Memory Topologies");
    expect(res.body.examinerPersona).toBeTruthy();
    expect(res.body.examinerRigorScore).toContain("Viva Voce Standard");
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions.length).toBeGreaterThanOrEqual(4);

    for (const q of res.body.questions) {
      expect(q.id).toBeTruthy();
      expect(q.category).toBeTruthy();
      expect(q.examinerQuestion).toBeTruthy();
      expect(q.assessmentFocus).toBeTruthy();
      expect(Array.isArray(q.suggestedRebuttalStructure)).toBe(true);
      expect(q.suggestedRebuttalStructure.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("POST /viva-simulate 404s when project does not exist (IDOR protection)", async () => {
    const res = await request(app)
      .post("/api/projects/proj-ghost-thesis/thesis/viva-simulate")
      .send({ title: "Unowned Thesis" });

    expect(res.status).toBe(404);
  });

  it("POST /chapter-audit evaluates structural alignment and cross-chapter coherence", async () => {
    const projectId = await createThesisProject();

    const chapters = [
      { chapterNumber: 1, title: "Introduction & Context", wordCount: 4500, targetWordCount: 6000, status: "drafting" },
      { chapterNumber: 2, title: "Theoretical Foundations", wordCount: 8000, targetWordCount: 12000, status: "reviewed" },
      { chapterNumber: 3, title: "Methodological Design", wordCount: 6000, targetWordCount: 8000, status: "reviewed" },
      { chapterNumber: 4, title: "Empirical Findings", wordCount: 9500, targetWordCount: 14000, status: "drafting" },
      { chapterNumber: 5, title: "Critical Discussion", wordCount: 2000, targetWordCount: 10000, status: "drafting" },
      { chapterNumber: 6, title: "Conclusion & Future Directions", wordCount: 0, targetWordCount: 4000, status: "not_started" },
    ];

    const res = await request(app)
      .post(`/api/projects/${projectId}/thesis/chapter-audit`)
      .send({ chapters });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.audit).toBeTruthy();
    expect(res.body.audit.totalChapters).toBe(6);
    expect(res.body.audit.alignmentScore).toBeGreaterThanOrEqual(70);
    expect(res.body.audit.coherenceStatus).toBeTruthy();

    const checks = res.body.audit.crossChapterChecks;
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThanOrEqual(4);

    const checkNames = checks.map((c: any) => c.check);
    expect(checkNames).toContain("Research Question Propagation");
    expect(checkNames).toContain("Methodology to Findings Alignment");
    expect(checkNames).toContain("Citation & Knowledge Vault Harmonization");
  });

  it("POST /chapter-audit 404s when project does not exist", async () => {
    const res = await request(app)
      .post("/api/projects/proj-ghost-thesis/thesis/chapter-audit")
      .send({ chapters: [] });

    expect(res.status).toBe(404);
  });
});
