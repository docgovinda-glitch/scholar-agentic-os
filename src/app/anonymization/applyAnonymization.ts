/**
 * Deterministic apply step for accepted anonymization proposals (docs
 * 33-EXPORT-ARCHITECTURE.md §7.1: "Every change is shown for review before
 * the anonymised file is produced"). Pure, no model call — the review
 * already happened in the client; this just performs the literal
 * substitutions a human accepted, one block at a time.
 */

import type { CanonicalDocument } from "../../domain/document/model";
import type { RedactionProposal } from "../../domain/anonymization/types";

export class AnonymizationApplyError extends Error {}

/**
 * Apply `accepted` proposals onto `document`, returning a new document —
 * the input is untouched, same convention as domain/document/ops.ts.
 * Each proposal's `originalText` must still be present, verbatim, in its
 * block; this is re-checked here rather than trusted from
 * proposal-generation time, since the document may have changed since the
 * proposal was produced. Multiple accepted proposals against the same
 * block apply in the order given.
 */
export function applyAnonymization(document: CanonicalDocument, accepted: RedactionProposal[]): CanonicalDocument {
  let blocks = document.blocks;
  for (const proposal of accepted) {
    const idx = blocks.findIndex((b) => b.id === proposal.blockId);
    if (idx === -1) {
      throw new AnonymizationApplyError(`No block "${proposal.blockId}" to apply a redaction to.`);
    }
    const block = blocks[idx];
    if (!block.text.includes(proposal.originalText)) {
      throw new AnonymizationApplyError(
        `The text proposed for redaction is no longer present in block "${proposal.blockId}" — the document may have changed since this proposal was generated.`
      );
    }
    const nextBlocks = blocks.slice();
    nextBlocks[idx] = { ...block, text: block.text.replace(proposal.originalText, proposal.replacementText) };
    blocks = nextBlocks;
  }
  return { ...document, blocks };
}
