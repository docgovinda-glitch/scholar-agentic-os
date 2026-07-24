import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { LiteratureReviewAgent } from "../literatureReview";
import type { AgentContext } from "../types";
import type { CanonicalReference } from "../../citation_compliance/model/reference";
import { SkillRegistry } from "../../skills/registry";
import { runSkill } from "../../skills/executor";
import { LiteratureReviewSkill } from "../../skills/literatureReviewSkill";

const { mockDiscoverJournalCandidates } = vi.hoisted(() => ({ mockDiscoverJournalCandidates: vi.fn() }));
vi.mock("../../services/journalRetrievalService", () => ({
  discoverJournalCandidates: mockDiscoverJournalCandidates,
}));

const { mockDiscoverLiterature } = vi.hoisted(() => ({ mockDiscoverLiterature: vi.fn() }));
vi.mock("../../services/literatureRetrievalService", () => ({
  discoverLiterature: mockDiscoverLiterature,
}));

function ref(overrides: Partial<CanonicalReference> = {}): CanonicalReference {
  return {
    kind: "journal-article",
    title: "A Study",
    authors: [],
    source: "Journal of Testing",
    ...overrides,
  } as CanonicalReference;
}

// Exercises the real production wiring: the same SkillRegistry singleton and
// runSkill helper that agentService.ts's createAgentContext() uses, not a mock.
function createTestAgentContext(localStudies: CanonicalReference[] = []): AgentContext {
  return {
    log: () => {},
    config: {},
    emit: () => {},
    getReferences: async () => localStudies,
    runSkill: (skillId, input) => runSkill(skillId, input),
  };
}

describe("LiteratureReviewAgent -> LiteratureReviewSkill (native skill round trip)", () => {
  beforeAll(() => {
    SkillRegistry.getInstance().register(new LiteratureReviewSkill());
  });

  beforeEach(() => {
    mockDiscoverLiterature.mockReset();
    // Default: no web studies found, same as the old stub's always-[] behavior,
    // unless a specific test below overrides this to assert real data flows through.
    mockDiscoverLiterature.mockResolvedValue({ results: [], sourceErrors: [] });
  });

  it("delegates to the registered literature-review skill and returns a full, unchanged-shape review", async () => {
    mockDiscoverJournalCandidates.mockResolvedValue({
      results: [
        { name: "Journal of Real Retrieval", publisher: "Real Publisher", issn: "1234-5678", scopeFit: "Good fit", ranking: "Not available", feeStatus: "Not available", submissionOpenness: "Open", reviewContext: "Peer reviewed", whyFit: "Matches discipline", source: "Crossref" },
      ],
      sourceErrors: [],
    });

    const agent = new LiteratureReviewAgent();
    const context = createTestAgentContext([
      ref({ doi: "10.1/a" } as Partial<CanonicalReference>),
      ref({ doi: "10.1/a" } as Partial<CanonicalReference>), // duplicate DOI
      ref({ canonicalKey: "b-key" } as Partial<CanonicalReference>),
    ]);

    const result = await agent.execute(
      { researchQuestions: ["What is X?"], discipline: "Computer Science" },
      context
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Same values as the pre-refactor behavior — this is a pure logic move.
    expect(result.data.executiveSummary).toContain("What is X?");
    expect(result.data.themes).toHaveLength(1);
    expect(result.data.themes[0].name).toBe("Core Research Themes");
    expect(result.data.researchGaps).toHaveLength(1);
    expect(result.data.researchGaps[0].description).toBe("Limited recent studies on the topic");
    expect(result.data.recommendedSearchTerms).toEqual(["recent", "2024", "2025"]);
    expect(result.data.diagnostics.localStudies).toBe(3);
    expect(result.data.diagnostics.duplicatesRemoved).toBe(1);

    // The fixed behavior: real, retrieved journal names, not the old hardcoded stub.
    expect(mockDiscoverJournalCandidates).toHaveBeenCalledWith("Computer Science");
    expect(result.data.recommendedJournals).toEqual(["Journal of Real Retrieval"]);
    expect(result.data.recommendedJournals).not.toEqual(["Nature", "Science", "IEEE Transactions"]);

    expect(result.diagnostics?.modeUsed).toBe("deterministic");
    expect(typeof result.diagnostics?.executionTimeMs).toBe("number");
  });

  it("falls back to the first research question for the journal query when no discipline is given", async () => {
    mockDiscoverJournalCandidates.mockResolvedValue({ results: [], sourceErrors: [] });

    const agent = new LiteratureReviewAgent();
    const result = await agent.execute({ researchQuestions: ["Quantum computing error correction"] }, createTestAgentContext());

    expect(result.ok).toBe(true);
    expect(mockDiscoverJournalCandidates).toHaveBeenCalledWith("Quantum computing error correction");
  });

  it("returns an honest empty list (not a fabricated one) when journal retrieval fails", async () => {
    mockDiscoverJournalCandidates.mockRejectedValue(new Error("All journal sources failed: Crossref: network error"));

    const agent = new LiteratureReviewAgent();
    const result = await agent.execute({ researchQuestions: ["Something"], discipline: "Biology" }, createTestAgentContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.recommendedJournals).toEqual([]);
  });

  it("fails cleanly when the context has no runSkill wired (regression guard for the old no-op stub)", async () => {
    const agent = new LiteratureReviewAgent();
    const context: AgentContext = { log: () => {}, config: {}, emit: () => {} };

    const result = await agent.execute({ researchQuestions: ["Unreachable"] }, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.type).toBe("EXECUTION_ERROR");
  });

  it("works with no getReferences on the context (defaults to zero local studies)", async () => {
    mockDiscoverJournalCandidates.mockResolvedValue({ results: [], sourceErrors: [] });
    const agent = new LiteratureReviewAgent();
    const context: AgentContext = { log: () => {}, config: {}, emit: () => {}, runSkill: (id, input) => runSkill(id, input) };

    const result = await agent.execute({ researchQuestions: ["Q"] }, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.diagnostics.localStudies).toBe(0);
  });

  // Agent-UI adapter Step 2a (docs/planning/agent-ui-adapter-scoping.md):
  // fetchWebStudies() was a stub always returning []. These fail against that
  // stub (diagnostics.webStudies stayed 0 and no query reached the real
  // service) and pass once it calls literatureRetrievalService.discoverLiterature
  // for real.
  describe("fetchWebStudies (Step 2a fix — real retrieval, not a stub)", () => {
    beforeEach(() => {
      mockDiscoverJournalCandidates.mockResolvedValue({ results: [], sourceErrors: [] });
    });

    it("calls discoverLiterature with the joined research questions and feeds real results into the review", async () => {
      mockDiscoverLiterature.mockResolvedValue({
        results: [
          {
            title: "A Real Retrieved Paper",
            url: "https://doi.org/10.1/real",
            authors: "J. Doe",
            year: "2024",
            venue: "Journal of Real Retrieval",
            abstract: "",
            citationCount: 5,
            source: "Crossref",
          },
        ],
        sourceErrors: [],
      });

      const agent = new LiteratureReviewAgent();
      const result = await agent.execute({ researchQuestions: ["What is X?", "How does Y work?"] }, createTestAgentContext());

      expect(mockDiscoverLiterature).toHaveBeenCalledWith("What is X? How does Y work?");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.diagnostics.webStudies).toBe(1);
    });

    it("does not call discoverLiterature in deterministic mode (offline path unaffected)", async () => {
      mockDiscoverJournalCandidates.mockResolvedValue({ results: [], sourceErrors: [] });
      const agent = new LiteratureReviewAgent();
      const result = await agent.execute(
        { researchQuestions: ["What is X?"], executionMode: "deterministic" },
        createTestAgentContext()
      );

      expect(mockDiscoverLiterature).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.diagnostics.webStudies).toBe(0);
    });

    it("returns an honest empty list (not a fabricated one) when web literature retrieval fails entirely", async () => {
      mockDiscoverLiterature.mockRejectedValue(new Error("All literature sources failed: Crossref: network error"));

      const agent = new LiteratureReviewAgent();
      const result = await agent.execute({ researchQuestions: ["Something"] }, createTestAgentContext());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.diagnostics.webStudies).toBe(0);
    });

    it("deduplicates a web study against a local study sharing the same DOI", async () => {
      mockDiscoverLiterature.mockResolvedValue({
        results: [
          {
            title: "Duplicate Paper",
            url: "https://doi.org/10.1/dup",
            authors: "A. Author",
            year: "2023",
            venue: "Some Journal",
            abstract: "",
            citationCount: null,
            source: "OpenAlex",
          },
        ],
        sourceErrors: [],
      });

      const agent = new LiteratureReviewAgent();
      const context = createTestAgentContext([ref({ doi: "10.1/dup" } as Partial<CanonicalReference>)]);
      const result = await agent.execute({ researchQuestions: ["Something"] }, context);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.diagnostics.localStudies).toBe(1);
      expect(result.data.diagnostics.webStudies).toBe(1);
      expect(result.data.diagnostics.duplicatesRemoved).toBe(1);
    });
  });
});
