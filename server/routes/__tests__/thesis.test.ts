import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { keyringHeader } from "../../test/aiTestKit.ts";

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

const AI = keyringHeader("openai", "test-model", "sk-test-not-real");

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

describe("Thesis Endpoints (/api/projects/:id/thesis)", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
    __setEnabledOutputTypesForTests("all");
    vi.spyOn(scholarBrain, "retrieveEvidence").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  async function createThesisProject(): Promise<string> {
    const res = await request(app)
      .post("/api/projects")
      .send({ outputTypeId: "OT-07" });
    return res.body.projectId;
  }

  // Replaces a test that asserted the keyword-heuristic fallback panel (invented
  // examiner names and a fixed "Viva Voce Standard" rigour score), which was
  // shown whenever AI failed. The route now returns only the AI's questions
  // or an honest error (PRODUCT_AUDIT P0-9).
  it("POST /viva-simulate returns the AI's examiner questions for the candidate's thesis", async () => {
    const projectId = await createThesisProject();
    const brain = mockBrain({
      examinerPersona: "Senior External Examiner, Distributed Systems",
      examinerRigorScore: "High",
      questions: [
        { id: "q1", category: "Theory", examinerQuestion: "Why non-Markovian memory?", assessmentFocus: "Framing", suggestedRebuttalStructure: ["a", "b"] },
      ],
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/thesis/viva-simulate`)
      .set(AI)
      .send({
        title: "Non-Markovian Memory Topologies in Autonomous Consensus Networks",
        degreeLevel: "PhD Dissertation",
        researchQuestions: ["How do non-Markovian memory architectures mitigate consensus latency?"],
        methodology: "Simulation",
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toContain("Non-Markovian Memory Topologies");
    expect(res.body.examinerPersona).toBe("Senior External Examiner, Distributed Systems");
    expect(res.body.questions).toEqual([
      { id: "q1", category: "Theory", examinerQuestion: "Why non-Markovian memory?", assessmentFocus: "Framing", suggestedRebuttalStructure: ["a", "b"] },
    ]);
    expect(String(brain.mock.calls[0][0].userPrompt)).toContain("mitigate consensus latency");
  });

  it("POST /viva-simulate asks for the user's own research questions instead of inventing them", async () => {
    const projectId = await createThesisProject();
    const brain = mockBrain({ questions: [] });
    const res = await request(app)
      .post(`/api/projects/${projectId}/thesis/viva-simulate`)
      .set(AI)
      .send({ title: "A thesis with no questions yet" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/research question/i);
    expect(brain).not.toHaveBeenCalled();
  });

  it("POST /viva-simulate reports a failed AI call and returns no questions", async () => {
    const projectId = await createThesisProject();
    vi.spyOn(scholarBrain, "complete").mockRejectedValue(new Error("provider 500"));
    const res = await request(app)
      .post(`/api/projects/${projectId}/thesis/viva-simulate`)
      .set(AI)
      .send({ title: "T", researchQuestions: ["RQ1?"] });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("ai_unavailable");
    expect(res.body.questions).toBeUndefined();
  });

  it("POST /viva-simulate asks the user to connect a provider when none is set", async () => {
    const projectId = await createThesisProject();
    const res = await request(app)
      .post(`/api/projects/${projectId}/thesis/viva-simulate`)
      .send({ title: "T", researchQuestions: ["RQ1?"] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ai_provider_required");
  });

  it("POST /viva-simulate 404s when project does not exist (IDOR protection)", async () => {
    const res = await request(app)
      .post("/api/projects/proj-ghost-thesis/thesis/viva-simulate")
      .send({ title: "Unowned Thesis" });

    expect(res.status).toBe(404);
  });

  // Replaces a test that asserted the heuristic audit (a score floored at 68 and an
  // always-passing "zero unverified citations detected" check), shown whenever AI
  // failed. The route now returns only the AI's audit or an honest error (P0-9).
  it("POST /chapter-audit returns the AI audit for the user's chapters", async () => {
    const projectId = await createThesisProject();
    mockBrain({
      totalChapters: 2,
      alignmentScore: 58,
      coherenceStatus: "Findings chapter missing",
      crossChapterChecks: [
        { check: "Research Question Propagation", status: "warn", details: "RQ2 has no findings yet." },
        { check: "Citations", status: "unknown", details: "Not checked." },
      ],
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/thesis/chapter-audit`)
      .set(AI)
      .send({
        chapters: [
          { chapterNumber: 1, title: "Introduction & Context", wordCount: 4500, targetWordCount: 6000, status: "drafting" },
          { chapterNumber: 2, title: "Theoretical Foundations", wordCount: 8000, targetWordCount: 12000, status: "reviewed" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.audit.alignmentScore).toBe(58);
    expect(res.body.audit.coherenceStatus).toBe("Findings chapter missing");
    // An unrecognised status is shown as a warning, never as a pass.
    expect(res.body.audit.crossChapterChecks.map((c: { status: string }) => c.status)).toEqual(["warn", "warn"]);
  });

  it("POST /chapter-audit asks for chapters instead of auditing a placeholder outline", async () => {
    const projectId = await createThesisProject();
    const brain = mockBrain({});
    const res = await request(app).post(`/api/projects/${projectId}/thesis/chapter-audit`).set(AI).send({});
    expect(res.status).toBe(400);
    expect(brain).not.toHaveBeenCalled();
  });

  it("POST /chapter-audit reports an unusable AI answer instead of scoring it", async () => {
    const projectId = await createThesisProject();
    mockBrain({ coherenceStatus: "no score" });
    const res = await request(app)
      .post(`/api/projects/${projectId}/thesis/chapter-audit`)
      .set(AI)
      .send({ chapters: [{ chapterNumber: 1, title: "Intro", wordCount: 10, targetWordCount: 100, status: "drafting" }] });
    expect(res.status).toBe(502);
    expect(res.body.audit).toBeUndefined();
  });

  it("POST /chapter-audit 404s when project does not exist", async () => {
    const res = await request(app)
      .post("/api/projects/proj-ghost-thesis/thesis/chapter-audit")
      .send({ chapters: [] });

    expect(res.status).toBe(404);
  });
});
