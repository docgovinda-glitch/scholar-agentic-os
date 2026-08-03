/**
 * Pure operations over the Canonical Document Model.
 *
 * Every function here is a total function: (document, args) -> new document.
 * No mutation of the input, no I/O. This is what makes the model testable
 * without mocks and safe to run identically client- and server-side.
 */

import type { Block, BlockKind, BlockRange, CanonicalDocument } from "./model";
import { blockIndex, findBlock } from "./model";

export class RangeError_ extends Error {}

function assertValidRange(block: Block, range: BlockRange): void {
  if (range.start < 0 || range.end > block.text.length || range.start > range.end) {
    throw new RangeError_(
      `Invalid range [${range.start}, ${range.end}) for block "${range.blockId}" of length ${block.text.length}`
    );
  }
}

/** Extract the text within a range. Throws if the block doesn't exist or the range is invalid. */
export function getRangeText(doc: CanonicalDocument, range: BlockRange): string {
  const block = findBlock(doc, range.blockId);
  if (!block) throw new RangeError_(`No block "${range.blockId}"`);
  assertValidRange(block, range);
  return block.text.slice(range.start, range.end);
}

/**
 * Replace the text within a range with new text. Returns a new document;
 * the input is untouched. This is the primitive every higher-level edit
 * (accepting a suggestion, applying a Studio diff hunk) reduces to.
 */
export function replaceRange(doc: CanonicalDocument, range: BlockRange, newText: string): CanonicalDocument {
  const idx = blockIndex(doc, range.blockId);
  if (idx === -1) throw new RangeError_(`No block "${range.blockId}"`);
  const block = doc.blocks[idx];
  assertValidRange(block, range);

  const updatedText = block.text.slice(0, range.start) + newText + block.text.slice(range.end);
  const nextBlocks = doc.blocks.slice();
  nextBlocks[idx] = { ...block, text: updatedText };
  return { ...doc, blocks: nextBlocks };
}

/** Append a new block at the end of the document. */
export function appendBlock(doc: CanonicalDocument, id: string, kind: BlockKind, text: string): CanonicalDocument {
  return { ...doc, blocks: [...doc.blocks, { id, kind, text }] };
}

/** Insert a new block immediately after `afterBlockId` (or at the start if omitted). */
export function insertBlockAfter(
  doc: CanonicalDocument,
  afterBlockId: string | null,
  newBlock: Block
): CanonicalDocument {
  if (afterBlockId === null) {
    return { ...doc, blocks: [newBlock, ...doc.blocks] };
  }
  const idx = blockIndex(doc, afterBlockId);
  if (idx === -1) throw new RangeError_(`No block "${afterBlockId}"`);
  const nextBlocks = doc.blocks.slice();
  nextBlocks.splice(idx + 1, 0, newBlock);
  return { ...doc, blocks: nextBlocks };
}

/**
 * Split a block at `offset` into two blocks of the same kind. The first
 * keeps the original id; the second gets `newBlockId`.
 */
export function splitBlock(
  doc: CanonicalDocument,
  blockId: string,
  offset: number,
  newBlockId: string
): CanonicalDocument {
  const idx = blockIndex(doc, blockId);
  if (idx === -1) throw new RangeError_(`No block "${blockId}"`);
  const block = doc.blocks[idx];
  if (offset < 0 || offset > block.text.length) {
    throw new RangeError_(`Invalid split offset ${offset} for block of length ${block.text.length}`);
  }
  const before: Block = { ...block, text: block.text.slice(0, offset) };
  const after: Block = { id: newBlockId, kind: block.kind, text: block.text.slice(offset) };
  const nextBlocks = doc.blocks.slice();
  nextBlocks.splice(idx, 1, before, after);
  return { ...doc, blocks: nextBlocks };
}

/** Merge `blockId` with the block immediately following it. Their text concatenates. */
export function mergeWithNext(doc: CanonicalDocument, blockId: string): CanonicalDocument {
  const idx = blockIndex(doc, blockId);
  if (idx === -1) throw new RangeError_(`No block "${blockId}"`);
  if (idx === doc.blocks.length - 1) {
    throw new RangeError_(`Block "${blockId}" has no following block to merge with`);
  }
  const current = doc.blocks[idx];
  const next = doc.blocks[idx + 1];
  const merged: Block = { ...current, text: current.text + next.text };
  const nextBlocks = doc.blocks.slice();
  nextBlocks.splice(idx, 2, merged);
  return { ...doc, blocks: nextBlocks };
}

/** Move a block to a new position (0-indexed, in the resulting array). */
export function moveBlock(doc: CanonicalDocument, blockId: string, toIndex: number): CanonicalDocument {
  const idx = blockIndex(doc, blockId);
  if (idx === -1) throw new RangeError_(`No block "${blockId}"`);
  const clamped = Math.max(0, Math.min(toIndex, doc.blocks.length - 1));
  const nextBlocks = doc.blocks.slice();
  const [block] = nextBlocks.splice(idx, 1);
  nextBlocks.splice(clamped, 0, block);
  return { ...doc, blocks: nextBlocks };
}

/** Remove a block entirely. */
export function removeBlock(doc: CanonicalDocument, blockId: string): CanonicalDocument {
  const idx = blockIndex(doc, blockId);
  if (idx === -1) throw new RangeError_(`No block "${blockId}"`);
  const nextBlocks = doc.blocks.slice();
  nextBlocks.splice(idx, 1);
  return { ...doc, blocks: nextBlocks };
}

/** Total plain-text word count across every block — the basis for Rubric word-limit checks. */
export function wordCount(doc: CanonicalDocument): number {
  const text = doc.blocks.map((b) => b.text).join(" ").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

/** A lightweight outline: heading blocks in document order, with their nesting level. */
export interface OutlineEntry {
  blockId: string;
  level: 1 | 2 | 3;
  text: string;
}

export function extractOutline(doc: CanonicalDocument): OutlineEntry[] {
  const levelOf: Partial<Record<BlockKind, 1 | 2 | 3>> = { heading1: 1, heading2: 2, heading3: 3 };
  const entries: OutlineEntry[] = [];
  for (const block of doc.blocks) {
    const level = levelOf[block.kind];
    if (level) entries.push({ blockId: block.id, level, text: block.text });
  }
  return entries;
}
