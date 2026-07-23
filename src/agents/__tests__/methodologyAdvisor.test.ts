import { describe, it, expect, beforeAll } from "vitest";
import { MethodologyAdvisorAgent } from "../methodologyAdvisor";
import type { AgentContext } from "../types";
import type { ResearchQuestionReport, ResearchQuestion } from "../researchQuestion";
import { SkillRegistry } from "../../skills/registry";
import { runSkill } from "../../skills/executor";
import { MethodologyAdvisorSkill } from "../../skills/methodologyAdvisorSkill";

// Exercises the real production wiring: the same SkillRegistry singleton and
// runSkill helper that agentService.ts's createAgentContext() uses, not a mock.
function createContext(): AgentContext {
  return { log: () => {}, config: {}, emit: () => {}, runSkill: (skillId, input) => runSkill(skillId, input) };
}

function question(overrides: Partial<ResearchQuestion> = {}): ResearchQuestion {
  return {
    id: "rq-0",
    primary: true,
    text: "What is the relationship between key factors in this research area?",
    justification: "",
    noveltyScore: 0.6,
    clarityScore: 0.85,
    significanceScore: 0.8,
    feasibilityScore: 0.8,
    publicationPotentialScore: 0.8,
    variables: ["variable-0"],
    ...overrides,
  };
}

function questionReport(questions: ResearchQuestion[]): ResearchQuestionReport {
  return {
    executiveSummary: "",
    questions,
    hypotheses: [],
    objectives: [],
    variables: questions.flatMap((q) => q.variables),
    recommendedMethodology: "",
    recommendedDatasets: [],
    confidence: 0.9,
    diagnostics: { questionsGenerated: questions.length, hypothesesGenerated: 0, avgNovelty: 0.6, avgFeasibility: 0.8 },
  };
}

describe("MethodologyAdvisorAgent -> MethodologyAdvisorSkill (native skill round trip)", () => {
  beforeAll(() => {
    SkillRegistry.getInstance().register(new MethodologyAdvisorSkill());
  });

  it("fails cleanly when the context has no runSkill wired (regression guard for the old no-op stub)", async () => {
    const agent = new MethodologyAdvisorAgent();
    const context: AgentContext = { log: () => {}, config: {}, emit: () => {} };

    const result = await agent.execute({}, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.type).toBe("EXECUTION_ERROR");
  });

  it("determines a quantitative paradigm and an experimental design for high-novelty, non-experiential questions", async () => {
    const agent = new MethodologyAdvisorAgent();
    const report = questionReport([question({ text: "What is the effect of X on Y?", noveltyScore: 0.9 })]);

    const result = await agent.execute({ researchQuestionReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.primaryRecommendation.paradigm).toBe("quantitative");
    expect(result.data.primaryRecommendation.design).toBe("experimental");
    expect(result.data.primaryRecommendation.methods).toEqual(["Randomized controlled trial", "Pre-test/post-test design"]);
  });

  it("determines a qualitative paradigm and a case-study design when questions mention lived experience", async () => {
    const agent = new MethodologyAdvisorAgent();
    const report = questionReport([question({ text: "What is the participant experience of X?" })]);

    const result = await agent.execute({ researchQuestionReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.primaryRecommendation.paradigm).toBe("qualitative");
    expect(result.data.primaryRecommendation.design).toBe("case-study");
    expect(result.data.primaryRecommendation.analysis.approach).toBe("thematic");
  });

  it("determines a mixed-methods paradigm when experiential questions exceed 2", async () => {
    const agent = new MethodologyAdvisorAgent();
    const report = questionReport([
      question({ id: "rq-0", text: "What is the experience of X?" }),
      question({ id: "rq-1", text: "What is the perception of Y?" }),
      question({ id: "rq-2", text: "What is the meaning of Z?" }),
    ]);

    const result = await agent.execute({ researchQuestionReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.primaryRecommendation.paradigm).toBe("mixed-methods");
  });

  it("computes sample size from variable count for experimental designs", async () => {
    const agent = new MethodologyAdvisorAgent();
    const report = questionReport([
      question({ text: "What is the effect of X?", noveltyScore: 0.9, variables: ["v1", "v2", "v3", "v4"] }),
    ]);

    const result = await agent.execute({ researchQuestionReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.primaryRecommendation.sampling.approach).toBe("probability");
    expect(result.data.primaryRecommendation.sampling.sampleSize).toBe(40); // max(30, 4*10)
  });

  it("generates exactly one alternative recommendation using the opposite paradigm", async () => {
    const agent = new MethodologyAdvisorAgent();
    const report = questionReport([question({ text: "What is the effect of X?" })]);

    const result = await agent.execute({ researchQuestionReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.alternativeRecommendations).toHaveLength(1);
    expect(result.data.alternativeRecommendations[0].paradigm).not.toBe(result.data.primaryRecommendation.paradigm);
  });

  it("requires IRB/Ethics Board approval only for experimental designs", async () => {
    const agent = new MethodologyAdvisorAgent();
    const experimentalReport = questionReport([question({ text: "What is the effect of X?", noveltyScore: 0.9 })]);
    const caseStudyReport = questionReport([question({ text: "What is the experience of X?" })]);

    const experimentalResult = await agent.execute({ researchQuestionReport: experimentalReport }, createContext());
    const caseStudyResult = await agent.execute({ researchQuestionReport: caseStudyReport }, createContext());

    expect(experimentalResult.ok && experimentalResult.data.primaryRecommendation.ethics.requiredApprovals).toEqual(["IRB/Ethics Board"]);
    expect(caseStudyResult.ok && caseStudyResult.data.primaryRecommendation.ethics.requiredApprovals).toEqual(["Institutional Review"]);
  });

  it("computes executive summary and justification from the actual recommendation", async () => {
    const agent = new MethodologyAdvisorAgent();
    const report = questionReport([question({ text: "What is the effect of X?" })]);

    const result = await agent.execute({ researchQuestionReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.executiveSummary).toContain(result.data.primaryRecommendation.paradigm);
    expect(result.data.justification).toContain("1 research questions");
  });

  it("falls back to a default quantitative/survey recommendation with no research question report at all", async () => {
    const agent = new MethodologyAdvisorAgent();

    const result = await agent.execute({}, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.primaryRecommendation.paradigm).toBe("quantitative");
    expect(result.data.primaryRecommendation.design).toBe("survey");
  });
});
