import { describe, it, expect, beforeAll } from "vitest";
import { StatisticalAnalysisAdvisor } from "../statisticalAnalysis";
import type { AgentContext } from "../types";
import type { ResearchQuestionReport, ResearchQuestion } from "../researchQuestion";
import type { MethodologyReport, MethodologyRecommendation } from "../methodologyAdvisor";
import { SkillRegistry } from "../../skills/registry";
import { runSkill } from "../../skills/executor";
import { StatisticalAnalysisSkill } from "../../skills/statisticalAnalysisSkill";

// Exercises the real production wiring: the same SkillRegistry singleton and
// runSkill helper that agentService.ts's createAgentContext() uses, not a mock.
function createContext(): AgentContext {
  return { log: () => {}, config: {}, emit: () => {}, runSkill: (skillId, input) => runSkill(skillId, input) };
}

function question(overrides: Partial<ResearchQuestion> = {}): ResearchQuestion {
  return {
    id: "rq-0",
    primary: true,
    text: "What is X?",
    justification: "",
    noveltyScore: 0.6,
    clarityScore: 0.85,
    significanceScore: 0.8,
    feasibilityScore: 0.8,
    publicationPotentialScore: 0.8,
    variables: ["v1"],
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

function methodologyReport(paradigm: MethodologyRecommendation["paradigm"]): MethodologyReport {
  const rec: MethodologyRecommendation = {
    paradigm,
    design: "survey",
    methods: [],
    sampling: { approach: "probability", sampleSize: 30, justification: "" },
    instruments: [],
    dataCollection: [],
    analysis: { approach: "statistical", techniques: [] },
    validity: { strategies: [], justification: "" },
    reliability: { strategies: [], justification: "" },
    ethics: { items: [], requiredApprovals: [] },
    limitations: [],
    risks: [],
    confidence: 0.85,
  };
  return {
    executiveSummary: "",
    primaryRecommendation: rec,
    alternativeRecommendations: [],
    justification: "",
    assumptions: [],
    confidence: 0.85,
  };
}

describe("StatisticalAnalysisAdvisor -> StatisticalAnalysisSkill (native skill round trip)", () => {
  beforeAll(() => {
    SkillRegistry.getInstance().register(new StatisticalAnalysisSkill());
  });

  it("fails cleanly when the context has no runSkill wired (regression guard for the old no-op stub)", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const context: AgentContext = { log: () => {}, config: {}, emit: () => {} };

    const result = await agent.execute({}, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.type).toBe("EXECUTION_ERROR");
  });

  it("always recommends descriptive statistics plus an effect-size analysis", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const result = await agent.execute({ variables: ["v1"] }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analyses.find((a) => a.id === "descriptive-1")).toBeDefined();
    expect(result.data.analyses.find((a) => a.id === "effect-1")).toBeDefined();
  });

  it("recommends a t-test for a single quantitative variable", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const result = await agent.execute(
      { methodologyReport: methodologyReport("quantitative"), variables: ["v1"] },
      createContext()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analyses.find((a) => a.id === "inferential-1")).toMatchObject({ type: "t-test", software: "SPSS/R" });
  });

  it("recommends ANOVA for 2-5 quantitative variables", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const result = await agent.execute(
      { methodologyReport: methodologyReport("quantitative"), variables: ["v1", "v2", "v3"] },
      createContext()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analyses.find((a) => a.id === "inferential-2")).toMatchObject({ type: "ANOVA" });
  });

  it("recommends multiple regression for more than 5 quantitative variables", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const result = await agent.execute(
      { methodologyReport: methodologyReport("quantitative"), variables: ["v1", "v2", "v3", "v4", "v5", "v6"] },
      createContext()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analyses.find((a) => a.id === "inferential-3")).toMatchObject({ type: "multiple-regression", software: "R/Python" });
  });

  it("recommends thematic analysis for a qualitative paradigm", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const result = await agent.execute(
      { methodologyReport: methodologyReport("qualitative"), variables: ["v1"] },
      createContext()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analyses.find((a) => a.id === "qualitative-1")).toMatchObject({ type: "thematic-analysis" });
  });

  it("splits variables into qualitative and quantitative components for mixed-methods", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const result = await agent.execute(
      { methodologyReport: methodologyReport("mixed-methods"), variables: ["v1", "v2", "v3", "v4"] },
      createContext()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mixed1 = result.data.analyses.find((a) => a.id === "mixed-1");
    const mixed2 = result.data.analyses.find((a) => a.id === "mixed-2");
    expect(mixed1?.variables).toEqual(["v1", "v2"]);
    expect(mixed2?.variables).toEqual(["v3", "v4"]);
  });

  it("infers a quantitative paradigm from variables when no methodology report is given", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const result = await agent.execute({ variables: ["v1"] }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analyses.find((a) => a.id === "inferential-1")).toBeDefined();
  });

  it("recommends boxplot/bar-chart for t-test/ANOVA and always includes a default histogram", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const result = await agent.execute(
      { methodologyReport: methodologyReport("quantitative"), variables: ["v1"] },
      createContext()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const types = result.data.visualizations.map((v) => v.type);
    expect(types).toContain("boxplot");
    expect(types).toContain("bar-chart");
    expect(types).toContain("histogram");
  });

  it("derives variables from research questions when not explicitly provided", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const report = questionReport([question({ variables: ["from-question"] })]);
    const result = await agent.execute({ researchQuestionReport: report }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.analyses[0].variables).toEqual(["from-question"]);
  });

  it("computes the executive summary from the actual generated analyses", async () => {
    const agent = new StatisticalAnalysisAdvisor();
    const result = await agent.execute({ variables: ["v1"] }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.executiveSummary).toContain(String(result.data.analyses.length));
  });
});
