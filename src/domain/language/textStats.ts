/**
 * Shared plain-text tokenisation primitives for domain/language.
 *
 * Extracted from voiceProfile.ts so readability.ts (added alongside AG-18,
 * the Readability Analyst — docs 42 §3 Group E) doesn't reimplement sentence
 * splitting, word splitting, and the passive-voice heuristic. Both compute
 * statistics over the same kind of plain text and should count the same way
 * — a Voice Profile and a readability report disagreeing on "how many
 * sentences is this" because of two slightly different regexes would be a
 * bug, not a feature.
 */

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function words(text: string): string[] {
  return text.match(/[A-Za-z']+/g) ?? [];
}

/** A conservative heuristic for passive voice: a form of "to be" followed by a past participle. Misses irregular participles ("was written", "was seen") by design — those need a POS tagger, not a regex; documented as a heuristic, not a claim of completeness. */
export const PASSIVE_RE = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi;

export function countMatches(text: string, re: RegExp): number {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}
