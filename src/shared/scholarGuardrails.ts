/**
 * Isomorphic Scholarly Guardrails Engine
 *
 * Runs identically in Node.js (server) and Browser (client):
 * 1. NFC Unicode / IAST Normalization: Preserves transliteration diacritics (ā, ī, ū, ṛ, ś, ṣ, ṇ).
 * 2. British/Oxford Orthography Conversion: Standardizes -ise/-our/-re spellings while protecting URLs/DOIs.
 * 3. Banned Cliché Stripping & Rephrasing: Neutralizes typical generative LLM tropes ("delve", "tapestry", "pivotal").
 * 4. Syntactic Burstiness Telemetry: Calculates sentence length variance and coefficient of variation (CV).
 */

export type ScholarOrthography = "british" | "us";

export interface ScholarGuardrailsOptions {
  orthography?: ScholarOrthography;
  stripCliches?: boolean;
}

export interface BurstinessMetrics {
  averageLength: number;
  averageSentenceLength?: number;
  variance: number;
  burstinessScore: number;
  isSufficientlyBurst: boolean;
}

export interface ScholarGuardrailsResult {
  text: string;
  wordCount: number;
  burstinessScore: number;
  variance: number;
  averageSentenceLength: number;
  isSufficientlyBurst: boolean;
  hasBannedTokens: boolean;
  detectedCliches: string[];
  clichesStripped?: string[];
  burstinessMetrics?: BurstinessMetrics;
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
  honor: "honour",
  honors: "honours",
  honored: "honoured",
  honoring: "honouring",
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
 * Normalizes Unicode into Canonical Composition (NFC), safeguarding Sanskrit IAST,
 * French/German accents, and scholarly diacritics.
 */
export function normalizeUnicodeNFC(text: string): string {
  if (!text) return "";
  return text.normalize("NFC");
}

/**
 * Converts American English spellings to British English while shielding URLs and DOIs.
 */
export function convertToBritishEnglish(text: string): string {
  if (!text) return "";

  const urlPlaceholderRegex = /(https?:\/\/[^\s]+|10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/g;
  const urls: string[] = [];
  const protectedText = text.replace(urlPlaceholderRegex, (match) => {
    urls.push(match);
    return `__SCHOLAR_URL_${urls.length - 1}__`;
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

  return converted.replace(/__SCHOLAR_URL_(\d+)__/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    return urls[idx] ?? "";
  });
}

/**
 * Scans and softly neutralizes banned LLM cliché tokens.
 */
export function sanitizeCliches(text: string): { text: string; matches: string[] } {
  if (!text) return { text: "", matches: [] };

  const matches: string[] = [];
  const normalized = text.toLowerCase();

  for (const token of BANNED_CLICHE_TOKENS) {
    if (token.includes(" ")) {
      if (normalized.includes(token)) matches.push(token);
    } else {
      const regex = new RegExp(`\\b${token}\\b`, "i");
      if (regex.test(normalized)) matches.push(token);
    }
  }

  let result = text
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

  return { text: result, matches };
}

/**
 * Evaluates syntactic burstiness by measuring sentence length distribution and variation.
 */
export function evaluateBurstiness(text: string): {
  averageLength: number;
  averageSentenceLength: number;
  variance: number;
  burstinessScore: number;
  isSufficientlyBurst: boolean;
} {
  if (!text || text.trim().length === 0) {
    return { averageLength: 0, averageSentenceLength: 0, variance: 0, burstinessScore: 0, isSufficientlyBurst: false };
  }

  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length < 2) {
    const singleLen = sentences[0]?.split(/\s+/).filter(Boolean).length ?? 0;
    return { averageLength: singleLen, averageSentenceLength: singleLen, variance: 0, burstinessScore: 0.5, isSufficientlyBurst: true };
  }

  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const mean = lengths.reduce((acc, len) => acc + len, 0) / lengths.length;
  const variance = lengths.reduce((acc, len) => acc + Math.pow(len - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  const cv = mean > 0 ? stdDev / mean : 0;
  const burstinessScore = Math.min(1, Math.max(0, cv));

  return {
    averageLength: Math.round(mean * 10) / 10,
    averageSentenceLength: Math.round(mean * 10) / 10,
    variance: Math.round(variance * 10) / 10,
    burstinessScore: Math.round(burstinessScore * 100) / 100,
    isSufficientlyBurst: burstinessScore >= 0.25,
  };
}

export function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The single canonical isomorphic guardrail application pipeline.
 */
export function applyScholarGuardrails(
  text: string,
  options: ScholarGuardrailsOptions = {}
): ScholarGuardrailsResult {
  if (!text) {
    return {
      text: "",
      wordCount: 0,
      burstinessScore: 0,
      variance: 0,
      averageSentenceLength: 0,
      isSufficientlyBurst: false,
      hasBannedTokens: false,
      detectedCliches: [],
    };
  }

  // 1. NFC Unicode / IAST Normalization
  let processed = normalizeUnicodeNFC(text);

  // 2. Dialect / Orthography
  if (options.orthography === undefined || options.orthography === "british") {
    processed = convertToBritishEnglish(processed);
  }

  // 3. Cliché Sanitization
  const { text: cleanText, matches } = options.stripCliches !== false
    ? sanitizeCliches(processed)
    : { text: processed, matches: [] };

  // 4. Metrics & Burstiness Telemetry
  const burstiness = evaluateBurstiness(cleanText);
  const wordCount = countWords(cleanText);

  return {
    text: cleanText,
    wordCount,
    burstinessScore: burstiness.burstinessScore,
    variance: burstiness.variance,
    averageSentenceLength: burstiness.averageLength,
    isSufficientlyBurst: burstiness.isSufficientlyBurst,
    hasBannedTokens: matches.length > 0,
    detectedCliches: matches,
    clichesStripped: matches,
    burstinessMetrics: burstiness,
  };
}
