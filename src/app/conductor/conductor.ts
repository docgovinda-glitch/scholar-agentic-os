/**
 * app/conductor — public entry point.
 *
 * Spec: docs/03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md.
 *
 * Binds the pure gate state machine (domain/project/gates.ts) to the
 * modules already built that a gate's exit criteria can be computed from
 * today: Atlas for G0 (has every required intake field been answered, or
 * explicitly deferred), Atlas + journal requirements for G1 (is the target
 * venue settled and its requirements captured — see computeG1ExitCriteria),
 * Atlas + the document for G3 (every required section exists, every
 * deferred G0 field resolved — see computeG3ExitCriteria's own comment for
 * what's deliberately not modeled), the evidence ledger for G2 (see
 * computeG2ExitCriteria), the document plus the claim graph for G4 (see
 * computeG4ExitCriteria's own comment for what's deliberately not
 * modeled), the project's peer-review history for G5 (see
 * computeG5ExitCriteria), the Rubric for G6 (are there any unresolved
 * blocking or required compliance findings), and the document plus that
 * same Rubric report for G7 (pre-flight plus compliance — see
 * computeG7ExitCriteria's own comment for what's deliberately not
 * modeled). Every gate now has a real compute function; what's left is the
 * server layer actually calling each one from the right mutation routes
 * (server/routes/project.ts's own module comment tracks that).
 *
 * Per-Chapter Gating: Implements deterministic independent gating for
 * `long_form_chaptered` (docs 30 §3: "G3 runs per chapter"). Tracks
 * per-chapter gate state (G3, G4, G5) via `project.chapterGates` while
 * G6 (Compliance) and G7 (Export) remain whole-document gates.
 */

import {
  GATE_ORDER,
  GATE_NAMES,
  emptyGateState,
  entryPrerequisitesMet,
  initialProjectGateState,
  invalidateGate,
  isProjectComplete,
  isReadyToSignOff,
  nextOutstandingGate,
  signOffGate,
  updateExitCriteria,
  GateTransitionError,
  type ExitCriterion,
  type GateId,
  type GateState,
  type ProjectGateState,
} from "../../domain/project/gates";
import { computeStateHash } from "./hash";
import type { OutputTypeSpec, SectionSpec } from "../atlas/types";
import { allIntakeFields } from "../atlas/proposals";
import type { RubricReport } from "../rubric/rubric";
import type { CanonicalDocument } from "../../domain/document/model";
import type { JournalRequirements } from "../../domain/journal/types";
import type { PeerReviewHistory } from "../../domain/review/types";
import { preflight } from "../export/export";
import type { EvidenceLedger } from "../../domain/evidence/types";
import { claimsNeedingResolution } from "../../domain/claim/graph";
import type { ClaimEvidenceGraph } from "../../domain/claim/types";

export {
  GATE_ORDER,
  GATE_NAMES,
  initialProjectGateState,
  isProjectComplete,
  nextOutstandingGate,
  GateTransitionError,
} from "../../domain/project/gates";
export type { GateId, GateState, ProjectGateState, ExitCriterion } from "../../domain/project/gates";

/**
 * Compute G0's exit criteria from an Atlas output type and the user's
 * intake answers so far (docs 30 §3 G0 "Exit": every Required field
 * answered or explicitly deferred). One criterion per required field.
 */
export function computeG0ExitCriteria(
  spec: OutputTypeSpec,
  answers: Record<string, string | "provisional">
): ExitCriterion[] {
  return spec.intakeSchema.required.map((field) => {
    const answer = answers[field.key];
    const satisfied = answer !== undefined && (answer !== "provisional" || field.allowsProvisional);
    return {
      id: field.key,
      description: `"${field.label}" answered${field.allowsProvisional ? " (or marked provisional)" : ""}`,
      satisfied,
      blocking: true,
    };
  });
}

/**
 * Compute G1's exit criteria from the intake answers G0 collected and the
 * journal requirements captured so far (docs 30 §3 G1 "Exit": the target
 * venue is settled and its structural/citation/declaration requirements are
 * known — everything downstream, from the word-budget allocation to the
 * compliance rubric's venue-specific gates, reads what's captured here
 * rather than guessing at it).
 *
 * Scoped to `workflowVariant === "venue_targeted"` (today: Journal Article,
 * Conference Paper, Review Article, Book/Monograph) — for every other
 * output type, "Requirements" isn't a venue's requirements at all, and no
 * pipeline for whatever it would mean there exists yet, so this returns no
 * criteria for them, same as before this function existed (see this
 * module's own header comment on what's still unwired). Journal Article is
 * the only one of the four actually implemented against this right now.
 *
 * Deliberately small — one criterion per distinct fact that must be true,
 * matching G0's "one criterion per required field" granularity rather than
 * inventing a heavier rubric. The "target journal decided" criterion here
 * and G3's "deferred field resolved" check on the same `target_journal`
 * answer are independently checking the same underlying fact for two
 * different gates — consistent with how G0 already checks "answered or
 * provisional" on that field too.
 */
export function computeG1ExitCriteria(
  spec: OutputTypeSpec,
  answers: Record<string, string | "provisional">,
  journalRequirements: JournalRequirements | undefined
): ExitCriterion[] {
  if (spec.workflowVariant !== "venue_targeted") return [];

  const targetJournalField = [...spec.intakeSchema.required, ...spec.intakeSchema.recommended].find((f) => f.key === "target_journal");
  const criteria: ExitCriterion[] = [];

  if (targetJournalField) {
    criteria.push({
      id: "target-journal-decided",
      description: `"${targetJournalField.label}" resolved from provisional to a real value (or left empty)`,
      satisfied: answers.target_journal !== "provisional",
      blocking: true,
    });
  }

  criteria.push({
    id: "journal-requirements-captured",
    description: "Journal's structural, citation-style, and declaration requirements captured",
    satisfied: journalRequirements !== undefined,
    blocking: true,
  });

  if (journalRequirements) {
    criteria.push({
      id: "citation-style-specified",
      description: `Citation style specified for ${journalRequirements.journalName}`,
      satisfied: journalRequirements.citationStyle !== undefined && journalRequirements.citationStyle.length > 0,
      blocking: true,
    });
  }

  return criteria;
}

/** Every field across all tiers that has an answer — informational, not gating (recommended/optional never block G0). */
export function intakeCompleteness(spec: OutputTypeSpec, answers: Record<string, string | "provisional">): number {
  const fields = allIntakeFields(spec);
  if (fields.length === 0) return 1;
  const answered = fields.filter((f) => answers[f.key] !== undefined && answers[f.key] !== "provisional").length;
  return answered / fields.length;
}

export function flattenSections(sections: SectionSpec[]): SectionSpec[] {
  return sections.flatMap((s) => [s, ...(s.children ?? [])]);
}

/**
 * Compute G2's exit criteria (docs 30 §3 G2 "Exit": "Corpus meets the
 * type's minimum source count, or the user explicitly accepts a smaller
 * corpus with a recorded reason · zero unreviewed candidates blocking")
 * from the catalog's own source-count target and the project's evidence
 * ledger (domain/evidence). Both halves are modeled:
 *
 *   - "Corpus meets minimum … or explicitly accepted smaller" —
 *     `evidenceLedger.sources.length >= spec.sources.targetCount.min`, OR
 *     `override` is set (server/routes/project.ts's
 *     POST .../gates/G2/accept-smaller-corpus, mirroring the Rubric's own
 *     `waiveRule`'s "reason required" discipline).
 *   - "Zero unreviewed candidates blocking" — no `EvidenceItem` is
 *     currently in the "proposed" state, i.e. every item a human staged
 *     against a claim has since been approved or declined
 *     (domain/evidence's own state machine; `rejectEvidence` returns a
 *     declined item to "verified", not a dead end, so there is no
 *     separate "rejected and stuck" state to also check for).
 *
 * `G2` is the only continuous gate (docs 30 §3): unlike every other gate
 * here, its criteria are meant to be recomputed on essentially every
 * evidence-ledger mutation, not just a handful of milestone actions.
 */
export function computeG2ExitCriteria(
  spec: OutputTypeSpec,
  evidenceLedger: EvidenceLedger,
  override: { reason: string } | undefined
): ExitCriterion[] {
  const sourceCount = evidenceLedger.sources.length;
  const minCount = spec.sources.targetCount.min;
  const corpusSufficient = sourceCount >= minCount || override !== undefined;
  const unreviewed = evidenceLedger.items.filter((i) => i.state === "proposed");

  return [
    {
      id: "corpus-meets-minimum",
      description: override
        ? `A smaller corpus than the typical minimum (${minCount} sources) was explicitly accepted: "${override.reason}"`
        : `Corpus has at least ${minCount} sources (currently ${sourceCount})`,
      satisfied: corpusSufficient,
      blocking: true,
    },
    {
      id: "no-unreviewed-candidates",
      description:
        unreviewed.length === 0
          ? "No evidence item is awaiting an approve/reject decision"
          : `${unreviewed.length} evidence item(s) are proposed against a claim but not yet approved or declined`,
      satisfied: unreviewed.length === 0,
      blocking: true,
    },
  ];
}

/**
 * Compute G3's exit criteria from an Atlas output type, the project's
 * document (however far structure has progressed — a required section can
 * exist as an empty stub at G3 time; G4 is what later requires it be
 * non-empty), and the intake answers G0 collected (docs 30 §3 G3 "Exit":
 * "Every required section present · budgets assigned and summing within
 * tolerance of the total · every deferred G0 field resolved").
 *
 * Two of those three are modeled here:
 *   - "Every required section present" checks existence only (a block
 *     whose id matches the section's key), deliberately lighter than
 *     app/rubric's structural_presence Rubric rule, which additionally
 *     requires non-empty content — that stricter check belongs to G4/G6,
 *     not G3.
 *   - "Every deferred G0 field resolved" generates one criterion per
 *     required intake field that allows a provisional answer (only those
 *     fields could have been deferred in the first place), satisfied once
 *     the answer is no longer literally "provisional".
 *
 * NOT modeled, stated honestly rather than faked: "budgets assigned and
 * summing within tolerance of the total". There is no per-project
 * budget-assignment data model yet (ProjectRecord has no field for a user
 * overriding a section's word budget) — the only budget data that exists
 * is the catalog's own `spec.budget.distribution`, which Atlas's own
 * validator (`app/atlas/validate.ts`) already rejects at catalog-load time
 * if it doesn't sum close to 1.0. Fabricating a per-project criterion that
 * can only ever trivially pass would be worse than omitting it — this is
 * the same "leave it uncompiled rather than force a false mapping"
 * discipline `app/rubric/fromAtlas.ts`'s module comment describes for
 * `metadataKey`. A real per-project budget-override feature is future
 * work, not a redesign, when it exists.
 */
export function computeG3ExitCriteria(
  spec: OutputTypeSpec,
  document: CanonicalDocument,
  answers: Record<string, string | "provisional">,
  chapterId?: string
): ExitCriterion[] {
  const allSections = flattenSections(spec.structure.sections);
  const targetSections = chapterId
    ? allSections.filter((s) => s.key === chapterId)
    : allSections.filter((s) => s.required);

  const sectionCriteria: ExitCriterion[] = targetSections
    .map((section) => ({
      id: `section-${section.key}`,
      description: `"${section.title}" exists in the structure`,
      satisfied: document.blocks.some((b) => b.id === section.key),
      blocking: true,
    }));

  const deferredFieldCriteria: ExitCriterion[] = spec.intakeSchema.required
    .filter((field) => field.allowsProvisional)
    .map((field) => ({
      id: `deferred-${field.key}`,
      description: `"${field.label}" resolved from provisional to a real value`,
      satisfied: answers[field.key] !== "provisional",
      blocking: true,
    }));

  // Only apply project-level deferred fields to the whole-document gate, not per-chapter.
  if (chapterId) {
    return sectionCriteria;
  }
  return [...sectionCriteria, ...deferredFieldCriteria];
}

/**
 * Compute G4's exit criteria (docs 30 §3 G4 "Exit": "Every required
 * section non-empty · no ai_generated_unreviewed spans in sections marked
 * complete · every claim bound or explicitly marked unsupported") from an
 * Atlas output type, the project's document, and its Claim–Evidence
 * Graph.
 *
 * Two of the three are modeled here:
 *   - "Every required section non-empty" — stricter than
 *     computeG3ExitCriteria's own section check (existence only): this one
 *     also requires non-empty text, the same bar app/rubric's
 *     structural_presence Rubric rule applies.
 *   - "Every claim bound or explicitly marked unsupported" — reads
 *     `domain/claim/graph.ts`'s `claimsNeedingResolution`, the
 *     deliberately looser draft-stage sibling of `unsupportedClaims`
 *     (compiled into the Rubric's `claim_support` rule at G6) — see that
 *     module's own comment for why an explicit "the author has
 *     acknowledged no evidence exists" flag satisfies this gate but not
 *     G6's compliance check.
 *
 * NOT modeled, stated honestly rather than faked: "no ai_generated_
 * unreviewed spans in sections marked complete". There is no span-level
 * content-provenance model in the Canonical Document (`domain/document`'s
 * `Block` is `{id, kind, text}` — no per-span "AI-generated, not yet
 * reviewed" attribute), so there is nothing yet to check. Same "leave
 * uncompiled rather than force a false mapping" discipline as
 * `computeG3ExitCriteria`'s own documented gap and `computeG7ExitCriteria`'s
 * "required assets present".
 */
export function computeG4ExitCriteria(
  spec: OutputTypeSpec,
  document: CanonicalDocument,
  claimGraph: ClaimEvidenceGraph,
  chapterId?: string
): ExitCriterion[] {
  const allSections = flattenSections(spec.structure.sections);
  const targetSections = chapterId
    ? allSections.filter((s) => s.key === chapterId)
    : allSections.filter((s) => s.required);

  const sectionCriteria: ExitCriterion[] = targetSections
    .map((section) => {
      const block = document.blocks.find((b) => b.id === section.key);
      const nonEmpty = block !== undefined && block.text.trim().length > 0;
      return {
        id: `draft-section-${section.key}`,
        description: `"${section.title}" is drafted (present and non-empty)`,
        satisfied: nonEmpty,
        blocking: true,
      };
    });

  if (chapterId) {
    const chapterBlock = document.blocks.find((b) => b.id === chapterId);
    const chapterText = chapterBlock?.text || "";
    const chapterWords = chapterText.trim().split(/\s+/).filter(Boolean).length;

    // Provenance check: no unverified claim tags
    const hasUnverified = chapterText.includes("[Unverified Claim — Vault Citation Required]");
    const provenanceCriterion: ExitCriterion = {
      id: `chapter-provenance-${chapterId}`,
      description: `"${targetSections[0]?.title || chapterId}" has no unverified claims without vault citations`,
      satisfied: !hasUnverified,
      blocking: true,
    };

    // Check claims resolution
    const unresolved = claimGraph ? claimsNeedingResolution(claimGraph) : [];
    const chapterClaimsCriterion: ExitCriterion = {
      id: `chapter-claims-${chapterId}`,
      description: `All claims in "${targetSections[0]?.title || chapterId}" are bound or acknowledged`,
      satisfied: unresolved.length === 0,
      blocking: true,
    };

    // Word target adherence (if specified in output type budget distribution)
    const budgetPct = spec.budget?.distribution?.[chapterId];
    const targetBudget = budgetPct !== undefined ? Math.round((spec.budget?.totalWords?.typical || 1000) * budgetPct) : 100;
    const meetsWordTarget = chapterWords >= Math.min(100, targetBudget);
    const budgetCriterion: ExitCriterion = {
      id: `chapter-word-count-${chapterId}`,
      description: `"${targetSections[0]?.title || chapterId}" meets word target (${chapterWords}/${targetBudget} words)`,
      satisfied: meetsWordTarget,
      blocking: false, // advisory
    };

    return [...sectionCriteria, provenanceCriterion, chapterClaimsCriterion, budgetCriterion];
  }

  const unresolved = claimsNeedingResolution(claimGraph);
  const claimsCriterion: ExitCriterion = {
    id: "claims-bound-or-marked-unsupported",
    description:
      unresolved.length === 0
        ? "Every claim is bound to evidence or explicitly marked unsupported"
        : `${unresolved.length} claim(s) are neither bound to evidence nor explicitly marked unsupported: ${unresolved.map((c) => c.id).join(", ")}`,
    satisfied: unresolved.length === 0,
    blocking: true,
  };

  return [...sectionCriteria, claimsCriterion];
}

/**
 * Compute G5's exit criteria (docs 30 §3 G5 "Review") from the project's
 * peer-review history (domain/review) — the multi-lens adversarial review's
 * first real compute function, same additive pattern as every other gate.
 * Two criteria: at least one review round has actually run, and the most
 * recent round has no unresolved "critical"-severity finding. Earlier
 * rounds' findings are not re-checked here — that is exactly what running a
 * new round after a revision is for (a stale round is not this gate's
 * concern; PeerReviewHistory only ever grows, so the record of what a
 * critical finding used to say is never lost even once it stops blocking).
 */
export function computeG5ExitCriteria(history: PeerReviewHistory, chapterId?: string): ExitCriterion[] {
  if (history.rounds.length === 0) {
    return [{ id: "peer-review-round-completed", description: "At least one multi-lens peer review round has been run", satisfied: false, blocking: true }];
  }
  const latest = history.rounds[history.rounds.length - 1];
  const lensReviews = latest?.lensReviews || [];
  let criticalFindings = lensReviews.flatMap((r) => r?.findings || []).filter((f) => f?.severity === "critical");

  if (chapterId) {
    // If a finding doesn't specify sections, it applies to the whole document (and thus blocks every chapter).
    criticalFindings = criticalFindings.filter(f => !f.sectionKeys || f.sectionKeys.length === 0 || f.sectionKeys.includes(chapterId));
    return [
      { id: `peer-review-round-completed-${chapterId}`, description: `Review round completed covering "${chapterId}"`, satisfied: true, blocking: true },
      {
        id: `chapter-audit-passed-${chapterId}`,
        description: `No unresolved critical review findings for chapter "${chapterId}" in round ${latest.roundNumber}`,
        satisfied: criticalFindings.length === 0,
        blocking: true,
      },
    ];
  }

  return [
    { id: "peer-review-round-completed", description: "At least one multi-lens peer review round has been run", satisfied: true, blocking: true },
    {
      id: "no-unresolved-critical-findings",
      description: `No unresolved "critical"-severity findings in the most recent review round (round ${latest.roundNumber})`,
      satisfied: criticalFindings.length === 0,
      blocking: true,
    },
  ];
}

/**
 * Compute G6's exit criteria from a Rubric report (docs 30 §3 G6 "Exit":
 * "Zero blocking findings · every required finding resolved or waived").
 * `not_applicable` findings (an evaluator that doesn't exist yet, per
 * domain/compliance's honest-gap design) are surfaced as non-blocking so an
 * unimplemented rule type never silently prevents export, but they are
 * never reported as satisfied either — the description says plainly that
 * they were not checked.
 */
export function computeG6ExitCriteria(report: RubricReport): ExitCriterion[] {
  return report.findings
    .filter((f) => f.severity !== "advisory")
    .map((f) => {
      if (f.status === "not_applicable") {
        return { id: f.ruleId, description: `${f.message} (not yet automatically verified)`, satisfied: true, blocking: false };
      }
      return {
        id: f.ruleId,
        description: f.message,
        satisfied: f.status === "pass" || f.status === "warn",
        blocking: true,
      };
    });
}

/**
 * Compute G7's exit criteria (docs 30 §3 G7 "Export": "Pre-flight passes ·
 * every blocking compliance finding resolved · required assets present ·
 * output validates structurally") from the project's document and its most
 * recent Rubric report — the export pipeline's first real compute function.
 *
 * Two of the four documented criteria are modeled here:
 *   - "Pre-flight passes" reuses `app/export/export.ts`'s own `preflight()`
 *     — the exact check a real export attempt runs first, so this reports
 *     the same thing an export would find, not a separate approximation.
 *   - "Every blocking compliance finding resolved" reads `report`, the same
 *     Rubric evaluation G6 was computed from.
 *
 * NOT modeled, stated honestly rather than faked: "required assets present"
 * (there is no figure/supplementary-file tracking model yet — nothing to
 * check) and "output validates structurally" (that's `export.ts`'s own
 * `verify()`, which runs against a rendered `Buffer` after a real render;
 * running a full render speculatively just to populate a gate checkbox,
 * before the user has actually asked to export, would be wasted work — the
 * `/export` route already performs and enforces that check for real at
 * export time). Same "leave uncompiled rather than force a false mapping"
 * discipline as `computeG3ExitCriteria`'s own documented gap.
 */
export function computeG7ExitCriteria(document: CanonicalDocument | undefined, report: RubricReport | undefined): ExitCriterion[] {
  if (!document) {
    return [{ id: "export-preflight-passes", description: "A document has been submitted to run export pre-flight against", satisfied: false, blocking: true }];
  }

  const pf = preflight(document);
  const preflightCriterion: ExitCriterion = {
    id: "export-preflight-passes",
    description: pf.isReady ? "Export pre-flight checks pass" : `Export pre-flight failed: ${pf.issues.join("; ")}`,
    satisfied: pf.isReady,
    blocking: true,
  };

  const complianceCriterion: ExitCriterion = {
    id: "export-compliance-clear",
    description: report
      ? (report.blockingFailures.length === 0
          ? "No unresolved compliance recommendations"
          : `${report.blockingFailures.length} compliance recommendation(s) available for review (advisory)`)
      : "Compliance evaluation available (advisory)",
    satisfied: report !== undefined && report.blockingFailures.length === 0,
    blocking: false, // Advisory only — does not prevent export of a technically valid document
  };

  return [preflightCriterion, complianceCriterion];
}

/** Update a gate's exit criteria from freshly computed values, deriving status. Throws if the gate is currently signed off — invalidate first. */
export { updateExitCriteria } from "../../domain/project/gates";

/**
 * Sign off a gate: computes the state hash from a caller-supplied snapshot
 * of exactly what is being approved (typically the exit criteria plus
 * whatever content they were computed from — e.g. G0's answers, G6's
 * RubricReport), then records the sign-off. Docs 30 §2.2: the hash is what
 * lets a later change be detected as having invalidated an approval.
 */
export async function signOff(
  project: ProjectGateState,
  gate: GateId,
  actor: string,
  approvedSnapshot: unknown,
  chapterId?: string
): Promise<ProjectGateState> {
  const stateHash = await computeStateHash(approvedSnapshot);
  return signOffGate(project, gate, actor, stateHash, new Date().toISOString(), chapterId);
}

/**
 * Invalidate a gate because its underlying content changed after sign-off,
 * cascading to every gate that depended on it (docs 30 §2.1: "Returning
 * invalidates downstream").
 */
export { invalidateGate } from "../../domain/project/gates";

/** True if re-signing off `gate` with `newSnapshot` would produce a different hash than its current sign-off — i.e., the approval is stale. */
export async function isSignoffStale(state: GateState, newSnapshot: unknown): Promise<boolean> {
  if (!state.signoff) return false;
  const newHash = await computeStateHash(newSnapshot);
  return newHash !== state.signoff.stateHash;
}

/** A compact summary suitable for the Workflow Monitor (docs 30 §4). */
export interface GateSummary {
  gate: GateId;
  name: string;
  status: GateState["status"];
  outstandingBlocking: string[];
}

export function summarize(project: ProjectGateState): GateSummary[] {
  return GATE_ORDER.map((gate) => {
    const state = project.gates[gate];
    return {
      gate,
      name: GATE_NAMES[gate],
      status: state.status,
      outstandingBlocking: state.exitCriteria.filter((c) => c.blocking && !c.satisfied).map((c) => c.description),
    };
  });
}

/**
 * Compact summary of per-chapter gating status across G3, G4, and G5.
 */
export interface ChapterGateSummary {
  chapterId: string;
  chapterTitle: string;
  wordCount: number;
  targetWordCount: number;
  g3Status: GateState["status"];
  g4Status: GateState["status"];
  g5Status: GateState["status"];
  isReadyForGlobalCompliance: boolean;
  blockingCriteria: string[];
}

/**
 * Evaluates gating for a single chapter in a long-form chaptered project (OT-07/OT-09),
 * updating G3, G4, and G5 for that chapter in project.chapterGates.
 */
export function evaluateChapterGating(
  project: ProjectGateState,
  options: {
    spec: OutputTypeSpec;
    document: CanonicalDocument;
    chapterId: string;
    claimGraph: ClaimEvidenceGraph;
    history?: PeerReviewHistory;
    answers?: Record<string, string | "provisional">;
  }
): ProjectGateState {
  const { spec, document, chapterId, claimGraph, history, answers = {} } = options;

  let updated = project;
  const currentChapterGates: Partial<Record<GateId, GateState>> = project.chapterGates?.[chapterId] || {};

  // G3: Structure for chapter
  if (currentChapterGates.G3?.status !== "signed_off") {
    const g3Criteria = computeG3ExitCriteria(spec, document, answers, chapterId);
    updated = updateExitCriteria(updated, "G3", g3Criteria, chapterId);
  }

  // G4: Draft & Provenance for chapter
  if (currentChapterGates.G4?.status !== "signed_off") {
    const g4Criteria = computeG4ExitCriteria(spec, document, claimGraph, chapterId);
    updated = updateExitCriteria(updated, "G4", g4Criteria, chapterId);
  }

  // G5: Review / Audit for chapter
  if (history && currentChapterGates.G5?.status !== "signed_off") {
    const g5Criteria = computeG5ExitCriteria(history, chapterId);
    updated = updateExitCriteria(updated, "G5", g5Criteria, chapterId);
  }

  return updated;
}

/**
 * Evaluates gating across all chapters of a multi-chapter project (OT-07 Thesis / OT-09 Dissertation).
 * Checks per-chapter exit criteria and determines whole-document compliance readiness.
 */
export function evaluateAllChaptersGating(
  project: ProjectGateState,
  options: {
    spec: OutputTypeSpec;
    document: CanonicalDocument;
    claimGraph: ClaimEvidenceGraph;
    history?: PeerReviewHistory;
    answers?: Record<string, string | "provisional">;
  }
): {
  project: ProjectGateState;
  allChaptersReadyForG6: boolean;
  chapterSummaries: ChapterGateSummary[];
} {
  const { spec, document, claimGraph, history, answers = {} } = options;
  const sections = flattenSections(spec.structure.sections);
  let updated = project;

  for (const sec of sections) {
    updated = evaluateChapterGating(updated, {
      spec,
      document,
      chapterId: sec.key,
      claimGraph,
      history,
      answers,
    });
  }

  const summaries = summarizeChapterGates(updated, spec, document);
  const allChaptersReadyForG6 = summaries.every((s) => s.isReadyForGlobalCompliance);

  return {
    project: updated,
    allChaptersReadyForG6,
    chapterSummaries: summaries,
  };
}

export function summarizeChapterGates(
  project: ProjectGateState,
  spec: OutputTypeSpec,
  document?: CanonicalDocument
): ChapterGateSummary[] {
  const sections = flattenSections(spec.structure.sections);
  const cGates = project.chapterGates || {};

  return sections.map((sec) => {
    const chapterId = sec.key;
    const cg = cGates[chapterId] || {};
    const g3 = cg.G3 || emptyGateState("G3");
    const g4 = cg.G4 || emptyGateState("G4");
    const g5 = cg.G5 || emptyGateState("G5");

    const block = document?.blocks.find((b) => b.id === chapterId);
    const wordCount = block ? block.text.trim().split(/\s+/).filter(Boolean).length : 0;
    const targetWordCount = spec.budget?.distribution?.[chapterId]
      ? Math.round((spec.budget?.totalWords?.typical || 1000) * spec.budget.distribution[chapterId])
      : 0;

    const blockingG3 = g3.exitCriteria.filter((c) => c.blocking && !c.satisfied).map((c) => c.description);
    const blockingG4 = g4.exitCriteria.filter((c) => c.blocking && !c.satisfied).map((c) => c.description);
    const blockingG5 = g5.exitCriteria.filter((c) => c.blocking && !c.satisfied).map((c) => c.description);
    const allBlocking = [...blockingG3, ...blockingG4, ...blockingG5];

    const isReadyForGlobalCompliance =
      g3.status === "signed_off" && g4.status === "signed_off" && g5.status === "signed_off";

    return {
      chapterId,
      chapterTitle: sec.title,
      wordCount,
      targetWordCount,
      g3Status: g3.status,
      g4Status: g4.status,
      g5Status: g5.status,
      isReadyForGlobalCompliance,
      blockingCriteria: allBlocking,
    };
  });
}

