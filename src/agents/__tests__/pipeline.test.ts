// Agent-UI adapter Step 2b (docs/planning/agent-ui-adapter-scoping.md):
// tests the orchestrator's chaining logic in isolation — each agent class is
// mocked at the module boundary with a lightweight execute() that records
// exactly what input it received and returns a small, distinct fake report,
// so these tests assert the WIRING (which upstream data reaches which
// downstream input field) rather than re-testing any single agent's own
// domain logic (already covered by that agent's own test file).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_STATE, PaperProject } from "../../types";

const { mockPlanner, mockLiterature, mockKnowledgeGap, mockResearchQuestion, mockMethodology, mockStatistical, mockIntegrity } = vi.hoisted(() => ({
  mockPlanner: vi.fn(),
  mockLiterature: vi.fn(),
  mockKnowledgeGap: vi.fn(),
  mockResearchQuestion: vi.fn(),
  mockMethodology: vi.fn(),
  mockStatistical: vi.fn(),
  mockIntegrity: vi.fn(),
}));

vi.mock("../researchPlanner", () => ({ ResearchPlannerAgent: class { execute = mockPlanner; } }));
vi.mock("../literatureReview", () => ({ LiteratureReviewAgent: class { execute = mockLiterature; } }));
vi.mock("../knowledgeGap", () => ({ KnowledgeGapAgent: class { execute = mockKnowledgeGap; } }));
vi.mock("../researchQuestion", () => ({ ResearchQuestionAgent: class { execute = mockResearchQuestion; } }));
vi.mock("../methodologyAdvisor", () => ({ MethodologyAdvisorAgent: class { execute = mockMethodology; } }));
vi.mock("../statisticalAnalysis", () => ({ StatisticalAnalysisAdvisor: class { execute = mockStatistical; } }));
vi.mock("../integrityReviewer", () => ({ IntegrityReviewerAgent: class { execute = mockIntegrity; } }));

// pipeline.ts's default context comes from agentService.ts's createAgentContext(),
// which also imports and `new`s all 7 real agent classes as a side effect of
// module load (to register them for the panel-facing executeAgent() path) —
// mocked here too so that registration doesn't run against/interfere with the
// mocks above, and so this test doesn't need real skill registrations at all
// (a fake, no-op context is passed explicitly to runResearchPipeline below).
vi.mock("../../services/agentService", () => ({ createAgentContext: () => ({ log: () => {}, config: {}, emit: () => {} }) }));

import { runResearchPipeline } from "../pipeline";

const FAKE_CONTEXT = { log: () => {}, config: {}, emit: () => {} };

function ok<T>(data: T) {
  return { ok: true as const, data, diagnostics: { modeUsed: "hybrid" as const, executionTimeMs: 1 } };
}
function fail(message: string) {
  return { ok: false as const, error: { type: "EXECUTION_ERROR" as const, message }, diagnostics: { modeUsed: "hybrid" as const, executionTimeMs: 1 } };
}

function project(overrides: Partial<PaperProject> = {}): PaperProject {
  return { ...DEFAULT_STATE("tester"), ...overrides };
}

beforeEach(() => {
  mockPlanner.mockReset().mockResolvedValue(ok({ projectSummary: "plan" }));
  mockLiterature.mockReset().mockResolvedValue(ok({ executiveSummary: "lit" }));
  mockKnowledgeGap.mockReset().mockResolvedValue(ok({ executiveSummary: "gaps" }));
  mockResearchQuestion.mockReset().mockResolvedValue(ok({ executiveSummary: "questions" }));
  mockMethodology.mockReset().mockResolvedValue(ok({ executiveSummary: "methodology" }));
  mockStatistical.mockReset().mockResolvedValue(ok({ executiveSummary: "stats" }));
  mockIntegrity.mockReset().mockResolvedValue(ok({ executiveSummary: "integrity" }));
});

describe("runResearchPipeline — chain wiring", () => {
  it("feeds researchPlan + literatureReview (the two roots) into knowledgeGap", async () => {
    await runResearchPipeline(project({ title: "A Title" }), FAKE_CONTEXT as any);

    const kgInput = mockKnowledgeGap.mock.calls[0][0];
    expect(kgInput.researchPlan).toEqual({ projectSummary: "plan" });
    expect(kgInput.literatureReview).toEqual({ executiveSummary: "lit" });
  });

  it("feeds researchPlan + knowledgeGapReport into researchQuestion", async () => {
    await runResearchPipeline(project({ title: "A Title" }), FAKE_CONTEXT as any);

    const rqInput = mockResearchQuestion.mock.calls[0][0];
    expect(rqInput.researchPlan).toEqual({ projectSummary: "plan" });
    expect(rqInput.knowledgeGapReport).toEqual({ executiveSummary: "gaps" });
  });

  it("feeds researchPlan + researchQuestionReport into methodologyAdvisor", async () => {
    await runResearchPipeline(project({ title: "A Title" }), FAKE_CONTEXT as any);

    const maInput = mockMethodology.mock.calls[0][0];
    expect(maInput.researchPlan).toEqual({ projectSummary: "plan" });
    expect(maInput.researchQuestionReport).toEqual({ executiveSummary: "questions" });
  });

  it("feeds researchQuestionReport + methodologyReport into statisticalAnalysis", async () => {
    await runResearchPipeline(project({ title: "A Title" }), FAKE_CONTEXT as any);

    const saInput = mockStatistical.mock.calls[0][0];
    expect(saInput.researchQuestionReport).toEqual({ executiveSummary: "questions" });
    expect(saInput.methodologyReport).toEqual({ executiveSummary: "methodology" });
  });

  it("feeds every prior report into the terminal integrityReviewer stage", async () => {
    await runResearchPipeline(project({ title: "A Title", sections: { Introduction: "Real drafted text." } }), FAKE_CONTEXT as any);

    const irInput = mockIntegrity.mock.calls[0][0];
    expect(irInput.researchPlan).toEqual({ projectSummary: "plan" });
    expect(irInput.literatureReview).toEqual({ executiveSummary: "lit" });
    expect(irInput.knowledgeGapReport).toEqual({ executiveSummary: "gaps" });
    expect(irInput.researchQuestionReport).toEqual({ executiveSummary: "questions" });
    expect(irInput.methodologyReport).toEqual({ executiveSummary: "methodology" });
    expect(irInput.statisticalAnalysisReport).toEqual({ executiveSummary: "stats" });
    expect(irInput.manuscriptText).toBe("Real drafted text.");
  });

  it("returns every stage's report in the final result", async () => {
    const result = await runResearchPipeline(project({ title: "A Title" }), FAKE_CONTEXT as any);

    expect(result.researchPlan).toEqual({ projectSummary: "plan" });
    expect(result.literatureReview).toEqual({ executiveSummary: "lit" });
    expect(result.knowledgeGapReport).toEqual({ executiveSummary: "gaps" });
    expect(result.researchQuestionReport).toEqual({ executiveSummary: "questions" });
    expect(result.methodologyReport).toEqual({ executiveSummary: "methodology" });
    expect(result.statisticalAnalysisReport).toEqual({ executiveSummary: "stats" });
    expect(result.integrityReviewReport).toEqual({ executiveSummary: "integrity" });
    expect(result.errors).toEqual([]);
  });

  it("degrades gracefully (not halt) when an early stage fails: knowledgeGap still runs with a null upstream field", async () => {
    mockLiterature.mockResolvedValue(fail("literature retrieval failed"));

    const result = await runResearchPipeline(project({ title: "A Title" }), FAKE_CONTEXT as any);

    expect(result.literatureReview).toBeNull();
    expect(result.errors).toEqual([{ agentId: "literature-review", message: "literature retrieval failed" }]);
    // The chain still proceeds — knowledgeGap still runs, just without literatureReview.
    const kgInput = mockKnowledgeGap.mock.calls[0][0];
    expect(kgInput.literatureReview).toBeUndefined();
    expect(kgInput.researchPlan).toEqual({ projectSummary: "plan" });
    expect(result.knowledgeGapReport).toEqual({ executiveSummary: "gaps" });
  });

  it("collects errors from every failed stage without halting the chain", async () => {
    mockKnowledgeGap.mockResolvedValue(fail("kg failed"));
    mockStatistical.mockResolvedValue(fail("stats failed"));

    const result = await runResearchPipeline(project({ title: "A Title" }), FAKE_CONTEXT as any);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        { agentId: "knowledge-gap", message: "kg failed" },
        { agentId: "statistical-analysis-advisor", message: "stats failed" },
      ])
    );
    expect(result.knowledgeGapReport).toBeNull();
    expect(result.statisticalAnalysisReport).toBeNull();
    // Downstream of knowledgeGap still ran (researchQuestion got null instead of halting).
    expect(result.researchQuestionReport).toEqual({ executiveSummary: "questions" });
  });

  it("falls back to the title alone for literatureReview's researchQuestions on a Stage 5 title-only project", async () => {
    await runResearchPipeline(project({ title: "A Title-Only Project", researchQuestions: "" }), FAKE_CONTEXT as any);

    const litInput = mockLiterature.mock.calls[0][0];
    expect(litInput.researchQuestions).toEqual(["A Title-Only Project"]);
  });

  it("splits multi-line researchQuestions into a real array for literatureReview", async () => {
    await runResearchPipeline(
      project({ title: "T", researchQuestions: "1. What is X?\n2. How does Y work?" }),
      FAKE_CONTEXT as any
    );

    const litInput = mockLiterature.mock.calls[0][0];
    expect(litInput.researchQuestions).toEqual(["What is X?", "How does Y work?"]);
  });
});
