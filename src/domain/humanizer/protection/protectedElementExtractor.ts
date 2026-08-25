/**
 * Layered Protected Element Extractor for the AI Text Humanizer.
 *
 * Implements a strict, deterministic multi-layer extraction pipeline with
 * source-offset tracking and non-overlapping span enforcement.
 */

import {
  ProtectedElement,
  ProtectedElementType,
  HumanizerDocument,
} from "../types";
import {
  TokenRegistry,
  generateElementHash,
  formatProtectedToken,
} from "./tokenRegistry";

export interface OccupiedSpan {
  start: number;
  end: number;
}

export function isOverlapping(start: number, end: number, occupied: OccupiedSpan[]): boolean {
  return occupied.some((span) => Math.max(span.start, start) < Math.min(span.end, end));
}

interface RawExtractionCandidate {
  type: ProtectedElementType;
  value: string;
  start: number;
  end: number;
}

/** Layer 1: Code blocks & Inline code */
function extractCodeSpans(text: string): RawExtractionCandidate[] {
  const candidates: RawExtractionCandidate[] = [];
  // Fenced code blocks ```...```
  const blockRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    candidates.push({
      type: "code",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  // Inline code `...`
  const inlineRegex = /`[^`\n]+`/g;
  while ((match = inlineRegex.exec(text)) !== null) {
    candidates.push({
      type: "code",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return candidates;
}

/** Layer 2: LaTeX & Math */
function extractMathSpans(text: string): RawExtractionCandidate[] {
  const candidates: RawExtractionCandidate[] = [];
  // Display math $$ ... $$ or \[ ... \]
  const displayRegex = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]/g;
  let match: RegExpExecArray | null;
  while ((match = displayRegex.exec(text)) !== null) {
    candidates.push({
      type: "latex_block",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  // Inline math $ ... $ or \( ... \)
  const inlineRegex = /\$(?!\s)[^$\n]+(?<!\s)\$|\\\([^\n]+?\\\)/g;
  while ((match = inlineRegex.exec(text)) !== null) {
    candidates.push({
      type: "latex_inline",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return candidates;
}

/** Layer 3: URLs, DOIs, Emails */
function extractUrlDoiEmailSpans(text: string): RawExtractionCandidate[] {
  const candidates: RawExtractionCandidate[] = [];
  let match: RegExpExecArray | null;

  // URLs
  const urlRegex = /\bhttps?:\/\/[^\s<>"{}|\\^`\[\])]+/gi;
  while ((match = urlRegex.exec(text)) !== null) {
    candidates.push({
      type: "url",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // DOIs: doi:10.1000/182 or 10.1000/182
  const doiRegex = /\b(?:doi:\s*)?10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;
  while ((match = doiRegex.exec(text)) !== null) {
    candidates.push({
      type: "doi",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Emails
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  while ((match = emailRegex.exec(text)) !== null) {
    candidates.push({
      type: "email",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return candidates;
}

/** Layer 4: Direct Quotations */
function extractQuotationSpans(text: string): RawExtractionCandidate[] {
  const candidates: RawExtractionCandidate[] = [];
  // Match "...", “...”, or «...» when containing 3 or more words or >= 12 chars
  const quoteRegex = /(?:["“«])([^"”»\n]{12,})(?:["”»])/g;
  let match: RegExpExecArray | null;
  while ((match = quoteRegex.exec(text)) !== null) {
    const inner = match[1].trim();
    if (inner.split(/\s+/).length >= 2) {
      candidates.push({
        type: "quotation",
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return candidates;
}

/** Layer 5: Citations */
function extractCitationSpans(text: string): RawExtractionCandidate[] {
  const candidates: RawExtractionCandidate[] = [];
  let match: RegExpExecArray | null;

  // 1. Narrative citation: Smith et al. (2024), Wilson (2022)
  const narrativeRegex = /\b[A-Z][a-zA-Z.-]+(?:\s+et\s+al\.)?\s*\((?:19|20)\d{2}[a-z]?(?:;\s+[A-Z][a-zA-Z.-]+(?:\s+et\s+al\.)?,\s*(?:19|20)\d{2}[a-z]?)*\)/g;
  while ((match = narrativeRegex.exec(text)) !== null) {
    candidates.push({
      type: "citation_author_year",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // 2. Parenthetical author-year: (Smith, 2024), (Smith et al., 2024), (Wilson et al., 2022; Adams, 2021)
  const authorYearRegex = /\((?:[A-Z][a-zA-Z\s.-]+(?:et al\.?)?,?\s+(?:19|20)\d{2}[a-z]?(?:;\s+)?)+\)/g;
  while ((match = authorYearRegex.exec(text)) !== null) {
    candidates.push({
      type: "citation_apa",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // 3. Numeric / IEEE citations: [1], [1-4], [1, 3, 7], [4, 7], [@key]
  const numericRegex = /\[(?:\d+(?:[–,-]\s*\d+)*|@[a-zA-Z0-9_:-]+)\]/g;
  while ((match = numericRegex.exec(text)) !== null) {
    candidates.push({
      type: "citation_ieee",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return candidates;
}

/** Layer 6: Statistical Expressions */
function extractStatisticalSpans(text: string): RawExtractionCandidate[] {
  const candidates: RawExtractionCandidate[] = [];
  let match: RegExpExecArray | null;

  // p-values: p < 0.001, p = 0.042, p <= 0.05
  const pValRegex = /\bp\s*[<>=≤≥]\s*0?\.\d+\b/gi;
  while ((match = pValRegex.exec(text)) !== null) {
    candidates.push({
      type: "statistical_expression",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // R^2 / R² = 0.88
  const r2Regex = /\bR[\^²]2?\s*=\s*0?\.\d+\b/gi;
  while ((match = r2Regex.exec(text)) !== null) {
    candidates.push({
      type: "statistical_expression",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Test statistics: t(48) = 2.45, F(2, 45) = 3.12, chi^2(1) = 4.3, χ² = 4.3
  const testStatRegex = /\b(?:[tFzZ]\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\)\s*=\s*-?\d+\.?\d*|(?:chi|χ)\^?2?\s*(?:\(\s*\d+\s*\))?\s*=\s*\d+\.?\d*)\b/gi;
  while ((match = testStatRegex.exec(text)) !== null) {
    candidates.push({
      type: "statistical_expression",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Confidence intervals: 95% CI [1.2, 3.4], 95% CI: 1.2-3.4
  const ciRegex = /\b(?:95%|90%|99%)?\s*CI\s*(?:[:=]|is)?\s*\[\s*-?\d+\.?\d*\s*,\s*-?\d+\.?\d*\s*\]/gi;
  while ((match = ciRegex.exec(text)) !== null) {
    candidates.push({
      type: "statistical_expression",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Sample size: n = 120, N = 1,450
  const sampleRegex = /\b[nN]\s*=\s*\d+(?:,\d{3})*\b/g;
  while ((match = sampleRegex.exec(text)) !== null) {
    candidates.push({
      type: "sample_size",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return candidates;
}

/** Layer 7: Percentages, Measurements, Currency, Dates, Years */
function extractQuantitativeSpans(text: string): RawExtractionCandidate[] {
  const candidates: RawExtractionCandidate[] = [];
  let match: RegExpExecArray | null;

  // Percentages: 45.2%, 12%
  const pctRegex = /\b\d+(?:\.\d+)?\s*%/g;
  while ((match = pctRegex.exec(text)) !== null) {
    candidates.push({
      type: "percentage",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Currency: $1,200, €50.00, £45, ¥1000
  const currRegex = /[\$€£¥₹]\s*\d+(?:,\d{3})*(?:\.\d{2})?\b/g;
  while ((match = currRegex.exec(text)) !== null) {
    candidates.push({
      type: "currency",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Measurements with standard SI and scientific units
  const measureRegex = /\b\d+(?:\.\d+)?\s*(?:mg\/dL|mg\/kg|mg|kg|km\/h|km|cm|mm|nm|µm|mL|dL|GHz|MHz|kHz|Hz|kV|mV|mA|kW|MW|mol|mmol|GB|MB|KB|mg|mL|L|g|K|Pa|kPa|MPa)\b/g;
  while ((match = measureRegex.exec(text)) !== null) {
    candidates.push({
      type: "measurement",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Dates: January 15, 2024; 15 Jan 2023; 2024-05-12
  const dateRegex = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d{2}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(?:19|20)\d{2}\b|\b(?:19|20)\d{2}-\d{2}-\d{2}\b/gi;
  while ((match = dateRegex.exec(text)) !== null) {
    candidates.push({
      type: "date",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return candidates;
}

/** Layer 8: User-Locked Terms */
function extractLockedTermSpans(text: string, lockedTerms: string[] = []): RawExtractionCandidate[] {
  const candidates: RawExtractionCandidate[] = [];
  if (lockedTerms.length === 0) return candidates;

  for (const term of lockedTerms) {
    const clean = term.trim();
    if (!clean) continue;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      candidates.push({
        type: "locked_term",
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return candidates;
}

/** Layer 9: Technical Identifiers & Chemical Formulas */
function extractTechnicalSpans(text: string): RawExtractionCandidate[] {
  const candidates: RawExtractionCandidate[] = [];
  let match: RegExpExecArray | null;

  // Technical standard identifiers: ISO-9001, IEEE-802.11, COVID-19, CRISPR-Cas9
  const techRegex = /\b(?:ISO-\d+|IEEE-\d+\.\d+|COVID-19|CRISPR-Cas\d+)\b/g;
  while ((match = techRegex.exec(text)) !== null) {
    candidates.push({
      type: "technical_identifier",
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return candidates;
}

/**
 * Extracts all protected elements from text using deterministic layered precedence
 * with strict non-overlapping span enforcement.
 */
export function extractProtectedElements(
  text: string,
  options?: {
    blockId?: string;
    sentenceId?: string;
    lockedTerms?: string[];
  }
): { elements: ProtectedElement[]; shieldedText: string } {
  if (!text || !text.trim()) {
    return { elements: [], shieldedText: text || "" };
  }

  const occupied: OccupiedSpan[] = [];
  const rawElements: RawExtractionCandidate[] = [];

  const addNonOverlapping = (candidates: RawExtractionCandidate[]) => {
    // Sort candidates by start position ascending
    candidates.sort((a, b) => a.start - b.start);
    for (const c of candidates) {
      if (!isOverlapping(c.start, c.end, occupied)) {
        occupied.push({ start: c.start, end: c.end });
        rawElements.push(c);
      }
    }
  };

  // Execute extraction layers in strict deterministic order
  addNonOverlapping(extractCodeSpans(text));
  addNonOverlapping(extractMathSpans(text));
  addNonOverlapping(extractUrlDoiEmailSpans(text));
  addNonOverlapping(extractQuotationSpans(text));
  addNonOverlapping(extractCitationSpans(text));
  addNonOverlapping(extractStatisticalSpans(text));
  addNonOverlapping(extractQuantitativeSpans(text));
  addNonOverlapping(extractLockedTermSpans(text, options?.lockedTerms));
  addNonOverlapping(extractTechnicalSpans(text));

  // Sort all accepted raw elements by startOffset ascending
  rawElements.sort((a, b) => a.start - b.start);

  const elements: ProtectedElement[] = [];
  const blockId = options?.blockId || "p_001";
  const sentenceId = options?.sentenceId || "s_001";

  for (let idx = 0; idx < rawElements.length; idx++) {
    const item = rawElements[idx];
    const hash = generateElementHash(item.type, item.value, String(idx));
    const token = formatProtectedToken(item.type, hash);

    const contextBefore = text.slice(Math.max(0, item.start - 50), item.start);
    const contextAfter = text.slice(item.end, Math.min(text.length, item.end + 50));

    elements.push({
      token,
      type: item.type,
      originalValue: item.value,
      startOffset: item.start,
      endOffset: item.end,
      blockId,
      sentenceId,
      sourceLocation: `${blockId}:${sentenceId}`,
      occurrenceIndex: idx + 1,
      hash,
      occurrenceCount: 1,
      neighboringContext: {
        before: contextBefore,
        after: contextAfter,
      },
    });
  }

  // Replace original spans with tokens from right to left (descending startOffset)
  let shieldedText = text;
  for (let i = rawElements.length - 1; i >= 0; i--) {
    const raw = rawElements[i];
    const el = elements[i];
    shieldedText =
      shieldedText.slice(0, raw.start) + el.token + shieldedText.slice(raw.end);
  }

  return { elements, shieldedText };
}

/**
 * Shields an entire HumanizerDocument:
 * Extracts protected elements across all blocks, stores them in a TokenRegistry,
 * and updates each block's processedText to the shielded token stream.
 */
export function shieldDocument(doc: HumanizerDocument): {
  shieldedDoc: HumanizerDocument;
  registry: TokenRegistry;
} {
  const registry = new TokenRegistry();
  const allElements: ProtectedElement[] = [];
  const lockedTerms = doc.terminologyMemory?.lockedTerms || [];

  const updatedBlocks = doc.blocks.map((block) => {
    const { elements, shieldedText } = extractProtectedElements(block.sourceText, {
      blockId: block.id,
      lockedTerms,
    });

    for (const el of elements) {
      registry.register(el);
      allElements.push(el);
    }

    return {
      ...block,
      processedText: shieldedText,
    };
  });

  const shieldedDoc: HumanizerDocument = {
    ...doc,
    blocks: updatedBlocks,
    protectedElements: allElements,
  };

  return { shieldedDoc, registry };
}

/**
 * Restores a shielded HumanizerDocument using the TokenRegistry:
 * Deterministically replaces all protected tokens with their exact original values.
 */
export function restoreDocument(
  shieldedDoc: HumanizerDocument,
  registry: TokenRegistry
): HumanizerDocument {
  const restoredBlocks = shieldedDoc.blocks.map((block) => {
    const currentText = block.processedText || block.sourceText;
    const restoredText = registry.restore(currentText);

    return {
      ...block,
      processedText: restoredText,
    };
  });

  return {
    ...shieldedDoc,
    blocks: restoredBlocks,
  };
}
