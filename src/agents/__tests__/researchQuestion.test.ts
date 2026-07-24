import { describe, it, expect, beforeAll, vi, beforeEach } from "vitest";
import { ResearchQuestionAgent } from "../researchQuestion";
import type { AgentContext } from "../types";
import type { KnowledgeGapReport, KnowledgeGap } from "../knowledgeGap";
import { SkillRegistry } from "../../skills/registry";
import { runSkill } from "../../skills/executor";
import { ResearchQuestionSkill } from "../../skills/researchQuestionSkill";

const { mockDiscoverDatasets } = vi.hoisted(() => ({ mockDiscoverDatasets: vi.fn() }));
vi.mock("../../services/datasetRetrievalService", () => ({
  discoverDatasets: mockDiscoverDatasets,
}));

beforeEach(() => {
  mockDiscoverDatasets.mockReset();
  mockDiscoverDatasets.mockResolvedValue({ results: [], sourceErrors: [] });
});

// Exercises the real production wiring: the same SkillRegistry singleton and
// runSkill helper that agentService.ts's createAgentContext() uses, not a mock.
function createContext(): AgentContext {
  return { log: () => {}, config: {}, emit: () => {}, runSkill: (skillId, input) => runSkill(skillId, input) };
}

function gap(overrides: Partial<KnowledgeGap> = {}): KnowledgeGap {
  return {
    id: "gap-1",
    type: "unanswered-question",
    description: "Some gap",
    evidenceSupport: [],
    confidence: 0.9,
    noveltyScore: 0.8,
    feasibilityScore: 0.8,
    publicationPotentialScore: 0.85,
    ...overrides,
  };
}

function gapReport(gaps: KnowledgeGap[]): KnowledgeGapReport {
  return {
    executiveSummary: "",
    gaps,
    topRecommendations: { studies: [], datasets: [], journals: [] },
    diagnostics: { gapsAnalyzed: gaps.length, avgConfidence: 0.9, avgNovelty: 0.8, avgFeasibility: 0.8 },
  };
}

describe("ResearchQuestionAgent -> ResearchQuestionSkill (native skill round trip)", () => {
  beforeAll(() => {
    SkillRegistry.getInstance().register(new ResearchQuestionSkill());
  });

  it("fails cleanly when the context has no runSkill wired (regression guard for the old no-op stub)", async () => {
    const agent = new ResearchQuestionAgent();
    const context: AgentContext = { log: () => {}, config: {}, emit: () => {} };

    const result = await agent.execute({}, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.type).toBe("EXECUTION_ERROR");
  });

  it("generates one question per gap (capped at maxQuestions), with the first marked primary", async () => {
    const agent = new ResearchQuestionAgent();
    const report = gapReport([gap({ id: "g1", type: "unanswered-question" }), gap({ id: "g2", type: "temporal" })]);

    const result = await agent.execute({ knowledgeGapReport: report, maxQuestions: 5 }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.questions).toHaveLength(2);
    expect(result.data.questions[0].primary).toBe(true);
    expect(result.data.questions[1].primary).toBe(false);
    expect(result.data.questions[0].text).toBe("What factors influence the unresolved questions in this domain?");
    expect(result.data.questions[1].text).toBe("How has this domain evolved since recent evidence emerged?");
  });

  it("caps generated questions at maxQuestions", async () => {
    const agent = new ResearchQuestionAgent();
    const report = gapReport([gap({ id: "g1" }), gap({ id: "g2" }), gap({ id: "g3" })]);

    const result = await agent.execute({ knowledgeGapReport: report, maxQuestions: 2 }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.questions).toHaveLength(2);
  });

  it("flags IRB approval for human-subjects gaps only", async () => {
    const agent = new ResearchQuestionAgent();
    const report = gapReport([gap({ id: "g1", type: "human-subjects" }), gap({ id: "g2", type: "temporal" })]);

    const result = await agent.execute({ knowledgeGapReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.questions[0].ethicalConsiderations).toEqual(["IRB approval required"]);
    expect(result.data.questions[1].ethicalConsiderations).toBeUndefined();
  });

  it("generates one hypothesis and one objective per question, and dedupes extracted variables", async () => {
    const agent = new ResearchQuestionAgent();
    const report = gapReport([gap({ id: "g1" }), gap({ id: "g2" })]);

    const result = await agent.execute({ knowledgeGapReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.hypotheses).toHaveLength(2);
    expect(result.data.objectives).toHaveLength(2);
    expect(result.data.hypotheses[0].questionId).toBe(result.data.questions[0].id);
    expect(result.data.variables).toEqual(["variable-0", "variable-1"]);
  });

  it("[fixed] recommendedDatasets queries real dataset registries (DataCite) using the primary generated question, instead of a hardcoded stub", async () => {
    mockDiscoverDatasets.mockResolvedValue({
      results: [{ name: "A Real Registered Dataset", url: "https://doi.org/10.1234/real-dataset", description: "A real dataset description.", doi: "10.1234/real-dataset", source: "DataCite" }],
      sourceErrors: [],
    });
    const agent = new ResearchQuestionAgent();
    const report = gapReport([gap({ type: "unanswered-question" })]);

    const result = await agent.execute({ knowledgeGapReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockDiscoverDatasets).toHaveBeenCalledWith("What factors influence the unresolved questions in this domain?");
    expect(result.data.recommendedDatasets).toEqual(["A Real Registered Dataset — https://doi.org/10.1234/real-dataset"]);
  });

  it("returns an honest empty array, not a fabricated placeholder, when no real datasets are found", async () => {
    mockDiscoverDatasets.mockResolvedValue({ results: [], sourceErrors: [] });
    const agent = new ResearchQuestionAgent();
    const report = gapReport([gap()]);

    const result = await agent.execute({ knowledgeGapReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendedDatasets).toEqual([]);
  });

  it("does not call discoverDatasets at all when there are no generated questions to build a query from", async () => {
    const agent = new ResearchQuestionAgent();

    const result = await agent.execute({}, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockDiscoverDatasets).not.toHaveBeenCalled();
    expect(result.data.recommendedDatasets).toEqual([]);
  });

  it("computes diagnostics and executive summary from the actual generated questions", async () => {
    const agent = new ResearchQuestionAgent();
    const report = gapReport([gap({ id: "g1", noveltyScore: 0.9, feasibilityScore: 0.7 })]);

    const result = await agent.execute({ knowledgeGapReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.executiveSummary).toContain("1 research questions");
    expect(result.data.diagnostics.questionsGenerated).toBe(1);
    expect(result.data.diagnostics.hypothesesGenerated).toBe(1);
    expect(result.data.diagnostics.avgNovelty).toBe(0.9);
    expect(result.data.diagnostics.avgFeasibility).toBe(0.7);
  });

  it("returns zero questions/hypotheses/objectives with no knowledge gap report at all", async () => {
    const agent = new ResearchQuestionAgent();

    const result = await agent.execute({}, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.questions).toEqual([]);
    expect(result.data.hypotheses).toEqual([]);
    expect(result.data.objectives).toEqual([]);
    expect(result.data.diagnostics).toEqual({ questionsGenerated: 0, hypothesesGenerated: 0, avgNovelty: 0, avgFeasibility: 0 });
  });
});
