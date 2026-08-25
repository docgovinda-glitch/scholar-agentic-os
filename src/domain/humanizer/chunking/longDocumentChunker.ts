/**
 * Hierarchical Long-Document Chunker.
 *
 * Partitions large academic manuscripts (theses, dissertations, multi-chapter papers)
 * into safe, manageable chunks without splitting citations, formulas, headings,
 * sentences, or protected tokens, injecting surrounding read-only context.
 */

import {
  HumanizerDocument,
  DocumentChunk,
  ChunkingPolicy,
} from "../types";

export const DEFAULT_CHUNKING_POLICY: Required<ChunkingPolicy> = {
  maxTokensPerChunk: 1500,
  maxCharsPerChunk: 4000,
  maxBlocksPerChunk: 5,
  contextBlocksBefore: 1,
  contextBlocksAfter: 1,
  preserveHeadingHierarchy: true,
};

/**
 * Splits a HumanizerDocument into structured DocumentChunks respecting paragraph and section boundaries.
 */
export function createDocumentChunks(
  doc: HumanizerDocument,
  userPolicy?: ChunkingPolicy
): DocumentChunk[] {
  const policy = { ...DEFAULT_CHUNKING_POLICY, ...userPolicy };
  const blocks = doc.blocks;

  if (blocks.length === 0) return [];

  const chunks: DocumentChunk[] = [];
  let currentBlockIds: string[] = [];
  let currentCharCount = 0;
  let chunkCounter = 0;
  let currentSectionTitle: string | undefined = undefined;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockText = block.processedText || block.sourceText;
    const blockChars = blockText.length;

    // Headings update the current section title
    if (block.type === "heading") {
      currentSectionTitle = blockText.replace(/^#+\s*/, "");
    }

    // Check if adding this block exceeds max blocks or max character budget
    const willExceedBlocks = currentBlockIds.length >= policy.maxBlocksPerChunk;
    const willExceedChars = currentCharCount + blockChars > policy.maxCharsPerChunk && currentBlockIds.length > 0;
    const isNewMajorHeading = block.type === "heading" && (block.headingLevel === 1 || block.headingLevel === 2) && currentBlockIds.length > 0;

    if (willExceedBlocks || willExceedChars || isNewMajorHeading) {
      // Finalize current chunk
      chunkCounter++;
      const precedingBlockIds = getPrecedingContextIds(blocks, currentBlockIds, policy.contextBlocksBefore);
      const succeedingBlockIds = getSucceedingContextIds(blocks, currentBlockIds, policy.contextBlocksAfter);
      const sourceWords = calculateChunkWordCount(blocks, currentBlockIds);

      chunks.push({
        chunkId: `chunk_${String(chunkCounter).padStart(3, "0")}`,
        order: chunkCounter,
        title: currentSectionTitle || `Section ${chunkCounter}`,
        blockIds: currentBlockIds,
        contextPrecedingBlockIds: precedingBlockIds,
        contextSucceedingBlockIds: succeedingBlockIds,
        status: "PENDING",
        attemptsCount: 0,
        fallbackUsed: false,
        sourceWordCount: sourceWords,
      });

      // Reset for next chunk
      currentBlockIds = [];
      currentCharCount = 0;
    }

    currentBlockIds.push(block.id);
    currentCharCount += blockChars;
  }

  // Push remaining blocks as the final chunk
  if (currentBlockIds.length > 0) {
    chunkCounter++;
    const precedingBlockIds = getPrecedingContextIds(blocks, currentBlockIds, policy.contextBlocksBefore);
    const succeedingBlockIds = getSucceedingContextIds(blocks, currentBlockIds, policy.contextBlocksAfter);
    const sourceWords = calculateChunkWordCount(blocks, currentBlockIds);

    chunks.push({
      chunkId: `chunk_${String(chunkCounter).padStart(3, "0")}`,
      order: chunkCounter,
      title: currentSectionTitle || `Section ${chunkCounter}`,
      blockIds: currentBlockIds,
      contextPrecedingBlockIds: precedingBlockIds,
      contextSucceedingBlockIds: succeedingBlockIds,
      status: "PENDING",
      attemptsCount: 0,
      fallbackUsed: false,
      sourceWordCount: sourceWords,
    });
  }

  return chunks;
}

function getPrecedingContextIds(
  allBlocks: HumanizerDocument["blocks"],
  targetBlockIds: string[],
  contextCount: number
): string[] {
  if (contextCount <= 0 || targetBlockIds.length === 0) return [];
  const firstTargetIdx = allBlocks.findIndex((b) => b.id === targetBlockIds[0]);
  if (firstTargetIdx <= 0) return [];

  const startIdx = Math.max(0, firstTargetIdx - contextCount);
  return allBlocks.slice(startIdx, firstTargetIdx).map((b) => b.id);
}

function getSucceedingContextIds(
  allBlocks: HumanizerDocument["blocks"],
  targetBlockIds: string[],
  contextCount: number
): string[] {
  if (contextCount <= 0 || targetBlockIds.length === 0) return [];
  const lastTargetId = targetBlockIds[targetBlockIds.length - 1];
  const lastTargetIdx = allBlocks.findIndex((b) => b.id === lastTargetId);
  if (lastTargetIdx === -1 || lastTargetIdx >= allBlocks.length - 1) return [];

  const endIdx = Math.min(allBlocks.length, lastTargetIdx + 1 + contextCount);
  return allBlocks.slice(lastTargetIdx + 1, endIdx).map((b) => b.id);
}

function calculateChunkWordCount(allBlocks: HumanizerDocument["blocks"], blockIds: string[]): number {
  return allBlocks
    .filter((b) => blockIds.includes(b.id))
    .reduce((sum, b) => sum + (b.sourceText.split(/\s+/).filter(Boolean).length), 0);
}
