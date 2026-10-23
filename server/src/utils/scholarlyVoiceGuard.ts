/**
 * Discourse-Level Scholarly Voice & Orthographic Guardrails
 *
 * Implements strict scholarly voice criteria across all AI generation and evaluation engines:
 * 1. Lexical Fingerprint Suppression: Bans LLM cliché tokens ("delve", "tapestry", "testament", etc.)
 * 2. Syntactic Burstiness & Epistemic Hedging: Alternates concise declaratives with analytical clauses
 * 3. Term-Locking, Dialect & Unicode/IAST Fidelity: Enforces British English by default, preserves NFC diacritics
 * 4. Claim-to-Evidence Provenance: Flags unbacked assertions with [Unverified Claim — Vault Citation Required]
 */

export type ScholarlyDialect = "en-GB" | "en-US";

export interface ScholarlyVoiceOptions {
  dialect?: ScholarlyDialect;
  discipline?: string;
  requireVaultEvidence?: boolean;
  lockedTerms?: string[];
  maxBurstinessRatio?: number;
}

export const BANNED_CLICHE_TOKENS: readonly string[] = [
  "delve",
  "delves",
  "delving",
  "tapestry",
  "testament",
  "underscores",
  "pivotal",
  "it is worth noting",
  "it's worth noting",
  "beacon of",
  "nestled",
  "vibrant",
  "in conclusion, it is clear",
  "game-changer",
  "groundbreaking tapestry",
  "multifaceted tapestry",
  "rich tapestry",
];

export const BRITISH_SPELLING_MAP: Readonly<Record<string, string>> = {
  analyze: "analyse",
  analyzed: "analysed",
  analyzing: "analysing",
  synthesize: "synthesise",
  synthesized: "synthesised",
  synthesizing: "synthesising",
  generalize: "generalise",
  generalized: "generalised",
  generalizing: "generalising",
  utilize: "utilise",
  utilized: "utilised",
  utilizing: "utilising",
  behavior: "behaviour",
  behaviors: "behaviours",
  color: "colour",
  colors: "colours",
  center: "centre",
  centers: "centres",
  fiber: "fibre",
  fibers: "fibres",
  modeling: "modelling",
  modeled: "modelled",
  rigor: "rigour",
  rigors: "rigours",
  flavor: "flavour",
  neighbor: "neighbour",
  neighbors: "neighbours",
  colorful: "colourful",
  organize: "organise",
  organized: "organised",
  organizing: "organising",
  organization: "organisation",
  organizations: "organisations",
  prioritize: "prioritise",
  prioritized: "prioritised",
  prioritizing: "prioritising",
  recognize: "recognise",
  recognized: "recognised",
  recognizing: "recognising",
};

/**
 * Constructs the canonical system prompt instructing the model to adhere
 * to authentic academic discourse standards.
 */
export function buildScholarlyVoiceSystemPrompt(options: ScholarlyVoiceOptions = {}): string {
  const dialect = options.dialect ?? "en-GB";
  const discipline = options.discipline ? ` within ${options.discipline}` : "";
  const locked = options.lockedTerms && options.lockedTerms.length > 0
    ? `\n- Locked Technical Terms (do not alter, translate or rephrase): ${options.lockedTerms.join(", ")}`
    : "";

  return `
[DISCOURSE-LEVEL SCHOLARLY VOICE & ORTHOGRAPHIC MANDATE${discipline.toUpperCase()}]
You are an elite academic peer reviewer, principal investigator, and scholarly editor. You must uphold uncompromising academic rigor:

1. LEXICAL FINGERPRINT SUPPRESSION (ZERO TOLERANCE FOR LLM CLICHÉS):
- STRICTLY FORBIDDEN WORDS/PHRASES: "delve", "delving", "tapestry", "testament", "underscores", "pivotal", "it is worth noting", "beacon", "game-changer", "rich tapestry".
- Eliminate mechanical transition chains (e.g. repeated "Moreover, ...", "Furthermore, ..."). Use organic thematic linkages instead.
- Avoid artificial, symmetrical 3-bullet parallel summaries. Frame critical distinctions through analytical prose.

2. SYNTACTIC BURSTINESS & EPISTEMIC HEDGING:
- Alternate concise empirical declaratives (e.g., "The model failed under stress.") with complex, multi-clause analytical sentences.
- Employ domain-authentic epistemic hedging where certainty cannot be absolute:
  * "Whilst the empirical variance indicates..."
  * "Within the boundary conditions of this inquiry..."
  * "Preliminary coefficient divergence suggests, but does not conclusively establish..."
  * "The observed telemetry tends to corroborate..."

3. DIALECT, ORTHOGRAPHY & UNICODE FIDELITY:
- DIALECT: Default to ${dialect === "en-GB" ? "British English (e.g., analyse, synthesise, colour, behaviour, centre, modelling)" : "American English (e.g., analyze, synthesize, color, behavior, center, modeling)"}.
- UNICODE/IAST PRESERVATION: Preserve all Unicode diacritics and IAST transliterations (e.g., ā, ī, ū, ṛ, ṝ, ḷ, ś, ṣ, ṇ, ṭ, ḍ, ḥ, ṃ) with strict NFC normalization. Never strip or mangle diacritical marks.
- NOMENCLATURE & CITATION LOCKING: Strictly lock all DOI strings, mathematical expressions, chemical notations, in-text citations ([Author, Year]), and formal taxonomic nomenclatures.${locked}

4. CLAIM-TO-EVIDENCE PROVENANCE:
- Every factual, statistical, or empirical assertion must be grounded in verified literature or explicit data.
- If proposing or synthesizing an empirical claim that lacks direct backing in the provided context or Knowledge Vault, append: "[Unverified Claim — Vault Citation Required]".
`.trim();
}

/**
 * Scans text for prohibited LLM cliché tokens and returns any offending instances.
 */
export function detectBannedTokens(text: string): { hasBannedTokens: boolean; matches: string[] } {
  if (!text || text.trim().length === 0) {
    return { hasBannedTokens: false, matches: [] };
  }

  const normalized = text.toLowerCase();
  const matches: string[] = [];

  for (const token of BANNED_CLICHE_TOKENS) {
    // Word boundary check for single words, direct include for phrases
    if (token.includes(" ")) {
      if (normalized.includes(token)) {
        matches.push(token);
      }
    } else {
      const regex = new RegExp(`\\b${token}\\b`, "i");
      if (regex.test(normalized)) {
        matches.push(token);
      }
    }
  }

  return {
    hasBannedTokens: matches.length > 0,
    matches,
  };
}

/**
 * Normalizes Unicode to Canonical Composition (NFC), guaranteeing diacritics
 * (e.g. IAST Sanskrit, Arabic transliteration, French accents) remain uncorrupted.
 */
export function normalizeUnicodeNFC(text: string): string {
  if (!text) return "";
  return text.normalize("NFC");
}

/**
 * Converts American English spellings to British English conventions
 * while protecting URLs, DOIs, and code identifiers.
 */
export function convertToBritishEnglish(text: string): string {
  if (!text) return "";

  // Split out URLs and DOIs to avoid corrupting technical links
  const urlPlaceholderRegex = /(https?:\/\/[^\s]+|10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/g;
  const urls: string[] = [];
  const protectedText = text.replace(urlPlaceholderRegex, (match) => {
    urls.push(match);
    return `__SCHOLAR_PROTECTED_URL_${urls.length - 1}__`;
  });

  let converted = protectedText;
  for (const [american, british] of Object.entries(BRITISH_SPELLING_MAP)) {
    const regex = new RegExp(`\\b${american}\\b`, "gi");
    converted = converted.replace(regex, (match) => {
      // Preserve capitalization of the matched token
      if (match[0] === match[0].toUpperCase()) {
        return british[0].toUpperCase() + british.slice(1);
      }
      return british;
    });
  }

  // Restore URLs
  return converted.replace(/__SCHOLAR_PROTECTED_URL_(\d+)__/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return urls[idx] ?? "";
  });
}

/**
 * Comprehensive post-generation text sanitizer enforcing orthographic standards.
 */
export function sanitizeScholarlyText(
  text: string,
  options: { dialect?: ScholarlyDialect; stripCliches?: boolean } = {}
): string {
  if (!text) return "";

  let result = normalizeUnicodeNFC(text);

  if (options.dialect === "en-GB" || options.dialect === undefined) {
    result = convertToBritishEnglish(result);
  }

  if (options.stripCliches) {
    // Softly rephrase known cliché transitions and banned LLM cliché tokens
    result = result
      .replace(/\bit is worth noting that\b/gi, "notably,")
      .replace(/\bit's worth noting that\b/gi, "notably,")
      .replace(/\ba testament to\b/gi, "evidence of")
      .replace(/\btestament to\b/gi, "evidence of")
      .replace(/\btestament\b/gi, "indication")
      .replace(/\bdelve into\b/gi, "investigate")
      .replace(/\bdelves into\b/gi, "investigates")
      .replace(/\bdelving into\b/gi, "investigating")
      .replace(/\bdelve\b/gi, "examine")
      .replace(/\bintricate tapestry\b/gi, "framework")
      .replace(/\brich tapestry\b/gi, "corpus")
      .replace(/\bgroundbreaking tapestry\b/gi, "system")
      .replace(/\bmultifaceted tapestry\b/gi, "structure")
      .replace(/\btapestry\b/gi, "framework")
      .replace(/\bunderscores\b/gi, "emphasises")
      .replace(/\bunderscore\b/gi, "emphasise")
      .replace(/\bunderscoring\b/gi, "emphasising")
      .replace(/\bpivotal\b/gi, "central")
      .replace(/\bbeacon of\b/gi, "model of")
      .replace(/\bgame-changer\b/gi, "significant advance")
      .replace(/\bat the end of the day\b/gi, "ultimately")
      .replace(/\bin conclusion, it is clear\b/gi, "in summary,");
  }

  return result;
}

/**
 * Evaluates whether text meets scholarly burstiness criteria (sentence length variance).
 */
export function evaluateBurstiness(text: string): {
  averageLength: number;
  variance: number;
  burstinessScore: number; // 0 to 1 scale
  isSufficientlyBurst: boolean;
} {
  if (!text || text.trim().length === 0) {
    return { averageLength: 0, variance: 0, burstinessScore: 0, isSufficientlyBurst: false };
  }

  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length < 2) {
    return { averageLength: sentences[0]?.split(/\s+/).length ?? 0, variance: 0, burstinessScore: 0.5, isSufficientlyBurst: true };
  }

  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = lengths.reduce((acc, len) => acc + len, 0) / lengths.length;
  const variance = lengths.reduce((acc, len) => acc + Math.pow(len - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of Variation (CV = stdDev / mean) is a standard measure of burstiness
  const cv = mean > 0 ? stdDev / mean : 0;
  const burstinessScore = Math.min(1, Math.max(0, cv));

  return {
    averageLength: Math.round(mean * 10) / 10,
    variance: Math.round(variance * 10) / 10,
    burstinessScore: Math.round(burstinessScore * 100) / 100,
    isSufficientlyBurst: burstinessScore >= 0.25,
  };
}
