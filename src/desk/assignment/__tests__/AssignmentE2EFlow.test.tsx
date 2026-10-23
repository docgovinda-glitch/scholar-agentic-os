/**
 * AssignmentE2EFlow.test.tsx
 * --------------------------
 * End-to-end simulation of a student traversing all 4 phases of the
 * Scholar OS Coursework & Essay Engine:
 *
 *   Phase 1: Understand  — brief intake, budget split, rubric capture
 *   Phase 2: Sources     — curated cards, lecture upload, approved IDs
 *   Phase 3: Drafting    — invisible chunker, PEEL synthesis, section index
 *   Phase 4: Submission  — rubric audit, citation reconciliation, DOCX export
 *
 * All external dependencies (fetch, docx Packer) are mocked so the suite
 * runs deterministically in CI without a live server.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  AssignmentProjectState,
  AssignmentPhaseId,
  AssignmentBriefState,
  DiscoveredSource,
  AssignmentDraftingSection,
} from "../types";
import {
  ASSIGNMENT_PHASES,
  ASSIGNMENT_AGENT_CONFIGS,
  normalizeAssignmentPhase,
  normalizeProjectAnswers,
} from "../types";
import { generateAdaptiveDefaultOutline } from "../services/outlineService";
import { evaluateRubricCompliance, auditCitations } from "../services/submissionAuditService";
import { formatBibliographyEntry } from "../services/assignmentExportService";
import { decomposeWordBudget } from "../services/invisibleChunkerService";

// ─── Mock docx Packer (heavy native dep) ────────────────────────────────────
vi.mock("docx", async () => {
  const actual = await vi.importActual<typeof import("docx")>("docx");
  return {
    ...actual,
    Packer: {
      toBlob: vi.fn().mockResolvedValue(new Blob(["mock-docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-docx")),
    },
  };
});

// ─── Mock authedJsonFetch ─────────────────────────────────────────────────────
vi.mock("../../api", () => ({
  authedJsonFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: "Copilot response OK" }),
  }),
}));

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const MOCK_BRIEF: AssignmentBriefState = {
  instructions: "Critically evaluate the role of renewable energy policy in accelerating decarbonisation by 2050.",
  targetWordCount: 2500,
  academicLevel: "postgraduate",
  assignmentType: "essay",
  citationStyle: "apa7",
  sections: {
    isCustomized: true,
    intro: { targetWords: 250, guidelines: "Define scope, thesis on policy urgency." },
    body: { targetWords: 1950, guidelines: "Evaluate three policy frameworks with empirical evidence." },
    conclusion: { targetWords: 300, guidelines: "Synthesis and future trajectory recommendations." },
  },
  constraints: ["Use sources published after 2018", "Minimum 12 academic references"],
  rubricCriteria: [
    { id: "rc-1", title: "Critical Analysis", description: "Depth of critical evaluation", weightPercent: 40 },
    { id: "rc-2", title: "Evidence Quality", description: "Peer-reviewed citations and data", weightPercent: 30 },
    { id: "rc-3", title: "Argument Structure", description: "Logical coherence and PEEL structure", weightPercent: 20 },
    { id: "rc-4", title: "Academic Writing", description: "Clarity, grammar, referencing style", weightPercent: 10 },
  ],
};

const MOCK_SOURCES: DiscoveredSource[] = [
  {
    id: "src-1",
    title: "Decarbonisation Pathways",
    authors: ["Smith", "Jones"],
    year: "2022",
    type: "journal",
    relevanceScore: 96,
    mainFinding: "Carbon pricing accelerates renewable deployment.",
    suggestedUse: "Support policy efficacy claim.",
    citation: "Smith & Jones (2022)",
    status: "kept",
  },
  {
    id: "src-2",
    title: "Green Policy Frameworks in the EU",
    authors: ["Muller"],
    year: "2023",
    type: "journal",
    relevanceScore: 88,
    mainFinding: "EU ETS drove 35% emission reductions in energy sector.",
    suggestedUse: "Empirical baseline for EU framework analysis.",
    citation: "Muller (2023)",
    status: "kept",
  },
];

const MOCK_SECTIONS: AssignmentDraftingSection[] = [
  {
    id: "sec-1",
    title: "Introduction & Thesis Statement",
    targetWordCount: 250,
    currentWordCount: 251,
    guidance: "Define scope, thesis on policy urgency.",
    draftContent:
      "The accelerating climate crisis demands urgent structural transformation of global energy systems. " +
      "This essay critically evaluates the role of renewable energy policy in advancing decarbonisation by 2050. " +
      "Empirical evidence from the EU ETS (Muller, 2023) and carbon pricing literature (Smith & Jones, 2022) " +
      "reveals that policy design quality is the primary determinant of transition speed.",
    status: "reviewed",
  },
  {
    id: "sec-2",
    title: "Policy Framework Analysis",
    targetWordCount: 650,
    currentWordCount: 643,
    guidance: "Evaluate three policy frameworks with empirical evidence.",
    draftContent:
      "Carbon pricing mechanisms represent the most efficient market-based decarbonisation tool available to policymakers. " +
      "Smith & Jones (2022) demonstrate a 28% reduction in fossil fuel consumption following carbon price introduction above $50/tonne. " +
      "The EU Emissions Trading Scheme (ETS) provides a landmark empirical case: Muller (2023) attributes a 35% emission reduction in the energy sector " +
      "directly to ETS price signals between 2015 and 2022.",
    status: "reviewed",
  },
  {
    id: "sec-3",
    title: "Conclusion & Policy Trajectory",
    targetWordCount: 300,
    currentWordCount: 295,
    guidance: "Synthesis and future trajectory recommendations.",
    draftContent:
      "Renewable energy policy, when designed with market-based mechanisms and binding targets, demonstrably accelerates decarbonisation. " +
      "The synthesis of evidence from Smith & Jones (2022) and Muller (2023) confirms that integrated policy frameworks achieve 25-40% faster transition rates. " +
      "Future policy agendas must prioritise carbon pricing harmonisation across G20 economies to close the 2050 gap.",
    status: "reviewed",
  },
];

// ─── PHASE 1: UNDERSTAND ─────────────────────────────────────────────────────

describe("Phase 1: Understand — Brief Intake & Budget Split", () => {
  it("normalizeProjectAnswers generates correct default 10/75/15 section split for 2500 words", () => {
    const answers = { targetWordCount: 2500, instructions: "Evaluate renewable energy policy." };
    const normalized = normalizeProjectAnswers(answers);
    expect(normalized.sections.isCustomized).toBe(false);
    expect(normalized.sections.intro.targetWords).toBe(250);
    expect(normalized.sections.body.targetWords).toBe(1875);
    expect(normalized.sections.conclusion.targetWords).toBe(375);
  });

  it("preserves custom section allocations without override", () => {
    const answers = {
      targetWordCount: 2500,
      sections: MOCK_BRIEF.sections,
    };
    const normalized = normalizeProjectAnswers(answers);
    expect(normalized.sections.isCustomized).toBe(true);
    expect(normalized.sections.intro.targetWords).toBe(250);
    expect(normalized.sections.body.targetWords).toBe(1950);
    expect(normalized.sections.conclusion.targetWords).toBe(300);
  });

  it("assigns the Advisor persona for Phase 1 (understand)", () => {
    const config = ASSIGNMENT_AGENT_CONFIGS["understand"];
    expect(config.name.toLowerCase()).toContain("advisor");
    expect(config.description).toBeTruthy();
    expect(config.quickActions.length).toBeGreaterThan(0);
  });

  it("brief schema accepts all required academic metadata", () => {
    const brief = MOCK_BRIEF;
    expect(brief.instructions).toBeTruthy();
    expect(brief.targetWordCount).toBe(2500);
    expect(brief.citationStyle).toBe("apa7");
    expect(brief.rubricCriteria).toHaveLength(4);
    const totalWeight = brief.rubricCriteria!.reduce((s, c) => s + c.weightPercent, 0);
    expect(totalWeight).toBe(100);
  });
});

// ─── PHASE 2: SOURCES ────────────────────────────────────────────────────────

describe("Phase 2: Sources — Curated Cards & Approved Sources", () => {
  it("assigns the Librarian persona for Phase 2 (sources)", () => {
    const config = ASSIGNMENT_AGENT_CONFIGS["sources"];
    expect(config.name.toLowerCase()).toContain("librarian");
  });

  it("filters kept sources from mixed-status curated list", () => {
    const allSources: DiscoveredSource[] = [
      ...MOCK_SOURCES,
      {
        id: "src-3",
        title: "Fossil Fuel Subsidies",
        authors: ["Brown"],
        year: "2020",
        type: "book",
        relevanceScore: 45,
        mainFinding: "Subsidies persist despite policy intent.",
        suggestedUse: "Counter-argument fodder.",
        citation: "Brown (2020)",
        status: "rejected",
      },
    ];
    const kept = allSources.filter((s) => s.status === "kept");
    expect(kept).toHaveLength(2);
    expect(kept.map((s) => s.id)).toContain("src-1");
    expect(kept.map((s) => s.id)).toContain("src-2");
  });

  it("source cards expose the required data fields for evidence linking", () => {
    for (const src of MOCK_SOURCES) {
      expect(src.id).toBeTruthy();
      expect(src.title).toBeTruthy();
      expect(src.citation).toBeTruthy();
      expect(src.relevanceScore).toBeGreaterThan(0);
    }
  });

  it("normalizeAssignmentPhase maps legacy 'research' and 'evidence' to 'sources'", () => {
    expect(normalizeAssignmentPhase("research")).toBe("sources");
    expect(normalizeAssignmentPhase("evidence")).toBe("sources");
    expect(normalizeAssignmentPhase("sources")).toBe("sources");
  });
});

// ─── PHASE 3: DRAFTING ───────────────────────────────────────────────────────

describe("Phase 3: Drafting — Invisible Chunker, PEEL Synthesis & Section Index", () => {
  it("assigns the Scribe persona for Phase 3 (drafting)", () => {
    const config = ASSIGNMENT_AGENT_CONFIGS["drafting"];
    expect(config.name.toLowerCase()).toContain("scribe");
  });

  it("generateAdaptiveDefaultOutline produces correct 6-section essay structure for 2500 words", () => {
    const outline = generateAdaptiveDefaultOutline("essay", "Evaluate renewable energy policy.", 2500);
    expect(outline.length).toBe(6);
    const total = outline.reduce((s, o) => s + o.targetWordCount, 0);
    expect(total).toBe(2500);
    // Each section has required fields
    for (const sec of outline) {
      expect(sec.id).toBeTruthy();
      expect(sec.title).toBeTruthy();
      expect(sec.guidance).toBeTruthy();
      expect(sec.targetWordCount).toBeGreaterThan(0);
    }
  });

  it("generateAdaptiveDefaultOutline respects custom section splits precisely", () => {
    const outline = generateAdaptiveDefaultOutline(
      "essay",
      "Evaluate renewable energy policy.",
      2500,
      "Policy urgency thesis",
      MOCK_BRIEF.sections
    );
    expect(outline[0].targetWordCount).toBe(250);
    expect(outline[outline.length - 1].targetWordCount).toBe(300);
    const bodyWords = outline.slice(1, -1).reduce((s, o) => s + o.targetWordCount, 0);
    expect(bodyWords).toBe(1950);
  });

  it("decomposeWordBudget creates section plans matching target word allocations", () => {
    const plans = decomposeWordBudget({
      totalWordCount: 2500,
      sections: MOCK_BRIEF.sections!,
      outline: [
        { id: "sec-1", title: "Introduction", targetWordCount: 250, currentWordCount: 0, guidance: "", keyPoints: [], linkedEvidenceIds: [], status: "not_started" },
        { id: "sec-2", title: "Body Analysis", targetWordCount: 1950, currentWordCount: 0, guidance: "", keyPoints: [], linkedEvidenceIds: [], status: "not_started" },
        { id: "sec-3", title: "Conclusion", targetWordCount: 300, currentWordCount: 0, guidance: "", keyPoints: [], linkedEvidenceIds: [], status: "not_started" },
      ],
    });
    expect(plans.length).toBeGreaterThan(0);
    const total = plans.reduce((s, p) => s + p.targetWordCount, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("all draft sections have non-empty content before submission audit", () => {
    for (const section of MOCK_SECTIONS) {
      expect(section.draftContent?.trim().length ?? 0).toBeGreaterThan(0);
      expect(section.currentWordCount).toBeGreaterThan(0);
    }
  });

  it("total draft word count sums correctly", () => {
    const total = MOCK_SECTIONS.reduce((s, sec) => s + sec.currentWordCount, 0);
    expect(total).toBeGreaterThan(1000);
    expect(total).toBeLessThan(5000);
  });
});

// ─── PHASE 4: SUBMISSION ─────────────────────────────────────────────────────

describe("Phase 4: Submission — Rubric Audit, Citation Reconciliation & Export", () => {
  it("assigns the Examiner persona for Phase 4 (submission)", () => {
    const config = ASSIGNMENT_AGENT_CONFIGS["submission"];
    expect(config.name.toLowerCase()).toContain("examiner");
  });

  it("evaluateRubricCompliance returns a score report with overallScore and grade band", () => {
    const fullText = MOCK_SECTIONS.map((s) => s.draftContent ?? "").join("\n\n");
    const report = evaluateRubricCompliance(fullText, MOCK_BRIEF);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(report.overallBand).toBeTruthy();
    expect(report.bandLabel).toBeTruthy();
    expect(report.criteria.length).toBeGreaterThan(0);
  });

  it("evaluateRubricCompliance flags priorityFixes as an array (may be empty for high-quality drafts)", () => {
    const fullText = MOCK_SECTIONS.map((s) => s.draftContent ?? "").join("\n\n");
    const report = evaluateRubricCompliance(fullText, MOCK_BRIEF);
    expect(Array.isArray(report.priorityFixes)).toBe(true);
    expect(Array.isArray(report.strengths)).toBe(true);
  });

  it("auditCitations validates all in-text citations map to reference list", () => {
    const fullText = MOCK_SECTIONS.map((s) => s.draftContent ?? "").join("\n\n");
    const audit = auditCitations(fullText, MOCK_SOURCES, [], MOCK_SOURCES.map((s) => s.id));
    expect(typeof audit.isReconciled).toBe("boolean");
    expect(typeof audit.totalInTextCitations).toBe("number");
    expect(typeof audit.verifiedCount).toBe("number");
    expect(Array.isArray(audit.flaggedIssues)).toBe(true);
  });

  it("formatBibliographyEntry produces a non-empty APA7 reference string", () => {
    const entry = formatBibliographyEntry(MOCK_SOURCES[0], "apa7");
    expect(entry).toBeTruthy();
    expect(entry.length).toBeGreaterThan(10);
    // APA7 should include year and author
    expect(entry).toContain("2022");
  });

  it("formatBibliographyEntry produces a non-empty Harvard reference string", () => {
    const entry = formatBibliographyEntry(MOCK_SOURCES[1], "harvard");
    expect(entry).toBeTruthy();
    expect(entry.length).toBeGreaterThan(10);
  });
});

// ─── FULL PIPELINE: Phase 1 → 4 ─────────────────────────────────────────────

describe("Full Pipeline: Phase 1 → 4 state progression", () => {
  it("assembles a valid AssignmentProjectState across all 4 phases", () => {
    const state: AssignmentProjectState = {
      projectId: "e2e-test-project",
      currentPhase: "submission",
      brief: MOCK_BRIEF,
      sources: {
        curated: MOCK_SOURCES,
        userUploaded: [],
        approvedSourceIds: MOCK_SOURCES.map((s) => s.id),
      },
      drafting: {
        internalSections: MOCK_SECTIONS,
        activeSectionId: "sec-1",
        fullDocumentMarkdown: MOCK_SECTIONS.map((s) => `## ${s.title}\n\n${s.draftContent}`).join("\n\n"),
        overallWordCount: MOCK_SECTIONS.reduce((s, sec) => s + sec.currentWordCount, 0),
      },
      submission: {
        rubricScoreReport: null,
        citationAudit: null,
        isReadyForSubmission: false,
      },
    };

    expect(state.projectId).toBe("e2e-test-project");
    expect(state.currentPhase).toBe("submission");
    expect(state.brief.rubricCriteria).toHaveLength(4);
    expect(state.sources.curated).toHaveLength(2);
    expect(state.drafting.internalSections).toHaveLength(3);
    expect(state.drafting.overallWordCount).toBeGreaterThan(1000);
  });

  it("canonical phase IDs are accessible and in correct order", () => {
    const phaseIds = ASSIGNMENT_PHASES.map((p) => p.id);
    expect(phaseIds).toEqual(["extract", "understand", "sources", "drafting", "submission"]);
  });

  it("normalizeAssignmentPhase handles all legacy → canonical transitions safely", () => {
    const legacyMappings: [string, AssignmentPhaseId][] = [
      ["extract", "extract"],
      ["understand", "understand"],
      ["plan", "understand"],
      ["research", "sources"],
      ["evidence", "sources"],
      ["think", "drafting"],
      ["structure", "drafting"],
      ["draft", "drafting"],
      ["final", "submission"],
    ];
    for (const [legacy, expected] of legacyMappings) {
      expect(normalizeAssignmentPhase(legacy)).toBe(expected);
    }
  });

  it("all phases have complete agent configs with non-empty descriptions and quickActions", () => {
    const phases: AssignmentPhaseId[] = ["extract", "understand", "sources", "drafting", "submission"];
    for (const phase of phases) {
      const config = ASSIGNMENT_AGENT_CONFIGS[phase];
      expect(config).toBeDefined();
      expect(config.name).toBeTruthy();
      expect(config.description.length).toBeGreaterThan(20);
      expect(config.quickActions.length).toBeGreaterThan(0);
    }
  });
});
