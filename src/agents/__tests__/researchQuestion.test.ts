import { describe, it, expect, beforeAll } from "vitest";
import { ResearchQuestionAgent } from "../researchQuestion";
import type { AgentContext } from "../types";
import type { KnowledgeGapReport, KnowledgeGap } from "../knowledgeGap";
import { SkillRegistry } from "../../skills/registry";
import { runSkill } from "../../skills/executor";
import { ResearchQuestionSkill } from "../../skills/researchQuestionSkill";

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

  it("[flagged, not fixed in this pass] recommendedDatasets is a hardcoded single-item stub regardless of input — same category as the journal-recommendation fabrications fixed elsewhere today", async () => {
    const agent = new ResearchQuestionAgent();
    const report = gapReport([gap()]);

    const result = await agent.execute({ knowledgeGapReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendedDatasets).toEqual(["dataset-1"]);
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
