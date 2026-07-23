import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { KnowledgeGapAgent } from "../knowledgeGap";
import type { AgentContext } from "../types";
import type { LiteratureReview } from "../literatureReview";
import type { ResearchPlan } from "../researchPlanner";
import { SkillRegistry } from "../../skills/registry";
import { runSkill } from "../../skills/executor";
import { KnowledgeGapSkill } from "../../skills/knowledgeGapSkill";

const { mockDiscoverJournalCandidates } = vi.hoisted(() => ({ mockDiscoverJournalCandidates: vi.fn() }));
vi.mock("../../services/journalRetrievalService", () => ({
  discoverJournalCandidates: mockDiscoverJournalCandidates,
}));

// Exercises the real production wiring: the same SkillRegistry singleton and
// runSkill helper that agentService.ts's createAgentContext() uses, not a mock.
function createContext(references: unknown[] = []): AgentContext {
  return {
    log: () => {},
    config: {},
    emit: () => {},
    getReferences: async () => references as any,
    runSkill: (skillId, input) => runSkill(skillId, input),
  };
}

function literatureReview(overrides: Partial<LiteratureReview> = {}): LiteratureReview {
  return {
    executiveSummary: "",
    keyFindings: [],
    themes: [],
    evidenceMap: { methodologyDistribution: {} as any, yearDistribution: {}, journalDistribution: {} },
    researchGaps: [{ id: "rg-1", description: "gap", relatedThemes: [], suggestedSearchTerms: ["term-a", "term-b"] }],
    conflictingFindings: [],
    recommendedPapers: [],
    recommendedJournals: [],
    recommendedSearchTerms: [],
    confidence: 0.8,
    assumptions: [],
    diagnostics: { localStudies: 0, webStudies: 0, duplicatesRemoved: 0, avgEvidenceQuality: "medium" },
    ...overrides,
  };
}

describe("KnowledgeGapAgent -> KnowledgeGapSkill (native skill round trip)", () => {
  beforeAll(() => {
    SkillRegistry.getInstance().register(new KnowledgeGapSkill());
  });

  beforeEach(() => {
    // Default: no journal matches, so tests that don't care about
    // topRecommendations.journals keep seeing exactly their original expected output.
    mockDiscoverJournalCandidates.mockReset().mockResolvedValue({ results: [], sourceErrors: [] });
  });

  it("fails cleanly when the context has no runSkill wired (regression guard for the old no-op stub)", async () => {
    const agent = new KnowledgeGapAgent();
    const context: AgentContext = { log: () => {}, config: {}, emit: () => {} };

    const result = await agent.execute({}, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.type).toBe("EXECUTION_ERROR");
  });

  it("generates an unanswered-question gap from a supplied literature review", async () => {
    const agent = new KnowledgeGapAgent();
    const result = await agent.execute({ literatureReview: literatureReview() }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gaps).toHaveLength(1);
    expect(result.data.gaps[0]).toMatchObject({ id: "gap-1", type: "unanswered-question" });
    expect(result.data.gaps[0].evidenceSupport).toEqual(["term-a", "term-b"]);
  });

  it("generates one contradictory-finding gap per conflicting finding", async () => {
    const agent = new KnowledgeGapAgent();
    const review = literatureReview({
      conflictingFindings: [
        { id: "cf-1", claim: "X causes Y", supportingStudies: ["s1"], opposingStudies: ["s2"] },
      ],
    });

    const result = await agent.execute({ literatureReview: review }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const contra = result.data.gaps.find((g) => g.type === "contradictory-finding");
    expect(contra).toMatchObject({ id: "gap-contra-0", description: "Conflicting evidence on: X causes Y" });
    expect(contra?.evidenceSupport).toEqual(["s1", "s2"]);
  });

  it("generates one unanswered-question gap per missing-information item in a research plan", async () => {
    const agent = new KnowledgeGapAgent();
    const plan: ResearchPlan = {
      projectId: "p1",
      projectSummary: "",
      phases: [],
      milestones: [],
      dependencies: [],
      requiredSkills: [],
      requiredAgents: [],
      confidence: 0.8,
      assumptions: [],
      recommendations: [],
      estimatedEffortDays: 0,
      missingInformation: ["No methodology specified", "No target journal specified"],
    };

    const result = await agent.execute({ researchPlan: plan }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gaps).toHaveLength(2);
    expect(result.data.gaps.map((g) => g.id)).toEqual(["gap-miss-0", "gap-miss-1"]);
  });

  it("flags a temporal gap when old references outnumber recent ones more than 2:1", async () => {
    const agent = new KnowledgeGapAgent();
    const references = [
      { publicationDate: "2010-01-01" },
      { publicationDate: "2011-01-01" },
      { publicationDate: "2012-01-01" },
      { publicationDate: "2021-01-01" },
    ];

    const result = await agent.execute({}, createContext(references));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gaps.find((g) => g.type === "temporal")).toBeDefined();
  });

  it("does not flag a temporal gap when recent references are well-represented", async () => {
    const agent = new KnowledgeGapAgent();
    const references = [{ publicationDate: "2021-01-01" }, { publicationDate: "2022-01-01" }, { publicationDate: "2010-01-01" }];

    const result = await agent.execute({}, createContext(references));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gaps.find((g) => g.type === "temporal")).toBeUndefined();
  });

  it("recommends real, retrieved journals using the research plan's project summary as the query", async () => {
    mockDiscoverJournalCandidates.mockResolvedValue({
      results: [
        { name: "Journal of Real Retrieval", publisher: "Real Publisher", issn: "1234-5678", scopeFit: "Good fit", ranking: "Not available", feeStatus: "Not available", submissionOpenness: "Open", reviewContext: "Peer reviewed", whyFit: "Matches topic", source: "Crossref" },
      ],
      sourceErrors: [],
    });

    const agent = new KnowledgeGapAgent();
    const plan: ResearchPlan = {
      projectId: "p1",
      projectSummary: "Effects of sleep deprivation on working memory",
      phases: [],
      milestones: [],
      dependencies: [],
      requiredSkills: [],
      requiredAgents: [],
      confidence: 0.8,
      assumptions: [],
      recommendations: [],
      estimatedEffortDays: 0,
      missingInformation: [],
    };

    const result = await agent.execute({ literatureReview: literatureReview(), researchPlan: plan }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockDiscoverJournalCandidates).toHaveBeenCalledWith("Effects of sleep deprivation on working memory");
    expect(result.data.topRecommendations.journals).toEqual(["Journal of Real Retrieval"]);
    expect(result.data.topRecommendations.journals).not.toEqual(["Nature", "Science", "IEEE Transactions"]);
  });

  it("falls back to the literature review's first research gap's search terms when no research plan is given", async () => {
    mockDiscoverJournalCandidates.mockResolvedValue({ results: [], sourceErrors: [] });

    const agent = new KnowledgeGapAgent();
    const result = await agent.execute({ literatureReview: literatureReview() }, createContext());

    expect(result.ok).toBe(true);
    expect(mockDiscoverJournalCandidates).toHaveBeenCalledWith("term-a term-b");
  });

  it("returns an honest empty list (not a fabricated one) when journal retrieval fails", async () => {
    mockDiscoverJournalCandidates.mockRejectedValue(new Error("All journal sources failed: Crossref: network error"));

    const agent = new KnowledgeGapAgent();
    const result = await agent.execute({ literatureReview: literatureReview() }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.topRecommendations.journals).toEqual([]);
  });

  it("returns an empty journal list without calling the network when there's no usable query at all", async () => {
    const agent = new KnowledgeGapAgent();
    const result = await agent.execute({}, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockDiscoverJournalCandidates).not.toHaveBeenCalled();
    expect(result.data.topRecommendations.journals).toEqual([]);
  });

  it("computes executive summary and diagnostics from the actual gaps found", async () => {
    const agent = new KnowledgeGapAgent();
    const references = [{ publicationDate: "2010-01-01" }, { publicationDate: "2011-01-01" }, { publicationDate: "2021-01-01" }];
    const result = await agent.execute({ literatureReview: literatureReview(), researchPlan: undefined }, createContext(references));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.executiveSummary).toContain(String(result.data.gaps.length));
    expect(result.data.diagnostics.gapsAnalyzed).toBe(result.data.gaps.length);
    expect(result.data.diagnostics.avgConfidence).toBeGreaterThan(0);
  });

  it("returns zero gaps and zeroed diagnostics with no input at all", async () => {
    const agent = new KnowledgeGapAgent();
    const result = await agent.execute({}, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.gaps).toEqual([]);
    expect(result.data.diagnostics).toEqual({ gapsAnalyzed: 0, avgConfidence: 0, avgNovelty: 0, avgFeasibility: 0 });
  });
});
