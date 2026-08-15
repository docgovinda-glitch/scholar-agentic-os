import { describe, it, expect } from "vitest";
import {
  computeG0ExitCriteria,
  computeG1ExitCriteria,
  computeG2ExitCriteria,
  computeG3ExitCriteria,
  computeG4ExitCriteria,
  computeG5ExitCriteria,
  computeG6ExitCriteria,
  computeG7ExitCriteria,
  intakeCompleteness,
  isSignoffStale,
  signOff,
  summarize,
  updateExitCriteria,
  invalidateGate,
  initialProjectGateState,
} from "../conductor";
import { signOffGate } from "../../../domain/project/gates";
import type { ProjectGateState } from "../../../domain/project/gates";
import type { JournalRequirements } from "../../../domain/journal/types";
import { emptyPeerReviewHistory } from "../../../domain/review/types";
import type { ReviewRound } from "../../../domain/review/types";
import { catalog } from "../../atlas/atlas";
import { evaluateAgainstOutputType } from "../../rubric/rubric";
import { emptyDocument } from "../../../domain/document/model";
import { appendBlock } from "../../../domain/document/ops";
import { emptyLedger } from "../../../domain/evidence/types";
import type { EvidenceLedger, EvidenceItem, DiscoveredSource } from "../../../domain/evidence/types";
import { emptyGraph, addClaim, bindEvidence, markClaimUnsupported } from "../../../domain/claim/graph";

describe("app/conductor: G0 bound to Atlas", () => {
  it("computes one blocking criterion per required intake field", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const criteria = computeG0ExitCriteria(thesis, {});
    expect(criteria).toHaveLength(thesis.intakeSchema.required.length);
    expect(criteria.every((c) => c.blocking)).toBe(true);
    expect(criteria.every((c) => c.satisfied === false)).toBe(true);
  });

  it("a provisional answer satisfies a field that allows it", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const criteria = computeG0ExitCriteria(thesis, {
      research_question: "provisional",
      methodology_type: "qualitative",
    });
    expect(criteria.every((c) => c.satisfied)).toBe(true);
  });

  it("a provisional answer does NOT satisfy a field that disallows it (OT-16's funder field)", () => {
    const grant = catalog.getOrThrow("OT-16");
    const criteria = computeG0ExitCriteria(grant, { funder_and_scheme: "provisional", call_document: "x" });
    const funderCriterion = criteria.find((c) => c.id === "funder_and_scheme")!;
    expect(funderCriterion.satisfied).toBe(false);
  });

  it("end-to-end: a project cannot enter G0-ready state until every required field is answered", async () => {
    const assignment = catalog.getOrThrow("OT-01");
    let project = initialProjectGateState("p1");

    let criteria = computeG0ExitCriteria(assignment, { word_limit: "1500" }); // assignment_brief missing
    project = updateExitCriteria(project, "G0", criteria);
    expect(project.gates.G0.status).not.toBe("ready");

    const answers = { assignment_brief: "provisional", word_limit: "1500" };
    criteria = computeG0ExitCriteria(assignment, answers);
    project = updateExitCriteria(project, "G0", criteria);
    expect(project.gates.G0.status).toBe("ready");

    project = await signOff(project, "G0", "amara", { answers });
    expect(project.gates.G0.status).toBe("signed_off");
    expect(project.gates.G1.entrySatisfied).toBe(true); // unlocked immediately
  });

  it("intakeCompleteness reports fraction of ALL fields answered, informational only", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const total = assignment.intakeSchema.required.length + assignment.intakeSchema.recommended.length + assignment.intakeSchema.optional.length;
    const completeness = intakeCompleteness(assignment, { word_limit: "1500" });
    expect(completeness).toBeCloseTo(1 / total, 5);
  });
});

describe("app/conductor: G1 bound to Atlas + journal requirements", () => {
  const requirements: JournalRequirements = {
    journalName: "Water Research",
    source: "manual",
    citationStyle: "vancouver",
    requiredDeclarations: ["funding"],
    capturedAt: "2026-01-01T00:00:00.000Z",
    capturedBy: "amara",
  };

  it("returns no criteria at all for a non-venue_targeted type — G1 stays exactly as unwired as it already was for those", () => {
    const assignment = catalog.getOrThrow("OT-01"); // workflowVariant: "short_form"
    expect(computeG1ExitCriteria(assignment, {}, undefined)).toEqual([]);
    expect(computeG1ExitCriteria(assignment, {}, requirements)).toEqual([]);
  });

  it("for a venue_targeted type (Journal Article), starts with target journal unresolved and requirements not captured", () => {
    const journalArticle = catalog.getOrThrow("OT-10");
    const criteria = computeG1ExitCriteria(journalArticle, {}, undefined);
    expect(criteria.every((c) => c.blocking)).toBe(true);
    expect(criteria.find((c) => c.id === "target-journal-decided")?.satisfied).toBe(false);
    expect(criteria.find((c) => c.id === "journal-requirements-captured")?.satisfied).toBe(false);
    // No citation-style criterion at all until requirements exist to check it against.
    expect(criteria.find((c) => c.id === "citation-style-specified")).toBeUndefined();
  });

  it("target_journal resolving out of 'provisional' satisfies just that one criterion", () => {
    const journalArticle = catalog.getOrThrow("OT-10");
    const stillProvisional = computeG1ExitCriteria(journalArticle, { target_journal: "provisional" }, undefined);
    expect(stillProvisional.find((c) => c.id === "target-journal-decided")?.satisfied).toBe(false);

    const resolved = computeG1ExitCriteria(journalArticle, { target_journal: "Water Research" }, undefined);
    expect(resolved.find((c) => c.id === "target-journal-decided")?.satisfied).toBe(true);
    expect(resolved.find((c) => c.id === "journal-requirements-captured")?.satisfied).toBe(false);
  });

  it("captured requirements without a citation style leave that one criterion unsatisfied", () => {
    const journalArticle = catalog.getOrThrow("OT-10");
    const { citationStyle: _citationStyle, ...withoutStyle } = requirements;
    const criteria = computeG1ExitCriteria(journalArticle, { target_journal: "Water Research" }, withoutStyle as JournalRequirements);
    expect(criteria.find((c) => c.id === "journal-requirements-captured")?.satisfied).toBe(true);
    expect(criteria.find((c) => c.id === "citation-style-specified")?.satisfied).toBe(false);
  });

  it("every criterion satisfied once target_journal is resolved and requirements (with a citation style) are captured", () => {
    const journalArticle = catalog.getOrThrow("OT-10");
    const criteria = computeG1ExitCriteria(journalArticle, { target_journal: "Water Research" }, requirements);
    expect(criteria.every((c) => c.satisfied)).toBe(true);
  });

  it("end-to-end: G1 doesn't reach ready until G0 is signed off, even with every G1 criterion already satisfied", async () => {
    const journalArticle = catalog.getOrThrow("OT-10");
    const answers = { target_journal: "Water Research" };
    let project = initialProjectGateState("p1");

    project = updateExitCriteria(project, "G1", computeG1ExitCriteria(journalArticle, answers, requirements));
    expect(project.gates.G1.status).not.toBe("ready"); // entry prerequisite (G0 signed off) unmet

    project = updateExitCriteria(project, "G0", computeG0ExitCriteria(journalArticle, answers));
    project = await signOff(project, "G0", "amara", { answers });
    project = updateExitCriteria(project, "G1", computeG1ExitCriteria(journalArticle, answers, requirements));
    expect(project.gates.G1.status).toBe("ready");
  });
});

function source(id: string, overrides: Partial<DiscoveredSource> = {}): DiscoveredSource {
  return {
    id,
    title: `Source ${id}`,
    authors: ["A. Author"],
    sourceType: "scholarly",
    authorityTier: "A",
    discoveredVia: "manual",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function evidenceItem(id: string, sourceId: string, state: EvidenceItem["state"]): EvidenceItem {
  return { id, sourceId, state, history: [{ state, at: "2026-01-01T00:00:00.000Z" }] };
}

describe("app/conductor: G2 bound to the evidence ledger", () => {
  it("is unsatisfied on both criteria against an empty ledger, when the type requires more than zero sources", () => {
    const thesis = catalog.getOrThrow("OT-07"); // requires 50 sources minimum
    const criteria = computeG2ExitCriteria(thesis, emptyLedger(), undefined);
    expect(criteria.find((c) => c.id === "corpus-meets-minimum")?.satisfied).toBe(false);
    expect(criteria.find((c) => c.id === "no-unreviewed-candidates")?.satisfied).toBe(true); // vacuously — no items at all
  });

  it("corpus-meets-minimum is satisfied once enough sources are discovered", () => {
    const assignment = catalog.getOrThrow("OT-01"); // small minimum, cheap to satisfy directly
    const min = assignment.sources.targetCount.min;
    const ledger: EvidenceLedger = { sources: Array.from({ length: min }, (_, i) => source(`s${i}`)), items: [] };
    const criteria = computeG2ExitCriteria(assignment, ledger, undefined);
    expect(criteria.find((c) => c.id === "corpus-meets-minimum")?.satisfied).toBe(true);
  });

  it("an explicit smaller-corpus override satisfies corpus-meets-minimum even with zero sources, and names the reason", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const criteria = computeG2ExitCriteria(thesis, emptyLedger(), { reason: "Scoping review only." });
    const criterion = criteria.find((c) => c.id === "corpus-meets-minimum")!;
    expect(criterion.satisfied).toBe(true);
    expect(criterion.description).toContain("Scoping review only.");
  });

  it("no-unreviewed-candidates is unsatisfied while an item sits in 'proposed', satisfied once it moves to 'citable'", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const proposedLedger: EvidenceLedger = { sources: [source("s1")], items: [evidenceItem("ev1", "s1", "proposed")] };
    expect(computeG2ExitCriteria(assignment, proposedLedger, undefined).find((c) => c.id === "no-unreviewed-candidates")?.satisfied).toBe(false);

    const citableLedger: EvidenceLedger = { sources: [source("s1")], items: [evidenceItem("ev1", "s1", "citable")] };
    expect(computeG2ExitCriteria(assignment, citableLedger, undefined).find((c) => c.id === "no-unreviewed-candidates")?.satisfied).toBe(true);
  });

  it("items in earlier pipeline states (discovered/extracted/verified) don't count as 'unreviewed candidates blocking'", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const ledger: EvidenceLedger = {
      sources: [source("s1")],
      items: [evidenceItem("ev1", "s1", "discovered"), evidenceItem("ev2", "s1", "extracted"), evidenceItem("ev3", "s1", "verified")],
    };
    expect(computeG2ExitCriteria(assignment, ledger, undefined).find((c) => c.id === "no-unreviewed-candidates")?.satisfied).toBe(true);
  });
});

describe("app/conductor: G3 bound to Atlas + the document", () => {
  it("computes one blocking criterion per required section, unsatisfied against an empty document", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const doc = emptyDocument("d1", "Thesis");
    const criteria = computeG3ExitCriteria(thesis, doc, {});
    const sectionCriteria = criteria.filter((c) => c.id.startsWith("section-"));
    const requiredSectionCount = thesis.structure.sections.filter((s) => s.required).length;
    expect(sectionCriteria).toHaveLength(requiredSectionCount);
    expect(sectionCriteria.every((c) => c.blocking && !c.satisfied)).toBe(true);
  });

  it("a section is satisfied once a block with its key exists, regardless of content", () => {
    const thesis = catalog.getOrThrow("OT-07");
    let doc = emptyDocument("d1", "Thesis");
    doc = appendBlock(doc, "introduction", "heading1", ""); // empty stub — existence is enough for G3
    const criteria = computeG3ExitCriteria(thesis, doc, {});
    const introCriterion = criteria.find((c) => c.id === "section-introduction")!;
    expect(introCriterion.satisfied).toBe(true);
  });

  it("only generates a deferred-field criterion for fields that allow a provisional answer", () => {
    const thesis = catalog.getOrThrow("OT-07"); // research_question allows provisional, methodology_type does not
    const doc = emptyDocument("d1", "Thesis");
    const criteria = computeG3ExitCriteria(thesis, doc, {});
    const deferredCriteria = criteria.filter((c) => c.id.startsWith("deferred-"));
    expect(deferredCriteria).toHaveLength(1);
    expect(deferredCriteria[0].id).toBe("deferred-research_question");
  });

  it("a deferred field is unsatisfied while still literally 'provisional', satisfied once resolved", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const doc = emptyDocument("d1", "Thesis");

    const stillDeferred = computeG3ExitCriteria(thesis, doc, { research_question: "provisional" });
    expect(stillDeferred.find((c) => c.id === "deferred-research_question")!.satisfied).toBe(false);

    const resolved = computeG3ExitCriteria(thesis, doc, { research_question: "How did municipal water policy change?" });
    expect(resolved.find((c) => c.id === "deferred-research_question")!.satisfied).toBe(true);
  });

  it("end-to-end: G3 becomes ready once its entry prerequisites (G0, G2) are signed off, every required section exists, and no field is still deferred", async () => {
    const thesis = catalog.getOrThrow("OT-07");
    let project = initialProjectGateState("p1");
    const answers = { research_question: "provisional", methodology_type: "theoretical" };

    let doc = emptyDocument("d1", "Thesis");
    let criteria = computeG3ExitCriteria(thesis, doc, answers);
    project = updateExitCriteria(project, "G3", criteria);
    expect(project.gates.G3.status).not.toBe("ready"); // entry prerequisites unmet yet

    // Sign off G0 and G2 (its own real exit criteria — an explicit
    // smaller-corpus override, since adding OT-07's real 50-source minimum
    // isn't this test's subject).
    project = updateExitCriteria(project, "G0", computeG0ExitCriteria(thesis, answers));
    project = await signOff(project, "G0", "amara", { answers });
    const override = { reason: "Pilot literature scan only; full search deferred to G2's continuous phase." };
    project = updateExitCriteria(project, "G2", computeG2ExitCriteria(thesis, emptyLedger(), override));
    project = await signOff(project, "G2", "amara", { evidenceLedger: emptyLedger(), override });

    for (const section of thesis.structure.sections.filter((s) => s.required)) {
      doc = appendBlock(doc, section.key, "paragraph", "x");
    }
    criteria = computeG3ExitCriteria(thesis, doc, { research_question: "A real question.", methodology_type: "theoretical" });
    project = updateExitCriteria(project, "G3", criteria);
    expect(project.gates.G3.status).toBe("ready");
  });
});

describe("app/conductor: G4 bound to the document + claim graph", () => {
  it("computes one blocking criterion per required section, unsatisfied against an empty document", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const doc = emptyDocument("d1", "Test");
    const criteria = computeG4ExitCriteria(assignment, doc, emptyGraph());
    const sectionCriteria = criteria.filter((c) => c.id.startsWith("draft-section-"));
    const requiredSectionCount = assignment.structure.sections.filter((s) => s.required).length;
    expect(sectionCriteria).toHaveLength(requiredSectionCount);
    expect(sectionCriteria.every((c) => c.blocking && !c.satisfied)).toBe(true);
  });

  it("a section existing but empty is STILL unsatisfied — G4 requires non-empty content, stricter than G3's existence-only check", () => {
    const assignment = catalog.getOrThrow("OT-01");
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "introduction", "paragraph", "   "); // whitespace only
    const criteria = computeG4ExitCriteria(assignment, doc, emptyGraph());
    expect(criteria.find((c) => c.id === "draft-section-introduction")?.satisfied).toBe(false);
  });

  it("a section with real content is satisfied", () => {
    const assignment = catalog.getOrThrow("OT-01");
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "introduction", "paragraph", "This assignment addresses X.");
    const criteria = computeG4ExitCriteria(assignment, doc, emptyGraph());
    expect(criteria.find((c) => c.id === "draft-section-introduction")?.satisfied).toBe(true);
  });

  it("an unbound, unmarked claim leaves the claims criterion unsatisfied", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const doc = emptyDocument("d1", "Test");
    let graph = emptyGraph();
    graph = addClaim(graph, { id: "c1", text: "Effect X was observed." });
    const criteria = computeG4ExitCriteria(assignment, doc, graph);
    const claimsCriterion = criteria.find((c) => c.id === "claims-bound-or-marked-unsupported")!;
    expect(claimsCriterion.satisfied).toBe(false);
    expect(claimsCriterion.description).toContain("c1");
  });

  it("a bound claim satisfies the claims criterion", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const doc = emptyDocument("d1", "Test");
    let graph = emptyGraph();
    graph = addClaim(graph, { id: "c1", text: "Effect X was observed." });
    graph = bindEvidence(graph, { id: "b1", claimId: "c1", evidence: [{ sourceId: "s1", locator: {}, quote: "X was measured." }], strength: "strong", rationale: "Direct measurement." });
    const criteria = computeG4ExitCriteria(assignment, doc, graph);
    expect(criteria.find((c) => c.id === "claims-bound-or-marked-unsupported")?.satisfied).toBe(true);
  });

  it("a claim explicitly marked unsupported ALSO satisfies G4's claims criterion — the looser draft-stage bar", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const doc = emptyDocument("d1", "Test");
    let graph = emptyGraph();
    graph = addClaim(graph, { id: "c1", text: "This is a definitional statement." });
    graph = markClaimUnsupported(graph, "c1", "Definitional, needs no citation.", "u1");
    const criteria = computeG4ExitCriteria(assignment, doc, graph);
    expect(criteria.find((c) => c.id === "claims-bound-or-marked-unsupported")?.satisfied).toBe(true);
  });

  it("end-to-end: G4 becomes ready once its entry prerequisites (G1, G2, G3) are signed off and every criterion is satisfied", async () => {
    const assignment = catalog.getOrThrow("OT-01");
    let doc = emptyDocument("d1", "Test");
    for (const section of assignment.structure.sections.filter((s) => s.required)) {
      doc = appendBlock(doc, section.key, "paragraph", "Real content for this section.");
    }
    let graph = emptyGraph();
    graph = addClaim(graph, { id: "c1", text: "A claim." });
    graph = markClaimUnsupported(graph, "c1", "No citation needed.", "u1");

    let project: ProjectGateState = initialProjectGateState("p1");
    for (const gate of ["G0", "G1", "G2", "G3"] as const) {
      project = updateExitCriteria(project, gate, [{ id: "x", description: "x", satisfied: true, blocking: true }]);
      project = await signOff(project, gate, "u", `hash-${gate}`);
    }
    expect(project.gates.G4.entrySatisfied).toBe(true);

    project = updateExitCriteria(project, "G4", computeG4ExitCriteria(assignment, doc, graph));
    expect(project.gates.G4.status).toBe("ready");
  });
});

describe("app/conductor: G5 bound to peer-review history", () => {
  function round(overrides: Partial<ReviewRound> = {}): ReviewRound {
    return { roundNumber: 1, lensReviews: [], lensesRun: [], lensErrors: {}, createdAt: "now", ...overrides };
  }

  it("is unsatisfied and blocking before any review round has run", () => {
    const criteria = computeG5ExitCriteria(emptyPeerReviewHistory());
    expect(criteria).toHaveLength(1);
    expect(criteria[0].satisfied).toBe(false);
    expect(criteria[0].blocking).toBe(true);
  });

  it("is satisfied once a round has run with no critical findings", () => {
    const history = { rounds: [round({ lensReviews: [{ lens: "argument" as const, findings: [{ summary: "s", detail: "d", severity: "minor" as const, sectionKeys: ["introduction"] }], overallAssessment: "Solid overall." }] })] };
    const criteria = computeG5ExitCriteria(history);
    expect(criteria.every((c) => c.satisfied)).toBe(true);
  });

  it("is unsatisfied while the most recent round has an unresolved critical finding", () => {
    const history = {
      rounds: [round({ lensReviews: [{ lens: "evidence" as const, findings: [{ summary: "s", detail: "d", severity: "critical" as const, sectionKeys: ["results"] }], overallAssessment: "Serious problem." }] })],
    };
    const criteria = computeG5ExitCriteria(history);
    expect(criteria.find((c) => c.id === "no-unresolved-critical-findings")?.satisfied).toBe(false);
  });

  it("only judges the MOST RECENT round — an earlier round's critical finding no longer blocks once a later round has none", () => {
    const history = {
      rounds: [
        round({ roundNumber: 1, lensReviews: [{ lens: "evidence" as const, findings: [{ summary: "s", detail: "d", severity: "critical" as const, sectionKeys: ["results"] }], overallAssessment: "x" }] }),
        round({ roundNumber: 2, lensReviews: [{ lens: "evidence" as const, findings: [], overallAssessment: "Addressed in revision." }] }),
      ],
    };
    const criteria = computeG5ExitCriteria(history);
    expect(criteria.every((c) => c.satisfied)).toBe(true);
  });
});

describe("app/conductor: G6 bound to the Rubric", () => {
  it("a document with a missing required section produces unsatisfied blocking criteria", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const doc = emptyDocument("d1", "Test");
    const report = evaluateAgainstOutputType(assignment, doc);
    const criteria = computeG6ExitCriteria(report);
    expect(criteria.some((c) => !c.satisfied && c.blocking)).toBe(true);
  });

  it("a complete, compliant document produces all-satisfied G6 criteria, and the gate becomes ready once G5 is signed off", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "title_page", "paragraph", "Title");
    doc = appendBlock(doc, "introduction", "paragraph", words(150));
    doc = appendBlock(doc, "body", "paragraph", words(900));
    doc = appendBlock(doc, "conclusion", "paragraph", words(140));
    doc = appendBlock(doc, "references", "paragraph", "Ref.");

    const report = evaluateAgainstOutputType(assignment, doc);
    expect(report.readyForG6).toBe(true);

    // Bring the project through G0-G5 with trivially-satisfied criteria, since
    // those pipelines aren't built yet (docs 13 §8.3) — this test's subject
    // is G6's binding to the Rubric, not the earlier gates.
    let project: ProjectGateState = initialProjectGateState("p1");
    for (const gate of ["G0", "G1", "G2", "G3", "G4", "G5"] as const) {
      project = updateExitCriteria(project, gate, [{ id: "x", description: "x", satisfied: true, blocking: true }]);
      project = signOffGate(project, gate, "u", `hash-${gate}`);
    }
    expect(project.gates.G6.entrySatisfied).toBe(true);

    project = updateExitCriteria(project, "G6", computeG6ExitCriteria(report));
    expect(project.gates.G6.status).toBe("ready");
  });

  it("not_applicable findings (an evaluator that doesn't exist yet) are surfaced as non-blocking, never as a silent pass", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const doc = emptyDocument("d1", "Test");
    const report = evaluateAgainstOutputType(assignment, doc);
    // None of OT-01's compiled rules are currently not_applicable (only word_count/structural_presence exist),
    // so assert the general contract on a synthetic finding instead.
    const criteria = computeG6ExitCriteria({
      ...report,
      findings: [
        { ruleId: "synthetic", status: "not_applicable", severity: "required", message: "not run" },
      ],
    });
    expect(criteria[0].blocking).toBe(false);
    expect(criteria[0].description).toContain("not yet automatically verified");
  });
});

describe("app/conductor: G7 bound to export pre-flight and the Rubric", () => {
  it("without a document, is unsatisfied and blocking", () => {
    const criteria = computeG7ExitCriteria(undefined, undefined);
    expect(criteria).toHaveLength(1);
    expect(criteria[0].satisfied).toBe(false);
    expect(criteria[0].blocking).toBe(true);
  });

  it("fails pre-flight for a document with no title and no content", () => {
    const doc = { id: "d1", title: "", blocks: [] };
    const criteria = computeG7ExitCriteria(doc, undefined);
    const preflightCriterion = criteria.find((c) => c.id === "export-preflight-passes")!;
    expect(preflightCriterion.satisfied).toBe(false);
    expect(preflightCriterion.description).toContain("no title");
  });

  it("passes pre-flight for a real, non-empty document", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    let doc = emptyDocument("d1", "Test Assignment");
    doc = appendBlock(doc, "title_page", "paragraph", "Title");
    doc = appendBlock(doc, "introduction", "paragraph", words(150));
    doc = appendBlock(doc, "body", "paragraph", words(900));
    doc = appendBlock(doc, "conclusion", "paragraph", words(140));
    doc = appendBlock(doc, "references", "paragraph", "Ref.");

    const report = evaluateAgainstOutputType(assignment, doc);
    const criteria = computeG7ExitCriteria(doc, report);
    expect(criteria.find((c) => c.id === "export-preflight-passes")?.satisfied).toBe(true);
    expect(criteria.find((c) => c.id === "export-compliance-clear")?.satisfied).toBe(true);
  });

  it("is unsatisfied on the compliance criterion while there are unresolved blocking Rubric findings", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const doc = emptyDocument("d1", "Test");
    const withTitleBlock = { ...doc, blocks: [{ id: "b1", kind: "paragraph" as const, text: "Some content so pre-flight itself passes." }] };
    const report = evaluateAgainstOutputType(assignment, withTitleBlock);
    const criteria = computeG7ExitCriteria(withTitleBlock, report);
    expect(criteria.find((c) => c.id === "export-compliance-clear")?.satisfied).toBe(false);
  });

  it("reports compliance as not yet satisfied, honestly, when no Rubric report has been computed", () => {
    const doc = { id: "d1", title: "Test", blocks: [{ id: "b1", kind: "paragraph" as const, text: "Some content." }] };
    const criteria = computeG7ExitCriteria(doc, undefined);
    const complianceCriterion = criteria.find((c) => c.id === "export-compliance-clear")!;
    expect(complianceCriterion.satisfied).toBe(false);
    expect(complianceCriterion.description).toContain("not been evaluated");
  });

  it("end-to-end: G7 becomes ready once G6 is signed off and both criteria are satisfied", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "title_page", "paragraph", "Title");
    doc = appendBlock(doc, "introduction", "paragraph", words(150));
    doc = appendBlock(doc, "body", "paragraph", words(900));
    doc = appendBlock(doc, "conclusion", "paragraph", words(140));
    doc = appendBlock(doc, "references", "paragraph", "Ref.");
    const report = evaluateAgainstOutputType(assignment, doc);

    let project: ProjectGateState = initialProjectGateState("p1");
    for (const gate of ["G0", "G1", "G2", "G3", "G4", "G5"] as const) {
      project = updateExitCriteria(project, gate, [{ id: "x", description: "x", satisfied: true, blocking: true }]);
      project = signOffGate(project, gate, "u", `hash-${gate}`);
    }
    project = updateExitCriteria(project, "G6", computeG6ExitCriteria(report));
    project = signOffGate(project, "G6", "u", "hash-G6");
    expect(project.gates.G7.entrySatisfied).toBe(true);

    project = updateExitCriteria(project, "G7", computeG7ExitCriteria(doc, report));
    expect(project.gates.G7.status).toBe("ready");
  });
});

describe("app/conductor: state hash and staleness", () => {
  it("signing off records a hash, and re-signing with the same content is not stale", async () => {
    let project = initialProjectGateState("p1");
    project = updateExitCriteria(project, "G0", [{ id: "a", description: "a", satisfied: true, blocking: true }]);
    const snapshot = { answers: { topic: "water policy" } };
    project = await signOff(project, "G0", "amara", snapshot);
    const stale = await isSignoffStale(project.gates.G0, snapshot);
    expect(stale).toBe(false);
  });

  it("a changed snapshot is detected as stale", async () => {
    let project = initialProjectGateState("p1");
    project = updateExitCriteria(project, "G0", [{ id: "a", description: "a", satisfied: true, blocking: true }]);
    project = await signOff(project, "G0", "amara", { answers: { topic: "water policy" } });
    const stale = await isSignoffStale(project.gates.G0, { answers: { topic: "something else entirely" } });
    expect(stale).toBe(true);
  });

  it("a gate with no sign-off yet is never reported as stale", async () => {
    const project = initialProjectGateState("p1");
    const stale = await isSignoffStale(project.gates.G1, { anything: true });
    expect(stale).toBe(false);
  });
});

describe("app/conductor: invalidation from a real re-target scenario (docs 26 Journey 3, in miniature)", () => {
  it("re-evaluating G6 after content changes requires invalidating first, then recomputing", async () => {
    const assignment = catalog.getOrThrow("OT-01");
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "title_page", "paragraph", "Title");
    doc = appendBlock(doc, "introduction", "paragraph", words(150));
    doc = appendBlock(doc, "body", "paragraph", words(900));
    doc = appendBlock(doc, "conclusion", "paragraph", words(140));
    doc = appendBlock(doc, "references", "paragraph", "Ref.");

    let project: ProjectGateState = initialProjectGateState("p1");
    for (const gate of ["G0", "G1", "G2", "G3", "G4", "G5"] as const) {
      project = updateExitCriteria(project, gate, [{ id: "x", description: "x", satisfied: true, blocking: true }]);
      project = signOffGate(project, gate, "u", `hash-${gate}`);
    }
    const report1 = evaluateAgainstOutputType(assignment, doc);
    project = updateExitCriteria(project, "G6", computeG6ExitCriteria(report1));
    project = await signOff(project, "G6", "u", report1);
    expect(project.gates.G6.status).toBe("signed_off");

    // Content changes (e.g. body ballooned past the limit).
    const changedDoc = appendBlock(doc, "extra", "paragraph", words(5000));
    project = invalidateGate(project, "G6", "content changed after sign-off");
    expect(project.gates.G6.status).toBe("invalidated");

    const report2 = evaluateAgainstOutputType(assignment, changedDoc);
    project = updateExitCriteria(project, "G6", computeG6ExitCriteria(report2));
    expect(project.gates.G6.status).not.toBe("signed_off");
  });
});

describe("app/conductor: summarize", () => {
  it("produces one summary entry per gate, in order, with human-readable names", () => {
    const project = initialProjectGateState("p1");
    const summary = summarize(project);
    expect(summary).toHaveLength(8);
    expect(summary[0]).toMatchObject({ gate: "G0", name: "Intake" });
    expect(summary[7]).toMatchObject({ gate: "G7", name: "Export" });
  });

  it("lists outstanding blocking criteria by description", () => {
    let project = initialProjectGateState("p1");
    project = updateExitCriteria(project, "G0", [
      { id: "a", description: "Topic answered", satisfied: false, blocking: true },
    ]);
    const summary = summarize(project);
    expect(summary[0].outstandingBlocking).toContain("Topic answered");
  });
});
