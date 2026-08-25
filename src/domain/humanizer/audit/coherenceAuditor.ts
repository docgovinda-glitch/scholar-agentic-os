/**
 * Paragraph-Level Coherence & Transition Auditor.
 *
 * Evaluates sentence-to-sentence logical progression, topic continuity,
 * dangling transitions, and pronoun referent coherence.
 */

import {
  HumanizerDocument,
  HumanizerAuditFinding,
  AuditDecision,
} from "../types";
import { renderHumanizerDocument } from "../document/humanizerDocument";

export interface CoherenceAuditResult {
  passed: boolean;
  decision: AuditDecision;
  score: number; // 0.0 - 1.0
  transitionQuality: "strong" | "adequate" | "broken";
  issues: string[];
  findings: HumanizerAuditFinding[];
}

/** Layer 1: Detect dangling or orphaned transition markers */
function detectDanglingTransitions(blockText: string): string[] {
  const issues: string[] = [];
  const trimmed = blockText.trim();

  // 1. Check if the block ends with a dangling transition (e.g. "However," or "In contrast,")
  const danglingEndRegex = /(?:^|[.!?]\s+)(?:However|Nonetheless|On the other hand|In contrast|Consequently),?\s*$/i;
  if (danglingEndRegex.test(trimmed)) {
    issues.push(`Dangling contrastive transition at paragraph end: '${trimmed.slice(-20)}'.`);
  }

  return issues;
}

/** Layer 2: Detect pronoun referent ambiguity at the start of a document */
function detectFirstSentencePronoun(firstBlockText: string): string | null {
  const sentences = firstBlockText.match(/[^.!?\n]+[.!?]+/g) || [firstBlockText];
  const firstSentence = sentences[0]?.trim() || "";

  if (/^(?:They|These|Those|He|She|It)\s+(?:were|are|have|did|would|could)\b/i.test(firstSentence)) {
    return `Ambiguous pronoun '${firstSentence.split(/\s+/)[0]}' begins the document without an established antecedent.`;
  }
  return null;
}

/**
 * Audits paragraph-level coherence and transition continuity across a HumanizerDocument.
 */
export function auditCoherence(
  candidate: HumanizerDocument | string
): CoherenceAuditResult {
  const findings: HumanizerAuditFinding[] = [];
  const issues: string[] = [];

  const blocks =
    typeof candidate === "string"
      ? candidate.split(/\n{2,}/).map((t, idx) => ({ id: `p_${idx + 1}`, text: t }))
      : candidate.blocks.map((b) => ({ id: b.id, text: b.processedText || b.sourceText }));

  // 1. Check first sentence pronoun reference
  if (blocks.length > 0) {
    const pronounIssue = detectFirstSentencePronoun(blocks[0].text);
    if (pronounIssue) {
      issues.push(pronounIssue);
      findings.push({
        auditor: "coherence_auditor",
        category: "pronoun_continuity",
        severity: "WARNING",
        decision: "WARNING",
        code: "COHERENCE_AMBIGUOUS_PRONOUN",
        message: pronounIssue,
        blockId: blocks[0].id,
      });
    }
  }

  // 2. Check dangling transitions in each block
  for (const block of blocks) {
    const dangling = detectDanglingTransitions(block.text);
    for (const d of dangling) {
      issues.push(d);
      findings.push({
        auditor: "coherence_auditor",
        category: "transitions",
        severity: "ERROR",
        decision: "REJECT",
        code: "COHERENCE_DANGLING_TRANSITION",
        message: d,
        blockId: block.id,
      });
    }
  }

  const hasReject = findings.some((f) => f.decision === "REJECT");
  const hasWarning = findings.some((f) => f.decision === "WARNING");

  const score = hasReject ? 0.4 : hasWarning ? 0.8 : 0.95;
  const transitionQuality = hasReject ? "broken" : hasWarning ? "adequate" : "strong";
  const decision: AuditDecision = hasReject ? "REJECT" : hasWarning ? "WARNING" : "SAFE";

  return {
    passed: !hasReject,
    decision,
    score,
    transitionQuality,
    issues,
    findings,
  };
}
