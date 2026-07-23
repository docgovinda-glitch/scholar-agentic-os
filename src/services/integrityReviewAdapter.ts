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
 * Consequence, disclosed rather than hidden: integrityReviewerSkill.ts's
 * issue-detection logic only inspects researchPlan/literatureReview/
 * methodologyReport/statisticalAnalysisReport — it never reads
 * manuscriptText at all (a pre-existing gap in the skill itself, not
 * introduced here). So a review built from this adapter alone will report
 * zero detected/blocking issues and publicationReadiness: true regardless of
 * the manuscript's actual content — only the (separately flagged, already
 * fabricated — see integrityReviewerSkill.ts's own file comment)
 * reportingCompliance section produces any output at all. This wiring is
 * still honest in the sense that matters: it reflects what the agent
 * genuinely can and can't do today, rather than papering over the gap.
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
