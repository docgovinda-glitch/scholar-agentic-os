/**
 * Hierarchical Rewrite Engine for the AI Text Humanizer.
 *
 * Coordinates block-by-block and paragraph-level rewriting on HumanizerDocument
 * with calibrated decoding profiles, surrounding context injection,
 * and invariant enforcement.
 */

import {
  HumanizerDocument,
  HumanizerBlock,
} from "../types";
import { TokenRegistry } from "../protection/tokenRegistry";
import {
  buildPromptForBlock,
  RewriteMode,
  DisciplineProfile,
  HedgingLevel,
} from "./promptBuilder";
import { segmentSentences } from "../document/humanizerDocument";

export type LLMCompleter = (params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  topP?: number;
}) => Promise<{ text: string } | string>;

export interface RewriteEngineOptions {
  mode?: RewriteMode;
  genre?: string;
  discipline?: DisciplineProfile;
  hedgingLevel?: HedgingLevel;
  completer: LLMCompleter;
  registry: TokenRegistry;
  retryInstructions?: string[];
}

export interface RewriteResult {
  candidateDoc: HumanizerDocument;
  improvements: string[];
  blocksRewritten: number;
}

/** Parses raw JSON response from LLM, handling markdown code fences */
export function parseLlmRewriteOutput(rawOutput: string | { text: string }): {
  rewrittenText: string;
  improvements: string[];
} {
  const text = typeof rawOutput === "string" ? rawOutput : rawOutput.text;
  if (!text || !text.trim()) {
    throw new Error("Empty response from LLM completer.");
  }

  // 1. Try direct JSON parsing
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.rewrittenText === "string") {
      return {
        rewrittenText: parsed.rewrittenText.trim(),
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      };
    }
  } catch (_) {}

  // 2. Try extracting JSON from markdown code block ```json ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed && typeof parsed.rewrittenText === "string") {
        return {
          rewrittenText: parsed.rewrittenText.trim(),
          improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
        };
      }
    } catch (_) {}
  }

  // 3. Fallback: Check if response has {"rewrittenText": ...} embedded
  const jsonObjectMatch = text.match(/\{[\s\S]*"rewrittenText"[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const parsed = JSON.parse(jsonObjectMatch[0]);
      if (parsed && typeof parsed.rewrittenText === "string") {
        return {
          rewrittenText: parsed.rewrittenText.trim(),
          improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
        };
      }
    } catch (_) {}
  }

  throw new Error(`Failed to parse valid rewrite output from LLM response: ${text.slice(0, 100)}...`);
}

/** Checks whether a block should be skipped from rewriting (e.g. code blocks, tables) */
export function isRewriteCandidate(block: HumanizerBlock): boolean {
  if (block.type === "code_block" || block.type === "table") {
    return false;
  }
  const text = (block.processedText || block.sourceText || "").trim();
  return text.length > 0;
}

/**
 * Rewrites a single HumanizerBlock using the provided completer and prompt builder.
 */
export async function rewriteBlock(
  block: HumanizerBlock,
  options: {
    mode: RewriteMode;
    genre: string;
    discipline?: DisciplineProfile;
    hedgingLevel?: HedgingLevel;
    completer: LLMCompleter;
    registry: TokenRegistry;
    doc: HumanizerDocument;
    previousBlockText?: string;
    nextBlockText?: string;
    retryInstructions?: string[];
  }
): Promise<{ rewrittenBlock: HumanizerBlock; improvements: string[] }> {
  if (!isRewriteCandidate(block)) {
    return { rewrittenBlock: block, improvements: [] };
  }

  const protectedElementsInBlock = options.registry.getByBlock(block.id);
  const claimsInBlock = (options.doc.claims || []).filter(
    (c) => c.sourceBlockId === block.id || c.sourceSentenceIds.some((sId) => sId.startsWith(block.id))
  );
  const lockedTerms = options.doc.terminologyMemory?.lockedTerms || [];

  const prompt = buildPromptForBlock({
    mode: options.mode,
    genre: options.genre,
    discipline: options.discipline,
    hedgingLevel: options.hedgingLevel,
    block,
    previousBlockText: options.previousBlockText,
    nextBlockText: options.nextBlockText,
    protectedElementsInBlock,
    claimsInBlock,
    lockedTerms,
    styleProfile: options.doc.styleProfile,
    retryInstructions: options.retryInstructions,
  });

  const rawResponse = await options.completer({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    temperature: prompt.decodingParams.temperature,
    topP: prompt.decodingParams.topP,
  });

  const parsed = parseLlmRewriteOutput(rawResponse);
  const newSentences = segmentSentences(parsed.rewrittenText).map((sText, idx) => ({
    id: `${block.id}_s_${idx + 1}`,
    text: sText,
    order: idx + 1,
    wordCount: sText.split(/\s+/).filter(Boolean).length,
    protectedTokens: [],
    claimIds: [],
  }));

  const rewrittenBlock: HumanizerBlock = {
    ...block,
    processedText: parsed.rewrittenText,
    sentences: newSentences,
  };

  return { rewrittenBlock, improvements: parsed.improvements };
}

/**
 * Hierarchically rewrites all eligible blocks in a HumanizerDocument.
 */
export async function rewriteDocument(
  doc: HumanizerDocument,
  options: RewriteEngineOptions
): Promise<RewriteResult> {
  const mode = options.mode || "balanced";
  const genre = options.genre || "Academic Journal";
  const allImprovements: string[] = [];
  let blocksRewritten = 0;

  const rewrittenBlocks: HumanizerBlock[] = [];

  for (let i = 0; i < doc.blocks.length; i++) {
    const currentBlock = doc.blocks[i];
    const prevBlock = i > 0 ? doc.blocks[i - 1].processedText || doc.blocks[i - 1].sourceText : undefined;
    const nextBlock = i < doc.blocks.length - 1 ? doc.blocks[i + 1].processedText || doc.blocks[i + 1].sourceText : undefined;

    if (isRewriteCandidate(currentBlock)) {
      const { rewrittenBlock, improvements } = await rewriteBlock(currentBlock, {
        mode,
        genre,
        discipline: options.discipline,
        hedgingLevel: options.hedgingLevel,
        completer: options.completer,
        registry: options.registry,
        doc,
        previousBlockText: prevBlock,
        nextBlockText: nextBlock,
        retryInstructions: options.retryInstructions,
      });

      rewrittenBlocks.push(rewrittenBlock);
      allImprovements.push(...improvements);
      blocksRewritten++;
    } else {
      rewrittenBlocks.push(currentBlock);
    }
  }

  const candidateDoc: HumanizerDocument = {
    ...doc,
    blocks: rewrittenBlocks,
    versionInfo: {
      ...doc.versionInfo,
      decodingProfile: mode,
      timestamp: new Date().toISOString(),
    },
  };

  return {
    candidateDoc,
    improvements: Array.from(new Set(allImprovements)),
    blocksRewritten,
  };
}
