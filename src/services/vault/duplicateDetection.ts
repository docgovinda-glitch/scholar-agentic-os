/**
 * Duplicate Detection Service for Source Library
 *
 * Checks candidates against existing library items using:
 * 1. Normalized DOI comparison -> Definite duplicate (100%)
 * 2. High title similarity + author/year match -> Likely duplicate (>90%)
 * 3. Moderate title similarity -> Possible duplicate (75% - 90%)
 */

import type { VaultItem } from "../vaultContents";

export type DuplicateConfidence = "definite" | "likely" | "possible";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence?: DuplicateConfidence;
  similarityPercent?: number;
  existingItem?: VaultItem;
  reason?: string;
}

export function normalizeDoi(doi?: string): string | null {
  if (!doi) return null;
  const cleaned = doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/[\.,;:]$/, "");
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeTitle(title?: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[\W_]+/g, " ")
    .trim();
}

/**
 * Calculates token-level Jaccard similarity between two strings.
 */
export function calculateTokenSimilarity(s1: string, s2: string): number {
  const tokens1 = new Set(normalizeTitle(s1).split(/\s+/).filter(Boolean));
  const tokens2 = new Set(normalizeTitle(s2).split(/\s+/).filter(Boolean));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

/**
 * Computes Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return d[m][n];
}

export function calculateLevenshteinSimilarity(s1: string, s2: string): number {
  const str1 = normalizeTitle(s1);
  const str2 = normalizeTitle(s2);
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(str1, str2);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Composite similarity: Combines character-level Levenshtein and token-level Jaccard.
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  const lev = calculateLevenshteinSimilarity(title1, title2);
  const tok = calculateTokenSimilarity(title1, title2);
  return lev * 0.6 + tok * 0.4;
}

/**
 * Checks if a candidate source matches any existing source in the user's library.
 */
export function checkForDuplicates(
  candidate: {
    doi?: string;
    title?: string;
    authors?: string[];
    year?: string;
  },
  existingItems: VaultItem[]
): DuplicateCheckResult {
  const candidateDoi = normalizeDoi(candidate.doi);
  const candidateTitle = normalizeTitle(candidate.title);

  // 1. Check exact DOI match (Definite Duplicate)
  if (candidateDoi) {
    for (const item of existingItems) {
      const itemDoi = normalizeDoi(
        item.canonicalReference?.doi || item.metadata?.doi || (item as any).doi
      );
      if (itemDoi && itemDoi === candidateDoi) {
        return {
          isDuplicate: true,
          confidence: "definite",
          similarityPercent: 100,
          existingItem: item,
          reason: `Exact DOI match: ${candidateDoi}`,
        };
      }
    }
  }

  // If no title to compare, cannot check further
  if (!candidateTitle) {
    return { isDuplicate: false };
  }

  let bestMatch: { item: VaultItem; similarity: number; hasMatchingAuthorOrYear: boolean } | null = null;

  // 2. Check title similarity
  for (const item of existingItems) {
    const itemTitle = normalizeTitle(item.title);
    if (!itemTitle) continue;

    // Check exact title match
    if (itemTitle === candidateTitle) {
      return {
        isDuplicate: true,
        confidence: "likely",
        similarityPercent: 100,
        existingItem: item,
        reason: "Exact title match",
      };
    }

    const similarity = calculateTitleSimilarity(candidate.title || "", item.title);

    // Check author/year similarity
    let hasMatchingAuthorOrYear = false;
    if (candidate.year && item.year && candidate.year === item.year) {
      hasMatchingAuthorOrYear = true;
    }
    if (candidate.authors && candidate.authors.length > 0 && item.authors && item.authors.length > 0) {
      const firstAuthorCand = candidate.authors[0].toLowerCase();
      const firstAuthorItem = item.authors[0].toLowerCase();
      if (
        firstAuthorCand.includes(firstAuthorItem) ||
        firstAuthorItem.includes(firstAuthorCand)
      ) {
        hasMatchingAuthorOrYear = true;
      }
    }

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { item, similarity, hasMatchingAuthorOrYear };
    }
  }

  if (bestMatch) {
    const percent = Math.round(bestMatch.similarity * 100);

    // High similarity (>90%) + matching author/year -> Likely duplicate
    if (bestMatch.similarity >= 0.90) {
      return {
        isDuplicate: true,
        confidence: bestMatch.hasMatchingAuthorOrYear ? "likely" : "possible",
        similarityPercent: percent,
        existingItem: bestMatch.item,
        reason: bestMatch.hasMatchingAuthorOrYear
          ? "High title similarity with matching author or publication year"
          : "Very high title similarity",
      };
    }

    // Moderate similarity (75% - 89%) -> Possible duplicate
    if (bestMatch.similarity >= 0.75) {
      return {
        isDuplicate: true,
        confidence: "possible",
        similarityPercent: percent,
        existingItem: bestMatch.item,
        reason: "Moderate title similarity",
      };
    }
  }

  return { isDuplicate: false };
}
