/**
 * Document Review Manager.
 *
 * Coordinates fine-grained acceptance/rejection of ReviewUnits on HumanizerDocument,
 * updating structured sentences and blocks while enforcing strict final integrity invariants.
 */

import {
  HumanizerDocument,
  ReviewUnit,
  ReviewUnitDecision,
  HumanizerBlock,
} from "../types";
import { TokenRegistry } from "../protection/tokenRegistry";
import { segmentSentences } from "../document/humanizerDocument";

export interface ReviewActionResult {
  updatedDoc: HumanizerDocument;
  success: boolean;
  validationError?: string;
}

/**
 * Validates final document integrity ensuring no unrestored tokens or missing locked terms exist.
 */
export function validateFinalDocument(
  doc: HumanizerDocument,
  registry?: TokenRegistry
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const block of doc.blocks) {
    const text = block.processedText || block.sourceText;

    // Invariant 1: No unrestored protected tokens
    const unRestoredMatches = text.match(/⟦PROTECTED_[^⟧]+⟧/g);
    if (unRestoredMatches && unRestoredMatches.length > 0) {
      errors.push(
        `Block ${block.id} contains unrestored protected token(s): ${unRestoredMatches.join(", ")}`
      );
    }
  }

  // Invariant 2: Locked Terminology Memory Preservation
  const lockedTerms = doc.terminologyMemory?.lockedTerms || [];
  const fullText = doc.blocks.map((b) => b.processedText || b.sourceText).join("\n\n");

  for (const term of lockedTerms) {
    if (!fullText.includes(term)) {
      errors.push(`Document failed to preserve locked terminology: "${term}".`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Applies an accept/reject decision to a specific ReviewUnit on the document.
 */
export function applyReviewUnitDecision(
  doc: HumanizerDocument,
  unitId: string,
  decision: ReviewUnitDecision,
  registry?: TokenRegistry
): ReviewActionResult {
  const units = doc.reviewUnits || [];
  const unitIndex = units.findIndex((u) => u.unitId === unitId);

  if (unitIndex === -1) {
    return {
      updatedDoc: doc,
      success: false,
      validationError: `ReviewUnit with ID "${unitId}" not found.`,
    };
  }

  const targetUnit = units[unitIndex];
  const updatedUnits = [...units];
  updatedUnits[unitIndex] = { ...targetUnit, decision };

  // Update target block representation
  const updatedBlocks = doc.blocks.map((block) => {
    if (block.id !== targetUnit.blockId) return block;

    // If Reverting (Keep Original)
    if (decision === "REJECTED") {
      if (targetUnit.mappingType === "ONE_TO_ONE") {
        // Revert specific sentence
        const updatedSentences = block.sentences.map((s) => {
          if (targetUnit.candidateSentenceIds.includes(s.id)) {
            return {
              ...s,
              text: targetUnit.sourceText,
              wordCount: targetUnit.sourceText.split(/\s+/).filter(Boolean).length,
            };
          }
          return s;
        });

        return {
          ...block,
          processedText: updatedSentences.map((s) => s.text).join(" "),
          sentences: updatedSentences,
        };
      } else {
        // Revert entire block for merged/split/restructured cases using targetUnit.sourceText
        const origSentences = segmentSentences(targetUnit.sourceText).map((sText, idx) => ({
          id: `${block.id}_s_${idx + 1}`,
          text: sText,
          order: idx + 1,
          wordCount: sText.split(/\s+/).filter(Boolean).length,
          protectedTokens: [],
          claimIds: [],
        }));

        return {
          ...block,
          processedText: targetUnit.sourceText,
          sentences: origSentences,
        };
      }
    }

    // If Accepting (Keep Humanized)
    return block;
  });

  const updatedDoc: HumanizerDocument = {
    ...doc,
    blocks: updatedBlocks,
    reviewUnits: updatedUnits,
  };

  // Run Safety Integrity Check before committing
  const validation = validateFinalDocument(updatedDoc, registry);
  if (!validation.valid) {
    return {
      updatedDoc: doc, // preserve last safe state
      success: false,
      validationError: `Safety Integrity Error: ${validation.errors.join("; ")}`,
    };
  }

  return {
    updatedDoc,
    success: true,
  };
}

/**
 * Bulk accepts or rejects all review units.
 */
export function applyAllReviewUnits(
  doc: HumanizerDocument,
  decision: ReviewUnitDecision,
  registry?: TokenRegistry
): ReviewActionResult {
  let currentDoc = doc;
  const units = doc.reviewUnits || [];

  for (const u of units) {
    const res = applyReviewUnitDecision(currentDoc, u.unitId, decision, registry);
    if (!res.success) return res;
    currentDoc = res.updatedDoc;
  }

  return {
    updatedDoc: currentDoc,
    success: true,
  };
}
