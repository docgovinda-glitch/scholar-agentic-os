/**
 * Sentence & ReviewUnit Mapper.
 *
 * Aligns source sentences with candidate sentences across Conservative,
 * Balanced, and Deep Restructure modes, classifying mappings (1:1, 1:N, N:1, N:M)
 * and attaching audit findings without naïve string substitution.
 */

import {
  HumanizerDocument,
  ReviewUnit,
  SentenceMappingType,
  ReviewUnitStatus,
  HumanizerAuditReport,
  HumanizerAuditFinding,
} from "../types";

/**
 * Generates structured ReviewUnits aligning source and candidate sentences.
 */
export function generateReviewUnits(
  originalDoc: HumanizerDocument,
  candidateDoc: HumanizerDocument,
  auditReport?: HumanizerAuditReport
): ReviewUnit[] {
  const reviewUnits: ReviewUnit[] = [];
  let unitCounter = 0;

  const findings = auditReport?.findings || [];

  for (let bIdx = 0; bIdx < originalDoc.blocks.length; bIdx++) {
    const origBlock = originalDoc.blocks[bIdx];
    const candBlock = candidateDoc.blocks[bIdx];

    if (!candBlock) continue;

    const srcSentences = origBlock.sentences || [];
    const candSentences = candBlock.sentences || [];

    const blockFindings = findings.filter(
      (f) => f.blockId === origBlock.id || f.blockId === candBlock.id
    );

    // Case 1: Identical sentence count (1:1 alignment per sentence)
    if (srcSentences.length === candSentences.length && srcSentences.length > 0) {
      for (let sIdx = 0; sIdx < srcSentences.length; sIdx++) {
        unitCounter++;
        const src = srcSentences[sIdx];
        const cand = candSentences[sIdx];

        const isUnchanged = src.text.trim() === cand.text.trim();
        const sentenceFindings = blockFindings.filter(
          (f) => f.sentenceId === src.id || f.sentenceId === cand.id
        );

        const status: ReviewUnitStatus = isUnchanged
          ? "UNCHANGED"
          : sentenceFindings.some((f) => f.severity === "ERROR" || f.severity === "CRITICAL")
          ? "REVIEW_REQUIRED"
          : "MODIFIED";

        reviewUnits.push({
          unitId: `unit_${String(unitCounter).padStart(3, "0")}`,
          blockId: origBlock.id,
          sourceSentenceIds: [src.id],
          candidateSentenceIds: [cand.id],
          sourceText: src.text,
          candidateText: cand.text,
          mappingType: "ONE_TO_ONE",
          status,
          decision: "PENDING",
          confidence: 0.95,
          auditFindings: sentenceFindings,
          hasProtectedTokens: /⟦PROTECTED_[^⟧]+⟧|\([A-Z][a-zA-Z\s.-]+,\s+\d{4}\)|\$\$.*?\$\$|\$.*?\$|\[\d+\]/.test(
            src.text + " " + cand.text
          ),
          explanation: isUnchanged ? "Sentence unchanged." : "Sentence revised for academic style and rhythm.",
        });
      }
    }
    // Case 2: One-to-Many (1 source sentence split into multiple candidate sentences)
    else if (srcSentences.length === 1 && candSentences.length > 1) {
      unitCounter++;
      reviewUnits.push({
        unitId: `unit_${String(unitCounter).padStart(3, "0")}`,
        blockId: origBlock.id,
        sourceSentenceIds: [srcSentences[0].id],
        candidateSentenceIds: candSentences.map((c) => c.id),
        sourceText: srcSentences[0].text,
        candidateText: candSentences.map((c) => c.text).join(" "),
        mappingType: "ONE_TO_MANY",
        status: "RESTRUCTURED",
        decision: "PENDING",
        confidence: 0.9,
        auditFindings: blockFindings,
        hasProtectedTokens: /⟦PROTECTED_[^⟧]+⟧|\([A-Z][a-zA-Z\s.-]+,\s+\d{4}\)|\$\$.*?\$\$|\$.*?\$|\[\d+\]/.test(
          origBlock.sourceText + " " + candBlock.processedText
        ),
        explanation: `1 original sentence was restructured into ${candSentences.length} sentences.`,
      });
    }
    // Case 3: Many-to-One (Multiple source sentences merged into 1 candidate sentence)
    else if (srcSentences.length > 1 && candSentences.length === 1) {
      unitCounter++;
      reviewUnits.push({
        unitId: `unit_${String(unitCounter).padStart(3, "0")}`,
        blockId: origBlock.id,
        sourceSentenceIds: srcSentences.map((s) => s.id),
        candidateSentenceIds: [candSentences[0].id],
        sourceText: srcSentences.map((s) => s.text).join(" "),
        candidateText: candSentences[0].text,
        mappingType: "MANY_TO_ONE",
        status: "RESTRUCTURED",
        decision: "PENDING",
        confidence: 0.9,
        auditFindings: blockFindings,
        hasProtectedTokens: /⟦PROTECTED_[^⟧]+⟧|\([A-Z][a-zA-Z\s.-]+,\s+\d{4}\)|\$\$.*?\$\$|\$.*?\$|\[\d+\]/.test(
          origBlock.sourceText + " " + candBlock.processedText
        ),
        explanation: `${srcSentences.length} original sentences were combined into 1 sentence.`,
      });
    }
    // Case 4: Many-to-Many / Complex Deep Restructure
    else if (srcSentences.length > 0 && candSentences.length > 0) {
      unitCounter++;
      reviewUnits.push({
        unitId: `unit_${String(unitCounter).padStart(3, "0")}`,
        blockId: origBlock.id,
        sourceSentenceIds: srcSentences.map((s) => s.id),
        candidateSentenceIds: candSentences.map((c) => c.id),
        sourceText: srcSentences.map((s) => s.text).join(" "),
        candidateText: candSentences.map((c) => c.text).join(" "),
        mappingType: "MANY_TO_MANY",
        status: "RESTRUCTURED",
        decision: "PENDING",
        confidence: 0.85,
        auditFindings: blockFindings,
        hasProtectedTokens: /⟦PROTECTED_[^⟧]+⟧|\([A-Z][a-zA-Z\s.-]+,\s+\d{4}\)|\$\$.*?\$\$|\$.*?\$|\[\d+\]/.test(
          origBlock.sourceText + " " + candBlock.processedText
        ),
        explanation: `Paragraph restructured from ${srcSentences.length} source sentences into ${candSentences.length} sentences.`,
      });
    }
    // Case 5: Unmapped / Empty
    else {
      unitCounter++;
      reviewUnits.push({
        unitId: `unit_${String(unitCounter).padStart(3, "0")}`,
        blockId: origBlock.id,
        sourceSentenceIds: srcSentences.map((s) => s.id),
        candidateSentenceIds: candSentences.map((c) => c.id),
        sourceText: origBlock.sourceText,
        candidateText: candBlock.processedText || candBlock.sourceText,
        mappingType: "UNMAPPED",
        status: "UNCHANGED",
        decision: "PENDING",
        confidence: 1.0,
        auditFindings: blockFindings,
        hasProtectedTokens: false,
      });
    }
  }

  return reviewUnits;
}
