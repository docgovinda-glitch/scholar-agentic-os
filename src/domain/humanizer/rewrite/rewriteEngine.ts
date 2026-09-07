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
  buildSystemPrompt,
  getDecodingParamsForMode,
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

  // 4. Fallback: Check if response has humanizedText or text property in JSON
  const generalJsonMatch = text.match(/\{[\s\S]*\}/);
  if (generalJsonMatch) {
    try {
      const parsed = JSON.parse(generalJsonMatch[0]);
      const candidate = parsed.rewrittenText || parsed.humanizedText || parsed.text;
      if (candidate && typeof candidate === "string") {
        return {
          rewrittenText: candidate.trim(),
          improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
        };
      }
    } catch (_) {}
  }

  // 5. Plain text fallback: Clean academic prose output from models that omit JSON wrapping
  const trimmed = text.trim();
  const isErrorMessage =
    trimmed.startsWith("Error:") ||
    trimmed.startsWith("401") ||
    trimmed.startsWith("403") ||
    trimmed.startsWith("429") ||
    trimmed.startsWith("500") ||
    trimmed.includes("<!DOCTYPE") ||
    trimmed.includes("<html>");

  if (!isErrorMessage && trimmed.length > 5) {
    let cleanText = trimmed;
    const prefixMatch = cleanText.match(
      /^(?:Here (?:is|are) (?:the )?(?:rewritten|humanized) (?:text|prose|version):?\s*|Rewritten text:\s*)/i
    );
    if (prefixMatch) {
      cleanText = cleanText.slice(prefixMatch[0].length).trim();
    }
    if (
      (cleanText.startsWith('"') && cleanText.endsWith('"')) ||
      (cleanText.startsWith('`') && cleanText.endsWith('`'))
    ) {
      cleanText = cleanText.slice(1, -1).trim();
    }
    return {
      rewrittenText: cleanText,
      improvements: ["Scholarly vocabulary refinement and cadence enhancement."],
    };
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

  // Provide human-readable surrounding context so LLM does not leak or duplicate tokens across blocks
  const cleanPrev = options.previousBlockText ? options.registry.restore(options.previousBlockText) : undefined;
  const cleanNext = options.nextBlockText ? options.registry.restore(options.nextBlockText) : undefined;

  const prompt = buildPromptForBlock({
    mode: options.mode,
    genre: options.genre,
    discipline: options.discipline,
    hedgingLevel: options.hedgingLevel,
    block,
    previousBlockText: cleanPrev,
    nextBlockText: cleanNext,
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

  // Normalize redundant outer brackets around double-bracketed tokens (e.g. [⟦PROTECTED_...⟧] -> ⟦PROTECTED_...⟧)
  let normalizedText = parsed.rewrittenText.replace(/[\[\(【]⟦(PROTECTED_[^⟧]+)⟧[\]\)】]/g, "⟦$1⟧");

  // Normalize single bracket tokens (e.g. [PROTECTED_...] or (PROTECTED_...) to ⟦PROTECTED_...⟧)
  normalizedText = normalizedText.replace(
    /[\[\(【]+PROTECTED_([A-Z0-9_]+_[a-zA-Z0-9]+)[\]\)】]+/g,
    "⟦PROTECTED_$1⟧"
  );

  // Auto-reshield if LLM restored the original citation/formula instead of preserving the token
  for (const el of protectedElementsInBlock) {
    if (!normalizedText.includes(el.token) && el.originalValue && normalizedText.includes(el.originalValue)) {
      normalizedText = normalizedText.split(el.originalValue).join(el.token);
    }
  }

  const newSentences = segmentSentences(normalizedText).map((sText, idx) => ({
    id: `${block.id}_s_${idx + 1}`,
    text: sText,
    order: idx + 1,
    wordCount: sText.split(/\s+/).filter(Boolean).length,
    protectedTokens: [],
    claimIds: [],
  }));

  const rewrittenBlock: HumanizerBlock = {
    ...block,
    processedText: normalizedText,
    sentences: newSentences,
  };

  return { rewrittenBlock, improvements: parsed.improvements };
}

/**
 * Evaluates whether a multi-paragraph document safely fits within a single cohesive
 * LLM completion budget, accounting for:
 * 1. Source text tokenization (~1.35 tokens/word)
 * 2. System prompt and genre/style guidelines (~900 tokens)
 * 3. Protected-token and shielding declaration overhead (~20 tokens per token)
 * 4. Locked terms and retry instruction overhead
 * 5. Expected output token requirements (~1.4x source words + JSON formatting)
 * 6. Standard model output token ceilings (typically 4096 tokens)
 */
export function isCohesiveRewriteSafe(params: {
  sourceWords: number;
  protectedTokenCount: number;
  lockedTermCount: number;
  retryInstructionCount: number;
}): boolean {
  const { sourceWords, protectedTokenCount, lockedTermCount, retryInstructionCount } = params;

  // Approximate tokens
  const estimatedSourceTokens = Math.ceil(sourceWords * 1.35);
  const estimatedPromptOverhead = 900 + (protectedTokenCount * 20) + (lockedTermCount * 12) + (retryInstructionCount * 40);
  const estimatedInputTokens = estimatedSourceTokens + estimatedPromptOverhead;

  // Expected output tokens including JSON wrapping and improvements
  const estimatedOutputTokens = Math.ceil(sourceWords * 1.4) + 250;

  // Most providers enforce max 4096 output tokens. We reserve a safety buffer: max 3000 output tokens.
  // Context window: combined input + output must stay within conservative limits (<= 6500 tokens).
  const MAX_SAFE_OUTPUT_TOKENS = 3000;
  const MAX_SAFE_TOTAL_BUDGET = 6500;

  return (
    estimatedOutputTokens <= MAX_SAFE_OUTPUT_TOKENS &&
    (estimatedInputTokens + estimatedOutputTokens) <= MAX_SAFE_TOTAL_BUDGET
  );
}

/**
 * Hierarchically rewrites all eligible blocks in a HumanizerDocument.
 * For documents with multiple paragraphs fitting in context limits, uses cohesive
 * document-level rewriting (1 LLM call) preserving paragraph structure (\n\n),
 * with graceful fallback to bounded block-by-block rewriting.
 */
export async function rewriteDocument(
  doc: HumanizerDocument,
  options: RewriteEngineOptions
): Promise<RewriteResult> {
  const mode = options.mode || "balanced";
  const genre = options.genre || "Academic Journal";
  const allImprovements: string[] = [];

  const candidateIndices: number[] = [];
  for (let i = 0; i < doc.blocks.length; i++) {
    if (isRewriteCandidate(doc.blocks[i])) {
      candidateIndices.push(i);
    }
  }

  // If document has >2 paragraphs and fits within context window, prefer cohesive document rewrite
  if (candidateIndices.length > 2) {
    const totalWords = candidateIndices.reduce(
      (sum, idx) => sum + (doc.blocks[idx].sourceText.split(/\s+/).filter(Boolean).length),
      0
    );

    // Collect all protected elements and locked terms across candidate blocks
    const allProtected = candidateIndices.flatMap((idx) =>
      options.registry.getByBlock(doc.blocks[idx].id)
    );
    const lockedTerms = doc.terminologyMemory?.lockedTerms || [];
    const retryInstructions = options.retryInstructions || [];

    const canRewriteCohesively = isCohesiveRewriteSafe({
      sourceWords: totalWords,
      protectedTokenCount: allProtected.length,
      lockedTermCount: lockedTerms.length,
      retryInstructionCount: retryInstructions.length,
    });

    if (canRewriteCohesively) {
      try {
        const combinedSource = candidateIndices
          .map((idx) => doc.blocks[idx].processedText || doc.blocks[idx].sourceText)
          .join("\n\n");

        const systemPrompt = buildSystemPrompt(
          mode,
          genre,
          options.discipline,
          options.hedgingLevel
        );

        const promptSections: string[] = [];
        if (allProtected.length > 0) {
          const tokenList = allProtected
            .map((t) => `- ${t.token} (Type: ${t.type}, Original: "${t.originalValue}")`)
            .join("\n");
          promptSections.push(`### MANDATORY PROTECTED TOKENS (MUST ALL APPEAR EXACTLY IN OUTPUT)\n${tokenList}`);
        }
        if (lockedTerms.length > 0) {
          promptSections.push(`### LOCKED TERMS (DO NOT PARAPHRASE)\n${lockedTerms.map((t) => `- "${t}"`).join("\n")}`);
        }
        if (options.retryInstructions && options.retryInstructions.length > 0) {
          promptSections.push(
            `### MANDATORY RETRY CORRECTIONS\n${options.retryInstructions.map((i) => `- ${i}`).join("\n")}`
          );
        }
        promptSections.push(
          `### SOURCE TEXT TO REWRITE (PRESERVE EXACT PARAGRAPH BREAKS SEPARATED BY DOUBLE NEWLINES)\n"""\n${combinedSource}\n"""`
        );

        const userPrompt = promptSections.join("\n\n");
        const decodingParams = getDecodingParamsForMode(mode);

        const rawResponse = await options.completer({
          systemPrompt,
          userPrompt,
          temperature: decodingParams.temperature,
          topP: decodingParams.topP,
        });

        const parsed = parseLlmRewriteOutput(rawResponse);

        // Normalize brackets
        let normalizedText = parsed.rewrittenText.replace(/[\[\(【]⟦(PROTECTED_[^⟧]+)⟧[\]\)】]/g, "⟦$1⟧");
        normalizedText = normalizedText.replace(
          /[\[\(【]+PROTECTED_([A-Z0-9_]+_[a-zA-Z0-9]+)[\]\)】]+/g,
          "⟦PROTECTED_$1⟧"
        );

        // Auto-reshield if original citations were restored directly
        for (const el of allProtected) {
          if (!normalizedText.includes(el.token) && el.originalValue && normalizedText.includes(el.originalValue)) {
            normalizedText = normalizedText.split(el.originalValue).join(el.token);
          }
        }

        const rawParagraphs = normalizedText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

        // If paragraph count matches, build candidateDoc and let downstream multi-auditor suite validate
        if (rawParagraphs.length === candidateIndices.length) {
          const rewrittenBlocks: HumanizerBlock[] = [...doc.blocks];

          for (let k = 0; k < candidateIndices.length; k++) {
            const blockIdx = candidateIndices[k];
            const block = doc.blocks[blockIdx];
            const pText = rawParagraphs[k];

            const newSentences = segmentSentences(pText).map((sText, sIdx) => ({
              id: `${block.id}_s_${sIdx + 1}`,
              text: sText,
              order: sIdx + 1,
              wordCount: sText.split(/\s+/).filter(Boolean).length,
              protectedTokens: [],
              claimIds: [],
            }));

            rewrittenBlocks[blockIdx] = {
              ...block,
              processedText: pText,
              sentences: newSentences,
            };
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
            improvements: parsed.improvements.length > 0 ? parsed.improvements : ["Holistic multi-paragraph cadence and rhythmic restructuring."],
            blocksRewritten: candidateIndices.length,
          };
        }
      } catch (err) {
        // Provider/network/auth/quota execution error: rethrow immediately to prevent duplicate failing calls
        throw err;
      }
    }
  }

  // Bounded block-by-block rewriting (strict quota cap: at most 10 individual paragraph calls)
  const MAX_BLOCK_CALLS = 10;
  let blocksRewritten = 0;
  const rewrittenBlocks: HumanizerBlock[] = [];

  for (let i = 0; i < doc.blocks.length; i++) {
    const currentBlock = doc.blocks[i];
    const prevBlock = i > 0 ? doc.blocks[i - 1].processedText || doc.blocks[i - 1].sourceText : undefined;
    const nextBlock = i < doc.blocks.length - 1 ? doc.blocks[i + 1].processedText || doc.blocks[i + 1].sourceText : undefined;

    if (isRewriteCandidate(currentBlock) && blocksRewritten < MAX_BLOCK_CALLS) {
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
