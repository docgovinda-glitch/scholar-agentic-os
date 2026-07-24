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
 * PaperProject — the compiled manuscript text, plus (2026-07-24) real
 * title/keywords/aiSettings — and leaves every other field undefined.
 *
 * Fixed 2026-07-23: integrityReviewerSkill.ts now actually reads
 * manuscriptText (pattern/keyword checks — placeholder text, ethics/data-
 * availability/COI disclosure presence, citation presence — plus a real
 * heading-presence scan feeding reportingCompliance and
 * structuralCompleteness). A review built from this adapter now reflects
 * real signal from the compiled manuscript text, not just the previously-
 * fabricated, always-identical reportingCompliance stub.
 *
 * Semantic peer review, added 2026-07-24
 * (docs/planning/semantic-peer-review-scoping.md): title/keywords are real
 * PaperProject fields, used only to derive a real search query for
 * literatureRetrievalService.discoverLiterature() — never invented. This
 * means the single-agent "Run Integrity & Ethics Review" button
 * (QualityControlSuite.tsx) now also makes a real retrieval + AI call when a
 * title is set, not just the instant structural scan it used to be —
 * a deliberate, additive enhancement of that existing button, not a
 * behavior it silently lost.
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
    title: project.title || undefined,
    keywords: project.keywords ? project.keywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
    aiSettings: project.aiSettings,
    executionMode: "deterministic",
  };
}
