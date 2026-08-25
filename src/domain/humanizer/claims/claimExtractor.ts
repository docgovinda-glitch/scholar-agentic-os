/**
 * Propositional Claim & Epistemic Modality Extractor.
 *
 * Extracts structured semantic propositions, epistemic certainty tiers,
 * negation state, causal relationships, and quantitative constraints from text.
 */

import {
  ExtractedClaim,
  EpistemicModality,
  EpistemicCertainty,
  ClaimCausality,
  HumanizerDocument,
} from "../types";
import { segmentSentences } from "../document/humanizerDocument";

// ─── Lexical Modality Markers ───
const POSSIBLE_MODALITY_REGEX =
  /\b(?:may(?:\s+not)?|might|could|possibly|perhaps|potential|tentative|suggests?|indicates?|implies|hypothesiz(?:e|ed)|conceivably)\b/i;

const PROBABLE_MODALITY_REGEX =
  /\b(?:likely|probable|probably|tends?\s+to|appears?\s+to|seems?\s+to|expected\s+to|presumably|generally|typically|substantially)\b/i;

const CERTAIN_MODALITY_REGEX =
  /\b(?:proves?|demonstrates?|establishes|confirms?|causes?|determines?|conclusively|definitely|undeniably|reveals?|results?\s+in|is\s+evident)\b/i;

// ─── Negation Markers ───
const NEGATION_REGEX =
  /\b(?:not|no|never|cannot|can't|does\s+not|did\s+not|is\s+not|are\s+not|was\s+not|were\s+not|fails?\s+to|absence\s+of|lacks?|without|neither|nor)\b/i;

// ─── Causality Markers ───
const DIRECT_CAUSAL_REGEX =
  /\b(?:causes?|caused\s+by|leads?\s+to|results?\s+in|triggers?|drives?|induces?|produces?|yields?)\b/i;

const CORRELATIONAL_REGEX =
  /\b(?:associated\s+with|correlated\s+with|linked\s+to|related\s+to|co-occurs?\s+with|relationship\s+between|parallels?|connected\s+to)\b/i;

const POSSIBLE_CAUSAL_REGEX =
  /\b(?:may\s+(?:contribute\s+to|lead\s+to|improve|affect|influence|reduce)|might\s+(?:cause|lead\s+to|affect|influence|improve|reduce)|could\s+(?:lead\s+to|improve|affect|influence|reduce)|potential\s+driver\s+of|possible\s+cause\s+of)\b/i;

/** Detects epistemic modality from proposition text */
export function detectModality(text: string): EpistemicModality {
  if (POSSIBLE_MODALITY_REGEX.test(text)) return "possible";
  if (PROBABLE_MODALITY_REGEX.test(text)) return "probable";
  if (CERTAIN_MODALITY_REGEX.test(text)) return "certain";
  return "unspecified";
}

/** Detects epistemic certainty level from modality and phrasing */
export function detectCertainty(text: string, modality: EpistemicModality): EpistemicCertainty {
  if (modality === "possible" || /\b(?:preliminary|tentative|weak\s+evidence|unclear)\b/i.test(text)) {
    return "low";
  }
  if (modality === "probable" || /\b(?:moderate|trend|suggestive)\b/i.test(text)) {
    return "medium";
  }
  if (modality === "certain" || /\b(?:strong|definitive|conclusive|statistically\s+significant|proves)\b/i.test(text)) {
    return "high";
  }
  return "medium";
}

/** Detects presence of grammatical negation */
export function detectNegation(text: string): boolean {
  return NEGATION_REGEX.test(text);
}

/** Classifies the causal nature of the proposition */
export function detectCausality(text: string): ClaimCausality {
  if (POSSIBLE_CAUSAL_REGEX.test(text)) return "possible_causal";
  if (DIRECT_CAUSAL_REGEX.test(text)) return "direct";
  if (CORRELATIONAL_REGEX.test(text)) return "correlational";
  return "none";
}

/** Extracts embedded quantitative constraints and numbers from proposition */
export function extractQuantitativeConstraints(text: string): string[] {
  const constraints: string[] = [];

  // Match percentages: 45.2%
  const pcts = text.match(/\b\d+(?:\.\d+)?\s*%/g);
  if (pcts) constraints.push(...pcts);

  // Match p-values / R^2: p < 0.001, R^2 = 0.88
  const stats = text.match(/\b(?:p\s*[<>=≤≥]\s*0?\.\d+|R[\^²]2?\s*=\s*0?\.\d+)\b/gi);
  if (stats) constraints.push(...stats);

  // Match sample sizes: n = 120
  const samples = text.match(/\b[nN]\s*=\s*\d+\b/g);
  if (samples) constraints.push(...samples);

  // Match measurements: 12.5 mg/dL
  const measurements = text.match(/\b\d+(?:\.\d+)?\s*(?:mg\/dL|mg|kg|km|m|mL|L|GB|MB)\b/gi);
  if (measurements) constraints.push(...measurements);

  return Array.from(new Set(constraints));
}

/** Extracts embedded evidence/citation tokens */
export function extractEvidenceRefs(text: string): string[] {
  const refs = text.match(/⟦PROTECTED_CITATION_[A-Z0-9_]+_[a-zA-Z0-9]+⟧|\((?:[A-Z][a-zA-Z\s.-]+,\s*(?:19|20)\d{2}[a-z]?)\)|\[\d+(?:[–,-]\s*\d+)*\]/g) || [];
  return Array.from(new Set(refs));
}

/** Extract a single structured claim from a single sentence */
export function extractClaimFromSentence(
  sentenceText: string,
  options?: {
    blockId?: string;
    sentenceId?: string;
    claimIndex?: number;
  }
): ExtractedClaim {
  const trimmed = sentenceText.trim();
  const modality = detectModality(trimmed);
  const certainty = detectCertainty(trimmed, modality);
  const negation = detectNegation(trimmed);
  const causality = detectCausality(trimmed);
  const quantitativeConstraints = extractQuantitativeConstraints(trimmed);
  const evidenceRefs = extractEvidenceRefs(trimmed);

  const blockId = options?.blockId || "p_001";
  const sentenceId = options?.sentenceId || "s_001";
  const claimIdx = options?.claimIndex ?? 1;
  const claimId = `claim_${String(claimIdx).padStart(3, "0")}`;

  return {
    claimId,
    proposition: trimmed,
    modality,
    certainty,
    negation,
    causality,
    quantitativeConstraints: quantitativeConstraints.length > 0 ? quantitativeConstraints : undefined,
    evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : undefined,
    sourceBlockId: blockId,
    sourceSentenceId: sentenceId,
    sourceSentenceIds: [sentenceId],
  };
}

/**
 * Extracts structured claims across an entire HumanizerDocument.
 */
export function extractClaimsFromDocument(doc: HumanizerDocument): HumanizerDocument {
  const extractedClaims: ExtractedClaim[] = [];
  let claimCounter = 0;

  for (const block of doc.blocks) {
    const rawText = block.processedText || block.sourceText;
    const sentences = block.sentences.length > 0 ? block.sentences : segmentSentences(rawText).map((s, idx) => ({
      id: `${block.id}_s_${idx + 1}`,
      text: s,
      order: idx + 1,
      wordCount: s.split(/\s+/).length,
      protectedTokens: [],
      claimIds: [],
    }));

    for (const sentence of sentences) {
      claimCounter++;
      const claim = extractClaimFromSentence(sentence.text, {
        blockId: block.id,
        sentenceId: sentence.id,
        claimIndex: claimCounter,
      });

      sentence.claimIds = [claim.claimId];
      extractedClaims.push(claim);
    }
  }

  return {
    ...doc,
    claims: extractedClaims,
  };
}
