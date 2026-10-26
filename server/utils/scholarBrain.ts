/**
 * ScholarBrain Core Engine: Scholarly Voice Enforcement & Citation Sanitization
 *
 * Enforces strict academic voice, orthographic standards, and citation hygiene
 * across all verified LLM challenge results and system generations.
 */

import {
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
  convertToBritishEnglish,
  type ScholarlyVoiceOptions,
} from "../src/utils/scholarlyVoiceGuard.js";

export interface ScholarBrainEngine {
  enforceScholarlyVoice(text: string, options?: ScholarlyVoiceOptions): string;
  scrubAndFormatCitations(text: string): string;
  sanitizePayload<T>(payload: T, options?: ScholarlyVoiceOptions): T;
  validateStructuralSchema<T>(
    payload: unknown,
    validator?: ((val: unknown) => T) | { parse: (val: unknown) => T }
  ): T;
}

/**
 * Enforces discourse-level scholarly standards:
 * 1. NFC Unicode normalization (preserves diacritics and scientific notations)
 * 2. Suppression of LLM clichés ("delve", "tapestry", "testament", etc.)
 * 3. British English orthography standardisation (when en-GB)
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
    stripCliches: true,
  });
}

/**
 * Normalizes citation brackets, removes empty/broken citation tokens,
 * and fixes corrupted whitespace in parenthetical citations.
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

export const scholarBrain: ScholarBrainEngine = {
  enforceScholarlyVoice,
  scrubAndFormatCitations,
  sanitizePayload,
  validateStructuralSchema,
};
