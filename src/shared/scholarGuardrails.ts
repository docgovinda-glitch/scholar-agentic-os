/**
 * Isomorphic Scholarly Voice, Orthography & Citation Guardrails
 *
 * Shared between client and server AI execution pipelines to guarantee
 * identical, deterministic scholarly quality standards:
 * 1. Unicode NFC diacritic normalization (IAST, scientific notations).
 * 2. British/Oxford spelling enforcement (with URL/DOI protection).
 * 3. Banned LLM cliché suppression ("delve", "tapestry", "testament", etc.).
 * 4. Syntactic burstiness & variance evaluation.
 * 5. Citation scrubbing and structural payload sanitization.
 */

export type ScholarlyDialect = "en-GB" | "en-US";

export interface ScholarlyVoiceOptions {
  dialect?: ScholarlyDialect;
  discipline?: string;
  requireVaultEvidence?: boolean;
  lockedTerms?: string[];
  maxBurstinessRatio?: number;
  stripCliches?: boolean;
}

export interface BurstinessMetrics {
  averageLength: number;
  variance: number;
  burstinessScore: number;
  isSufficientlyBurst: boolean;
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
  "intricate tapestry",
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
  behavioral: "behavioural",
  behaviorally: "behaviourally",
  color: "colour",
  colors: "colours",
  colorful: "colourful",
  center: "centre",
  centers: "centres",
  fiber: "fibre",
  fibers: "fibres",
  flavor: "flavour",
  neighbor: "neighbour",
  neighbors: "neighbours",
  modeling: "modelling",
  modeled: "modelled",
  rigor: "rigour",
  rigors: "rigours",
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
 * Normalizes Unicode to Canonical Composition (NFC), preserving
 * diacritical marks (IAST transliteration, accents, mathematical glyphs).
 */
export function normalizeUnicodeNFC(text: string): string {
  if (!text) return "";
  return text.normalize("NFC");
}

/**
 * Converts American English spellings to British English while
 * preserving technical strings (URLs, DOIs, and code tokens).
 */
export function convertToBritishEnglish(text: string): string {
  if (!text) return "";

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
      if (match[0] === match[0].toUpperCase()) {
        return british[0].toUpperCase() + british.slice(1);
      }
      return british;
    });
  }

  return converted.replace(/__SCHOLAR_PROTECTED_URL_(\d+)__/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return urls[idx] ?? "";
  });
}

/**
 * Scans text for banned LLM cliché tokens.
 */
export function detectBannedTokens(text: string): { hasBannedTokens: boolean; matches: string[] } {
  if (!text || text.trim().length === 0) {
    return { hasBannedTokens: false, matches: [] };
  }

  const normalized = text.toLowerCase();
  const matches: string[] = [];

  for (const token of BANNED_CLICHE_TOKENS) {
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
 * Sanitizes scholarly text according to dialect and cliché policies.
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
 * Evaluates syntactic burstiness (sentence length variance).
 */
export function evaluateBurstiness(text: string): BurstinessMetrics {
  if (!text || text.trim().length === 0) {
    return { averageLength: 0, variance: 0, burstinessScore: 0, isSufficientlyBurst: false };
  }

  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length < 2) {
    return {
      averageLength: sentences[0]?.split(/\s+/).length ?? 0,
      variance: 0,
      burstinessScore: 0.5,
      isSufficientlyBurst: true,
    };
  }

  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = lengths.reduce((acc, len) => acc + len, 0) / lengths.length;
  const variance = lengths.reduce((acc, len) => acc + Math.pow(len - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  const cv = mean > 0 ? stdDev / mean : 0;
  const burstinessScore = Math.min(1, Math.max(0, cv));

  return {
    averageLength: Math.round(mean * 10) / 10,
    variance: Math.round(variance * 10) / 10,
    burstinessScore: Math.round(burstinessScore * 100) / 100,
    isSufficientlyBurst: burstinessScore >= 0.25,
  };
}

/**
 * Normalizes citation brackets, removes empty/broken citation tokens,
 * and fixes spacing in in-text citations.
 */
export function scrubAndFormatCitations(text: string): string {
  if (!text || typeof text !== "string") return "";

  let cleaned = text;

  // 1. Remove empty or whitespace-only brackets: [] or [  ]
  cleaned = cleaned.replace(/\[\s*\]/g, "");

  // 2. Normalize spaced bracket numbers: [ 1 ] -> [1], [ 12 ] -> [12]
  cleaned = cleaned.replace(/\[\s*(\d+)\s*\]/g, "[$1]");

  // 3. Normalize spaced source tags: [ src-1 ] -> [src-1]
  cleaned = cleaned.replace(/\[\s*(src-\d+)\s*\]/gi, "[$1]");

  // 4. Fix double parenthetical citations: ((Author, Year)) -> (Author, Year)
  cleaned = cleaned.replace(/\(\(([A-Z][A-Za-z\s&,.-]+?,\s*(?:19|20)\d{2}[a-z]?)\)\)/g, "($1)");

  // 5. Clean erratic whitespace inside author-year parentheticals: (  Smith , 2020  ) -> (Smith, 2020)
  cleaned = cleaned.replace(/\(\s*([A-Z][A-Za-z\s&,.-]+?)\s*,\s*((?:19|20)\d{2}[a-z]?)\s*\)/g, "($1, $2)");

  return cleaned;
}

/**
 * High-level scholarly voice enforcer combining NFC normalization,
 * British spelling, and cliché suppression.
 */
export function enforceScholarlyVoice(text: string, options: ScholarlyVoiceOptions = {}): string {
  if (!text || typeof text !== "string") return "";

  const dialect = options.dialect ?? "en-GB";
  let normalized = normalizeUnicodeNFC(text);

  if (dialect === "en-GB") {
    normalized = convertToBritishEnglish(normalized);
  }

  return sanitizeScholarlyText(normalized, {
    dialect,
    stripCliches: options.stripCliches ?? true,
  });
}

/**
 * Deeply sanitizes any primitive, object, or array payload, applying
 * voice and citation rules to all string fields recursively.
 */
export function sanitizePayload<T>(payload: T, options?: ScholarlyVoiceOptions): T {
  if (typeof payload === "string") {
    const voiced = enforceScholarlyVoice(payload, options);
    return scrubAndFormatCitations(voiced) as unknown as T;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item, options)) as unknown as T;
  }

  if (payload !== null && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const sanitizedRecord: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      sanitizedRecord[key] = sanitizePayload(val, options);
    }
    return sanitizedRecord as T;
  }

  return payload;
}

/**
 * Validates payload structure using a Zod schema or functional validator.
 */
export function validateStructuralSchema<T>(
  payload: unknown,
  validator?: ((val: unknown) => T) | { parse: (val: unknown) => T }
): T {
  if (!validator) {
    return payload as T;
  }

  if (typeof validator === "function") {
    return validator(payload);
  }

  if (typeof validator === "object" && "parse" in validator && typeof validator.parse === "function") {
    return validator.parse(payload);
  }

  return payload as T;
}

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
- Eliminate mechanical transition chains. Use organic thematic linkages instead.

2. SYNTACTIC BURSTINESS & EPISTEMIC HEDGING:
- Alternate concise empirical declaratives with complex, multi-clause analytical sentences.
- Employ domain-authentic epistemic hedging where certainty cannot be absolute.

3. DIALECT, ORTHOGRAPHY & UNICODE FIDELITY:
- DIALECT: Default to ${dialect === "en-GB" ? "British English (e.g., analyse, synthesise, colour, behaviour, centre, modelling)" : "American English"}.
- UNICODE/IAST PRESERVATION: Preserve all Unicode diacritics and scientific notations with strict NFC normalization.
- NOMENCLATURE & CITATION LOCKING: Strictly lock all DOI strings, mathematical expressions, chemical notations, in-text citations ([Author, Year]), and formal taxonomic nomenclatures.${locked}
`.trim();
}

export const scholarGuardrails = {
  normalizeUnicodeNFC,
  convertToBritishEnglish,
  detectBannedTokens,
  sanitizeScholarlyText,
  evaluateBurstiness,
  scrubAndFormatCitations,
  enforceScholarlyVoice,
  sanitizePayload,
  validateStructuralSchema,
  buildScholarlyVoiceSystemPrompt,
  BRITISH_SPELLING_MAP,
  BANNED_CLICHE_TOKENS,
};
