import { describe, it, expect } from "vitest";
import {
  evaluateChapterGating,
  evaluateAllChaptersGating,
  summarizeChapterGates,
  initialProjectGateState,
  signOff,
} from "../conductor";
import { catalog } from "../../atlas/atlas";
import { emptyDocument } from "../../../domain/document/model";
import { appendBlock } from "../../../domain/document/ops";
import { emptyGraph, addClaim, bindEvidence } from "../../../domain/claim/graph";
import type { PeerReviewHistory, ReviewRound } from "../../../domain/review/types";

describe("app/conductor: Per-Chapter Gating for Long-Form Chaptered (OT-07 / OT-09)", () => {
  const thesisSpec = catalog.getOrThrow("OT-07");

  it("evaluates G3, G4, and G5 criteria for a single chapter", () => {
    let project = initialProjectGateState("proj-thesis-1");
    let doc = emptyDocument("proj-thesis-1", "Master's Thesis");

    // Add block for introduction using (doc, id, kind, text)
    doc = appendBlock(
      doc,
      "introduction",
      "paragraph",
      "This dissertation investigates fault-tolerant quantum algorithms in distributed network environments."
    );

    const graph = emptyGraph();

    project = evaluateChapterGating(project, {
      spec: thesisSpec,
      document: doc,
      chapterId: "introduction",
      claimGraph: graph,
    });

    expect(project.chapterGates).toBeDefined();
    expect(project.chapterGates?.introduction).toBeDefined();

    const introG3 = project.chapterGates?.introduction?.G3;
    const introG4 = project.chapterGates?.introduction?.G4;

    expect(introG3).toBeDefined();
    expect(introG4).toBeDefined();

    // G3 should satisfy structure since 'introduction' block is present
    const g3Content = introG3?.exitCriteria.find((c) => c.id === "section-introduction");
    expect(g3Content?.satisfied).toBe(true);

    // G4 draft text exists
    const g4Text = introG4?.exitCriteria.find((c) => c.id === "draft-section-introduction");
    expect(g4Text?.satisfied).toBe(true);

    // G4 provenance exists and has no unverified tags
    const g4Prov = introG4?.exitCriteria.find((c) => c.id === "chapter-provenance-introduction");
    expect(g4Prov?.satisfied).toBe(true);
  });

  it("checks evidence bindings and citation provenance for chapter-level claims in G4", () => {
    let project = initialProjectGateState("proj-thesis-1");
    let doc = emptyDocument("proj-thesis-1", "Master's Thesis");
    doc = appendBlock(
      doc,
      "methodology",
      "paragraph",
      "Quantum repeater networks reduce decoherence rates by a factor of 10."
    );

    let graph = emptyGraph();
    graph = addClaim(graph, {
      id: "claim-1",
      text: "Quantum repeater networks reduce decoherence rates by a factor of 10.",
    });

    // Without evidence, G4 chapter-claims should fail
    project = evaluateChapterGating(project, {
      spec: thesisSpec,
      document: doc,
      chapterId: "methodology",
      claimGraph: graph,
    });

    let methG4 = project.chapterGates?.methodology?.G4;
    let claimsCrit = methG4?.exitCriteria.find((c) => c.id === "chapter-claims-methodology");
    expect(claimsCrit?.satisfied).toBe(false);

    // Bind evidence to the claim
    graph = bindEvidence(graph, {
      id: "binding-1",
      claimId: "claim-1",
      evidence: [
        {
          sourceId: "source-42",
          locator: { page: 12 },
          quote: "Repeater nodes demonstrated a 10x reduction in quantum decoherence rates across 50km fibres.",
        },
      ],
      strength: "strong",
    });

    project = evaluateChapterGating(project, {
      spec: thesisSpec,
      document: doc,
      chapterId: "methodology",
      claimGraph: graph,
    });

    methG4 = project.chapterGates?.methodology?.G4;
    claimsCrit = methG4?.exitCriteria.find((c) => c.id === "chapter-claims-methodology");
    expect(claimsCrit?.satisfied).toBe(true);
  });

  it("evaluates peer-review audit history for G5 per-chapter sign-off", () => {
    let project = initialProjectGateState("proj-thesis-1");
    let doc = emptyDocument("proj-thesis-1", "Master's Thesis");
    doc = appendBlock(
      doc,
      "results",
      "paragraph",
      "Analysis of experimental simulations across 10,000 runs."
    );

    const graph = emptyGraph();

    // History with an unresolved critical finding for chapter 'results'
    const mockRound: ReviewRound = {
      roundNumber: 1,
      lensReviews: [
        {
          lens: "methodology",
          overallAssessment: "Simulation methodology requires rigour.",
          findings: [
            {
              summary: "Critical divergence in confidence intervals",
              detail: "Simulation error margins lack confidence interval definitions.",
              severity: "critical",
              sectionKeys: ["results"],
            },
          ],
        },
      ],
      lensesRun: ["methodology"],
      lensErrors: {},
      createdAt: "2026-10-21T00:00:00Z",
    };

    const mockHistory: PeerReviewHistory = {
      rounds: [mockRound],
    };

    project = evaluateChapterGating(project, {
      spec: thesisSpec,
      document: doc,
      chapterId: "results",
      claimGraph: graph,
      history: mockHistory,
    });

    const resultsG5 = project.chapterGates?.results?.G5;
    expect(resultsG5).toBeDefined();
    const blockingAudit = resultsG5?.exitCriteria.find((c) => c.id === "chapter-audit-passed-results");
    expect(blockingAudit?.satisfied).toBe(false);

    // Now resolve the finding by running round 2 without critical findings
    const mockRound2: ReviewRound = {
      roundNumber: 2,
      lensReviews: [
        {
          lens: "methodology",
          overallAssessment: "Confidence intervals are rigorously defined.",
          findings: [],
        },
      ],
      lensesRun: ["methodology"],
      lensErrors: {},
      createdAt: "2026-10-22T00:00:00Z",
    };
    mockHistory.rounds.push(mockRound2);

    project = evaluateChapterGating(project, {
      spec: thesisSpec,
      document: doc,
      chapterId: "results",
      claimGraph: graph,
      history: mockHistory,
    });

    const resolvedG5 = project.chapterGates?.results?.G5;
    const resolvedAudit = resolvedG5?.exitCriteria.find((c) => c.id === "chapter-audit-passed-results");
    expect(resolvedAudit?.satisfied).toBe(true);
  });

  it("evaluateAllChaptersGating summarizes readiness across all thesis chapters", async () => {
    let project = initialProjectGateState("proj-thesis-all");
    let doc = emptyDocument("proj-thesis-all", "Master's Thesis");

    // Initially document has no chapter blocks
    const graph = emptyGraph();

    const initialEval = evaluateAllChaptersGating(project, {
      spec: thesisSpec,
      document: doc,
      claimGraph: graph,
    });

    expect(initialEval.allChaptersReadyForG6).toBe(false);
    expect(initialEval.chapterSummaries.length).toBeGreaterThan(0);
    expect(initialEval.chapterSummaries.some((s) => s.blockingCriteria.length > 0)).toBe(true);

    // Provide content for every section of OT-07
    const allSectionKeys = [
      "title_page",
      "declaration",
      "abstract",
      "introduction",
      "literature_review",
      "methodology",
      "results",
      "discussion",
      "conclusion",
      "references",
    ];

    for (const secKey of allSectionKeys) {
      doc = appendBlock(
        doc,
        secKey,
        "paragraph",
        `Content for section ${secKey} with rigorous scholarly detail and documentation.`
      );
    }

    const cleanRound: ReviewRound = {
      roundNumber: 1,
      lensReviews: [
        {
          lens: "evidence",
          overallAssessment: "All sections meet peer review standards.",
          findings: [],
        },
      ],
      lensesRun: ["evidence"],
      lensErrors: {},
      createdAt: "2026-10-22T00:00:00Z",
    };

    let fullyEvaluated = evaluateAllChaptersGating(project, {
      spec: thesisSpec,
      document: doc,
      claimGraph: graph,
      history: { rounds: [cleanRound] },
    });

    project = fullyEvaluated.project;

    // Verify targetWordCount is populated from thesis budget distribution
    const introSummary = fullyEvaluated.chapterSummaries.find((s) => s.chapterId === "introduction");
    expect(introSummary).toBeDefined();
    expect(introSummary!.targetWordCount).toBeGreaterThan(0);

    // Sign off whole-project prerequisite gates G0, G1, and G2
    project = await signOff(project, "G0", "advisor", { intake: "complete" });
    project = await signOff(project, "G1", "advisor", { methodology: "approved" });
    project = await signOff(project, "G2", "advisor", { evidence: "approved" });

    // Re-evaluate chapters after prerequisites are signed off so entrySatisfied becomes true
    fullyEvaluated = evaluateAllChaptersGating(project, {
      spec: thesisSpec,
      document: doc,
      claimGraph: graph,
      history: { rounds: [cleanRound] },
    });
    project = fullyEvaluated.project;

    // Sign off all chapter gates G3, G4, G5
    for (const secKey of allSectionKeys) {
      project = await signOff(project, "G3", "advisor", { text: secKey }, secKey);
      project = await signOff(project, "G4", "advisor", { text: secKey }, secKey);
      project = await signOff(project, "G5", "reviewer", { text: secKey }, secKey);
    }

    const finalSummaries = summarizeChapterGates(project, thesisSpec, doc);
    expect(finalSummaries.every((s) => s.isReadyForGlobalCompliance)).toBe(true);

    const reEvaluated = evaluateAllChaptersGating(project, {
      spec: thesisSpec,
      document: doc,
      claimGraph: graph,
      history: { rounds: [cleanRound] },
    });
    expect(reEvaluated.allChaptersReadyForG6).toBe(true);
  });
});
