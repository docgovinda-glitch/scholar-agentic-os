import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore, type ProjectRecord } from "../../../src/services/store/projectStore.ts";
import { safeParseAnswerField } from "../../../src/shared/projectStateSchema.ts";
import {
  allocateWordBudget,
  countExactWords,
  type WordBudgetBlueprint,
} from "../../src/utils/wordBudgetAllocator.ts";
import {
  formatCitationLedger,
  scrubCitations,
  checkChronologicalAnachronism,
  type VerifiedSourceItem,
} from "../../src/utils/citationLockScrubber.ts";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function createTestProject(projectId: string = "proj-journal-test"): Promise<string> {
  const store = getProjectStore();
  const project: ProjectRecord = {
    projectId,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-10",
    answers: {
      working_title: "Quantum Key Distribution Under Non-Markovian Channel Noise",
      research_area: "Quantum Information",
      core_problem: "Epistemic variance and decoy state authentication bounds",
    },
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.save(project);
  return project.projectId;
}

describe("Journal Step A: Sub-Section Word Budget Allocator", () => {
  it("allocateWordBudget partitions a 6,000-word target into 350-500 word sub-sections summing to exactly 6,000 words", () => {
    const blueprint: WordBudgetBlueprint = allocateWordBudget("proj-123", 6000, "IMRaD");

    expect(blueprint.targetTotalWords).toBe(6000);
    expect(blueprint.allocatedTotalWords).toBe(6000);
    expect(blueprint.template).toBe("IMRaD");

    const allSubSections = blueprint.sections.flatMap((s) => s.subSections);
    expect(allSubSections.length).toBeGreaterThan(0);

    let sumWords = 0;
    for (const sub of allSubSections) {
      expect(sub.targetWords).toBeGreaterThanOrEqual(350);
      expect(sub.targetWords).toBeLessThanOrEqual(500);
      sumWords += sub.targetWords;
    }

    expect(sumWords).toBe(6000);
  });

  it("allocateWordBudget correctly handles Theoretical and SystematicReview templates", () => {
    const theoBlueprint = allocateWordBudget("proj-theo", 5000, "Theoretical");
    expect(theoBlueprint.allocatedTotalWords).toBe(5000);
    for (const sub of theoBlueprint.sections.flatMap((s) => s.subSections)) {
      expect(sub.targetWords).toBeGreaterThanOrEqual(350);
      expect(sub.targetWords).toBeLessThanOrEqual(500);
    }

    const srBlueprint = allocateWordBudget("proj-sr", 7000, "SystematicReview");
    expect(srBlueprint.allocatedTotalWords).toBe(7000);
    for (const sub of srBlueprint.sections.flatMap((s) => s.subSections)) {
      expect(sub.targetWords).toBeGreaterThanOrEqual(350);
      expect(sub.targetWords).toBeLessThanOrEqual(500);
    }
  });

  it("POST /api/projects/:id/agentic/allocate-budget creates blueprint and persists into project state", async () => {
    const projectId = await createTestProject();

    const res = await request(app)
      .post(`/api/projects/${projectId}/agentic/allocate-budget`)
      .send({
        targetTotalWords: 6000,
        template: "IMRaD",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.blueprint).toBeDefined();
    expect(res.body.blueprint.allocatedTotalWords).toBe(6000);

    // Verify project persistence
    const saved = await getProjectStore().get(projectId);
    expect(saved?.answers.word_budget_blueprint).toBeDefined();
    const parsed = safeParseAnswerField<WordBudgetBlueprint>(saved!.answers.word_budget_blueprint, {} as WordBudgetBlueprint);
    expect(parsed.targetTotalWords).toBe(6000);
    expect(parsed.sections.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Journal Step A: Citation Lock Scrubber & Chronological Checker", () => {
  const verifiedSources: VerifiedSourceItem[] = [
    {
      id: "src_1",
      authors: ["Smith, J.", "Doe, A."],
      year: 2023,
      title: "Decoy State Protocols in Quantum Key Distribution",
      doi: "10.1038/s41586-023-0001",
      stance: "Supporting",
      keyFindings: "Demonstrated 94.2% fidelity under turbulent atmospheric noise.",
    },
    {
      id: "src_2",
      authors: "Bose, S. & Mukherjee, R.",
      year: 2021,
      title: "Triangulated Error Bounds for Discrete Variable Systems",
      stance: "Methodological",
      keyFindings: "Formulated asymptotic bounds reducing computational overhead.",
    },
  ];

  it("formatCitationLedger formats registered sources into strict prompt ledger", () => {
    const { ledgerPrompt, sourceMap } = formatCitationLedger(verifiedSources);

    expect(ledgerPrompt).toContain("[EXCLUSIVE CITATION LEDGER");
    expect(ledgerPrompt).toContain("[CITE:src_1]");
    expect(ledgerPrompt).toContain("Decoy State Protocols");
    expect(ledgerPrompt).toContain("[CITE:src_2]");
    expect(sourceMap.has("src_1")).toBe(true);
    expect(sourceMap.has("src_2")).toBe(true);
  });

  it("scrubCitations converts valid [CITE:src_id] tokens into formatted APA 7 citations", () => {
    const rawText = "Recent experimental findings indicate significant fidelity gains [CITE:src_1].";
    const result = scrubCitations(rawText, verifiedSources);

    expect(result.resolvedCitationsCount).toBe(1);
    expect(result.unverifiedClaimsCount).toBe(0);
    expect(result.scrubbedText).toContain("(Smith & Doe, 2023)");
    expect(result.scrubbedText).not.toContain("[CITE:src_1]");
  });

  it("scrubCitations strips hallucinated (FakeAuthor, 2022) citations and replaces with unverified claim placeholder", () => {
    const textWithHallucination =
      "Conventional architectures exhibit asymptotic degradation (FakeAuthor, 2022), leading to key failure.";
    const result = scrubCitations(textWithHallucination, verifiedSources);

    expect(result.unverifiedClaimsCount).toBe(1);
    expect(result.strippedCitations).toContain("FakeAuthor, 2022");
    expect(result.scrubbedText).toContain("[Unverified Claim — Link Vault Source]");
    expect(result.scrubbedText).not.toContain("(FakeAuthor, 2022)");
  });

  it("checkChronologicalAnachronism flags warning when sentence eventYear > source pubYear", () => {
    const source2018: VerifiedSourceItem = {
      id: "src_old",
      authors: ["Finch, A."],
      year: 2018,
      title: "Historical Analysis of Key Exchange Vulnerabilities",
    };

    const sentence = "In 2024, the security task force reported unprecedented channel leakage.";
    const warnings = checkChronologicalAnachronism(sentence, [source2018]);

    expect(warnings.length).toBe(1);
    expect(warnings[0].eventYear).toBe(2024);
    expect(warnings[0].pubYear).toBe(2018);
    expect(warnings[0].warning).toContain("Chronological Anachronism");
  });

  it("checkChronologicalAnachronism does NOT flag warning when eventYear <= pubYear", () => {
    const source2024: VerifiedSourceItem = {
      id: "src_new",
      authors: ["Modern, M."],
      year: 2024,
      title: "Retrospective On 2021 Atmospheric Protocols",
    };

    const sentence = "In 2021, initial trials experienced atmospheric attenuation.";
    const warnings = checkChronologicalAnachronism(sentence, [source2024]);

    expect(warnings.length).toBe(0);
  });
});

describe("Journal Step A: Two-Pass Sub-Section Drafting & Exact Word-Count Controller", () => {
  it("POST /api/projects/:id/agentic/draft-subsection enforces exact word-count telemetry, British English, and NFC Unicode", async () => {
    const projectId = await createTestProject();

    // Create verified sources including IAST / Sanskrit terms
    const sources: VerifiedSourceItem[] = [
      {
        id: "src_advaitic",
        authors: ["Śaṅkara, A.", "Pramāṇa, K."],
        year: 2023,
        title: "Epistemological Foundations of Rigveda and Empirical Observation",
        stance: "Supporting",
        keyFindings: "Demonstrated epistemic invariants under non-dualistic analysis.",
      },
    ];

    const targetWords = 400;

    const res = await request(app)
      .post(`/api/projects/${projectId}/agentic/draft-subsection`)
      .send({
        sectionId: "sec-1",
        subSectionId: "sec-1-sub-1",
        subSectionTitle: "Epistemological Stance in Pramāṇa Analysis",
        targetWords,
        assignedSources: sources,
        dialect: "en-GB",
        contextPrompt: "Pramāṇa epistemology with Śaṅkara philosophical axioms",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.subSectionId).toBe("sec-1-sub-1");

    const content = res.body.content as string;
    const actualWords = res.body.actualWords as number;

    // 1. Exact word-count telemetry within +-5% of targetWords
    expect(actualWords).toBe(countExactWords(content));
    expect(Math.abs(actualWords - targetWords)).toBeLessThanOrEqual(targetWords * 0.05);
    expect(Math.abs(res.body.deviationPercentage)).toBeLessThanOrEqual(5.0);

    // 2. British English orthography (-ise, -our)
    expect(content).toMatch(/\b(analys|synthes|behavio|modell)/i);

    // 3. NFC Unicode / IAST preservation
    expect(content.normalize("NFC")).toBe(content);
    expect(content).toContain("Pramāṇa");

    // 4. Citation resolution: [CITE:src_advaitic] converted to formatted citation
    expect(content).not.toContain("[CITE:src_advaitic]");
    expect(content).toMatch(/Śaṅkara/);

    // 5. High syntactic burstiness (CV > 0.25)
    expect(res.body.burstinessMetrics).toBeDefined();
    expect(res.body.burstinessMetrics.isSufficientlyBurst).toBe(true);
  });
});
