/** Finds the sentence of a source's retrieved text that best supports a claim. Pure; no model call. */

const STOP = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are", "was", "were", "has", "have", "had", "not", "but", "can",
  "its", "their", "which", "also", "such", "than", "into", "between", "been", "being", "these", "those", "there", "while",
  "about", "more", "most", "other", "some", "may", "might", "will", "would", "could", "should", "across", "within",
]);

export interface SupportingPassage {
  passage: string;
  /** Claim words found in the passage, for highlighting. */
  matched: string[];
  score: number;
}

const words = (text: string): string[] =>
  (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu) || []).filter((w) => !STOP.has(w));

/**
 * A short key for a claim (its last ten significant words), so the server, which matches claims to passages
 * in the raw report, and the browser, which renders formatted text, agree on which claim a citation backs.
 */
export function claimKey(claim: string): string {
  return words(claim).slice(-10).join(" ");
}

/** A cited claim and the passage of the source that backs it; `passage: null` when the source's text has none. */
export interface ClaimPassage {
  claim: string;
  key: string;
  passage: string | null;
}

/** The sentence that precedes a citation marker (the claim it is attached to); a line or table cell ends it too. */
export function claimBefore(text: string, markerIndex: number): string {
  const head = text.slice(0, markerIndex);
  const parts = head.split(/(?<=[.!?])\s+|\n+|\|/);
  return (parts[parts.length - 1] || "").replace(/\[[^\]]*\]/g, "").trim();
}

export function findSupportingPassage(claim: string, sourceText: string, minShared = 2): SupportingPassage | null {
  const claimWords = new Set(words(claim));
  if (claimWords.size === 0 || !sourceText.trim()) return null;
  const sentences = sourceText
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"(\d])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  let best: SupportingPassage | null = null;
  for (const s of sentences.length ? sentences : [sourceText.trim()]) {
    const sw = new Set(words(s));
    const matched = [...claimWords].filter((w) => sw.has(w));
    const score = matched.length;
    if (score >= minShared && (!best || score > best.score)) best = { passage: s.length > 320 ? `${s.slice(0, 317)}…` : s, matched, score };
  }
  return best;
}
