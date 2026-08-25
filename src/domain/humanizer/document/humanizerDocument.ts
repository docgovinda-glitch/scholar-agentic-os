/**
 * Canonical Document Representation & Builder for the AI Text Humanizer.
 *
 * Provides factory, parser, block manipulation, and deterministic rendering functions
 * to ensure that document hierarchy, formatting, and stable identifiers are preserved
 * throughout the entire humanization pipeline.
 */

import {
  HumanizerDocument,
  HumanizerBlock,
  HumanizerSentence,
  BlockType,
  TerminologyMemory,
  PipelineVersionInfo,
} from "../types";

export const HUMANIZER_PIPELINE_VERSION = "2.0.0";
export const HUMANIZER_PROMPT_VERSION = "2026.08";
export const HUMANIZER_PROTECTION_VERSION = "2.1.0";
export const HUMANIZER_AUDIT_VERSION = "2.0.0";

/** Simple deterministic sentence tokenizer that respects abbreviations and numbers */
export function segmentSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  // Protect common academic abbreviations from splitting: e.g., et al., i.e., e.g., vs., Fig., Vol., pp., Dr., Prof.
  const protectedAbbr = text
    .replace(/\bet\s+al\./gi, "et__AL__DOT")
    .replace(/\bi\.e\./gi, "i__E__DOT")
    .replace(/\be\.g\./gi, "e__G__DOT")
    .replace(/\bvs\./gi, "vs__DOT")
    .replace(/\bFig\./gi, "Fig__DOT")
    .replace(/\bVol\./gi, "Vol__DOT")
    .replace(/\bpp\./gi, "pp__DOT")
    .replace(/\bDr\./gi, "Dr__DOT")
    .replace(/\bProf\./gi, "Prof__DOT")
    .replace(/(\d+)\.(\d+)/g, "$1__DECIMAL__$2"); // protect decimals: 3.14

  // Match sentences ending in punctuation or end of block
  const rawMatches = protectedAbbr.match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g) || [protectedAbbr];

  return rawMatches
    .map((s) =>
      s
        .replace(/et__AL__DOT/g, "et al.")
        .replace(/i__E__DOT/g, "i.e.")
        .replace(/e__G__DOT/g, "e.g.")
        .replace(/vs__DOT/g, "vs.")
        .replace(/Fig__DOT/g, "Fig.")
        .replace(/Vol__DOT/g, "Vol.")
        .replace(/pp__DOT/g, "pp.")
        .replace(/Dr__DOT/g, "Dr.")
        .replace(/Prof__DOT/g, "Prof.")
        .replace(/__DECIMAL__/g, ".")
        .trim()
    )
    .filter((s) => s.length > 0);
}

/** Parses raw input text into structured blocks with stable IDs */
export function parseRawBlocks(rawText: string): HumanizerBlock[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  // Normalize line endings
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").normalize("NFC");

  // Split on two or more newlines (paragraph boundaries)
  const rawParagraphs = normalized.split(/\n{2,}/);
  const blocks: HumanizerBlock[] = [];
  let blockCounter = 0;
  let sentenceCounter = 0;

  for (const rawP of rawParagraphs) {
    const trimmed = rawP.trim();
    if (!trimmed) continue;

    blockCounter++;
    let blockType: BlockType = "paragraph";
    let headingLevel: number | undefined;
    let formattingPrefix: string | undefined;
    let textContent = trimmed;

    // Check Heading: # Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blockType = "heading";
      headingLevel = headingMatch[1].length;
      formattingPrefix = `${headingMatch[1]} `;
      textContent = headingMatch[2];
    } else if (trimmed.startsWith("> ")) {
      // Check Blockquote: > Quotation
      blockType = "blockquote";
      formattingPrefix = "> ";
      textContent = trimmed.replace(/^>\s*/gm, "");
    } else if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      // Check List
      blockType = "list_item";
    } else if (trimmed.startsWith("```")) {
      // Check Code block
      blockType = "code_block";
    }

    const blockId = `p_${String(blockCounter).padStart(3, "0")}`;

    // Segment block text into sentences
    const rawSentences = segmentSentences(textContent);
    const sentences: HumanizerSentence[] = rawSentences.map((sText) => {
      sentenceCounter++;
      const sId = `s_${String(sentenceCounter).padStart(3, "0")}`;
      const wordCount = sText.split(/\s+/).filter(Boolean).length;
      return {
        id: sId,
        text: sText,
        order: sentenceCounter,
        wordCount,
        protectedTokens: [],
        claimIds: [],
      };
    });

    blocks.push({
      id: blockId,
      type: blockType,
      order: blockCounter,
      sourceText: trimmed,
      processedText: trimmed,
      sentences,
      headingLevel,
      formattingPrefix,
    });
  }

  return blocks;
}

/** Create a new canonical HumanizerDocument instance */
export function createHumanizerDocument(
  rawText: string,
  metadataOverrides?: Partial<HumanizerDocument["metadata"]>
): HumanizerDocument {
  const blocks = parseRawBlocks(rawText);
  const words = rawText.split(/\s+/).filter(Boolean);
  const now = new Date().toISOString();

  const metadata = {
    id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: metadataOverrides?.title || "Untitled Document",
    language: metadataOverrides?.language || "en",
    sourceWordCount: words.length,
    sourceCharCount: rawText.length,
    createdAt: now,
    updatedAt: now,
    ...metadataOverrides,
  };

  const terminologyMemory: TerminologyMemory = {
    terms: {},
    lockedTerms: [],
  };

  const versionInfo: PipelineVersionInfo = {
    pipelineVersion: HUMANIZER_PIPELINE_VERSION,
    promptVersion: HUMANIZER_PROMPT_VERSION,
    model: "gateway-default",
    provider: "gateway",
    decodingProfile: "balanced",
    protectionVersion: HUMANIZER_PROTECTION_VERSION,
    auditVersion: HUMANIZER_AUDIT_VERSION,
    timestamp: now,
  };

  return {
    metadata,
    blocks,
    protectedElements: [],
    claims: [],
    terminologyMemory,
    versionInfo,
  };
}

/**
 * Deterministically reconstructs the complete document string from blocks.
 * Preserves exact paragraph breaks (\n\n) and block formatting.
 */
export function renderHumanizerDocument(
  doc: HumanizerDocument,
  mode: "processed" | "source" = "processed"
): string {
  if (!doc || !doc.blocks || doc.blocks.length === 0) return "";

  return doc.blocks
    .map((block) => {
      const text = mode === "processed" && block.processedText !== undefined ? block.processedText : block.sourceText;
      if (block.type === "heading" && block.formattingPrefix && !text.startsWith(block.formattingPrefix)) {
        return `${block.formattingPrefix}${text}`;
      }
      if (block.type === "blockquote" && block.formattingPrefix && !text.startsWith(block.formattingPrefix)) {
        return `${block.formattingPrefix}${text}`;
      }
      return text;
    })
    .join("\n\n");
}

/** Deep clone a HumanizerDocument */
export function cloneHumanizerDocument(doc: HumanizerDocument): HumanizerDocument {
  return JSON.parse(JSON.stringify(doc));
}

/** Update the processed text of a specific block by ID */
export function updateBlockInDocument(
  doc: HumanizerDocument,
  blockId: string,
  updatedText: string
): HumanizerDocument {
  const cloned = cloneHumanizerDocument(doc);
  const block = cloned.blocks.find((b) => b.id === blockId);
  if (block) {
    block.processedText = updatedText;
    const newSentences = segmentSentences(updatedText);
    block.sentences = newSentences.map((sText, idx) => ({
      id: `${block.id}_s_${idx + 1}`,
      text: sText,
      order: idx + 1,
      wordCount: sText.split(/\s+/).filter(Boolean).length,
      protectedTokens: [],
      claimIds: [],
    }));
    cloned.metadata.updatedAt = new Date().toISOString();
  }
  return cloned;
}

/** Register a user-locked term in the document's terminology memory */
export function addLockedTerm(doc: HumanizerDocument, term: string): HumanizerDocument {
  const cloned = cloneHumanizerDocument(doc);
  const cleanTerm = term.trim();
  if (!cleanTerm) return cloned;

  if (!cloned.terminologyMemory.lockedTerms.includes(cleanTerm)) {
    cloned.terminologyMemory.lockedTerms.push(cleanTerm);
  }

  const termsRecord = cloned.terminologyMemory.terms as Record<string, any>;
  termsRecord[cleanTerm] = {
    term: cleanTerm,
    locked: true,
    occurrences: 0,
    locations: [],
  };

  return cloned;
}

/** Serializes a HumanizerDocument to JSON */
export function serializeHumanizerDocument(doc: HumanizerDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** Deserializes JSON into a HumanizerDocument */
export function deserializeHumanizerDocument(jsonStr: string): HumanizerDocument {
  return JSON.parse(jsonStr) as HumanizerDocument;
}
