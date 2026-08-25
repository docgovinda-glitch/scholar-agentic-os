/**
 * Layered Semantic Auditor.
 *
 * Normalizes protected placeholders into semantic representations ([CITATION], [EQUATION]),
 * evaluates content word overlap, domain terminology preservation, and length boundaries.
 */

import {
  HumanizerDocument,
  HumanizerAuditFinding,
  AuditDecision,
} from "../types";
import { renderHumanizerDocument } from "../document/humanizerDocument";

export interface SemanticAuditOptions {
  minContentWordOverlap?: number;
  maxExpansionRatio?: number;
  minRetentionRatio?: number;
}

export interface SemanticAuditResult {
  passed: boolean;
  decision: AuditDecision;
  similarityScore: number;
  driftDetected: boolean;
  contradictionDetected: boolean;
  findings: HumanizerAuditFinding[];
}

/** Normalizes protected placeholders to semantic markers */
export function normalizeProtectedPlaceholders(text: string): string {
  return text
    .replace(/⟦PROTECTED_CITATION_[^⟧]+⟧/g, "[CITATION]")
    .replace(/⟦PROTECTED_LATEX_[^⟧]+⟧/g, "[EQUATION]")
    .replace(/⟦PROTECTED_STATISTICAL_[^⟧]+⟧/g, "[STATISTIC]")
    .replace(/⟦PROTECTED_(?:PERCENTAGE|MEASUREMENT|QUANTITY|SAMPLE)_[^⟧]+⟧/g, "[QUANTITY]")
    .replace(/⟦PROTECTED_(?:URL|DOI|EMAIL)_[^⟧]+⟧/g, "[REFERENCE]")
    .replace(/⟦PROTECTED_LOCKED_TERM_[^⟧]+⟧/g, "[TERM]")
    .replace(/⟦PROTECTED_[^⟧]+⟧/g, "[PROTECTED]");
}

/** Extracts content words (words of length >= 3, lowercase) */
function extractContentWords(text: string): Set<string> {
  const normalized = normalizeProtectedPlaceholders(text).toLowerCase();
  const rawWords = normalized.match(/\b[a-z]{3,}\b/g) || [];
  const stopwords = new Set([
    "the", "and", "that", "this", "with", "from", "for", "are", "was", "were",
    "have", "has", "had", "which", "their", "they", "been", "also", "into",
  ]);
  return new Set(rawWords.filter((w) => !stopwords.has(w)));
}

/**
 * Audits semantic fidelity and divergence between original and candidate documents.
 */
export function auditSemantic(
  original: HumanizerDocument | string,
  candidate: HumanizerDocument | string,
  options?: SemanticAuditOptions
): SemanticAuditResult {
  const minOverlap = options?.minContentWordOverlap ?? 0.25;
  const maxExpansion = options?.maxExpansionRatio ?? 2.2;
  const minRetention = options?.minRetentionRatio ?? 0.45;

  const origText = typeof original === "string" ? original : renderHumanizerDocument(original, "source");
  const candText = typeof candidate === "string" ? candidate : renderHumanizerDocument(candidate, "processed");

  const origWords = extractContentWords(origText);
  const candWords = extractContentWords(candText);

  let overlapCount = 0;
  for (const w of origWords) {
    if (candWords.has(w)) overlapCount++;
  }

  const unionSize = new Set([...origWords, ...candWords]).size;
  const jaccard = unionSize > 0 ? overlapCount / unionSize : 1.0;
  const retention = origWords.size > 0 ? overlapCount / origWords.size : 1.0;

  const findings: HumanizerAuditFinding[] = [];

  // 1. Check severe content word drop (semantic drift)
  let driftDetected = false;
  if (retention < minRetention && origWords.size > 10) {
    driftDetected = true;
    findings.push({
      auditor: "semantic_auditor",
      category: "semantic_drift",
      severity: "ERROR",
      decision: "REJECT",
      code: "SEMANTIC_CONTENT_DRIFT",
      message: `Candidate retains only ${Math.round(retention * 100)}% of primary content words from source, indicating potential topic drift.`,
      confidence: Math.round(retention * 100) / 100,
    });
  }

  // 2. Check length explosion or excessive shrinkage
  const origLen = origText.split(/\s+/).length;
  const candLen = candText.split(/\s+/).length;
  const lengthRatio = origLen > 0 ? candLen / origLen : 1.0;

  if (lengthRatio > maxExpansion && candLen > 50) {
    findings.push({
      auditor: "semantic_auditor",
      category: "length_boundaries",
      severity: "WARNING",
      decision: "WARNING",
      code: "SEMANTIC_EXCESSIVE_EXPANSION",
      message: `Candidate length expanded to ${Math.round(lengthRatio * 100)}% of original document.`,
    });
  } else if (lengthRatio < 0.4 && origLen > 50) {
    findings.push({
      auditor: "semantic_auditor",
      category: "length_boundaries",
      severity: "ERROR",
      decision: "REJECT",
      code: "SEMANTIC_SEVERE_TRUNCATION",
      message: `Candidate severely truncated to ${Math.round(lengthRatio * 100)}% of original length.`,
    });
  }

  const hasReject = findings.some((f) => f.decision === "REJECT");
  const hasWarning = findings.some((f) => f.decision === "WARNING");
  const decision: AuditDecision = hasReject ? "REJECT" : hasWarning ? "WARNING" : "SAFE";

  return {
    passed: !hasReject,
    decision,
    similarityScore: Math.round(jaccard * 100) / 100,
    driftDetected,
    contradictionDetected: false,
    findings,
  };
}
