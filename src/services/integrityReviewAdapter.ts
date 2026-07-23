/**
 * Stage 10 (target-workflow.md) — PaperProject → IntegrityReviewerAgent input
 * adapter.
 *
 * Honesty note, same conclusion the earlier agent-wiring audit reached:
 * IntegrityReviewerInput's other fields (researchPlan, literatureReview,
 * knowledgeGapReport, researchQuestionReport, methodologyReport,
 * statisticalAnalysisReport) are each another agent's own structured output
 * type — PaperProject has no equivalent structured data for any of them, and
 * synthesizing fake versions just to populate them would be exactly the
 * fabricated-upstream-state pattern this project has deliberately avoided
 * elsewhere. This adapter maps only what's genuinely available on
 * PaperProject — the compiled manuscript text — and leaves every other field
 * undefined.
 *
 * Fixed 2026-07-23: integrityReviewerSkill.ts now actually reads
 * manuscriptText (pattern/keyword checks — placeholder text, ethics/data-
 * availability/COI disclosure presence, citation presence — plus a real
 * heading-presence scan feeding reportingCompliance and
 * structuralCompleteness). A review built from this adapter now reflects
 * real signal from the compiled manuscript text, not just the previously-
 * fabricated, always-identical reportingCompliance stub.
 */

import type { PaperProject } from "../types";
import type { IntegrityReviewerInput } from "../agents/integrityReviewer";

export function buildIntegrityReviewerInput(project: PaperProject): IntegrityReviewerInput {
  const manuscriptText = Object.entries(project.sections || {})
    .filter(([, text]) => text?.trim())
    .map(([section, text]) => `=== SECTION: ${section} ===\n${text}`)
    .join("\n\n");

  return {
    manuscriptText: manuscriptText || undefined,
    executionMode: "deterministic",
  };
}
