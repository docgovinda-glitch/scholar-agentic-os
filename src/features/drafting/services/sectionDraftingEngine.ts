/**
 * Section Drafting Engine
 * -----------------------
 * Dynamic, topic-grounded collegiate academic drafting engine.
 * Strictly enforces official college writing standards:
 * - Active voice (≥80%) and strong analytical verbs
 * - Anti-thesaurus clarity over convoluted academic jargon
 * - Elimination of throat-clearing fluff and canned buzzwords
 * - Calibrated tone adaptation across 5 distinct collegiate styles
 * - Strict section uniqueness (<20% overlap) and automated quality evaluation
 */


export interface UniquenessValidationResult {
  isUnique: boolean;
  maxSimilarity: number;
  conflictingPair?: [string, string];
}

/**
 * Normalizes a sentence for similarity comparison.
 */
function normalizeSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Validates that no two sections in a document share more than 20% identical sentences.
 */
export function validateSectionUniqueness(
  sections: Array<{ id?: string; title: string; content: string }>
): UniquenessValidationResult {
  if (!sections || sections.length < 2) {
    return { isUnique: true, maxSimilarity: 0 };
  }

  let maxSimilarity = 0;
  let conflictingPair: [string, string] | undefined;

  for (let i = 0; i < sections.length; i++) {
    const s1Sentences = sections[i].content
      .split(/(?<=[.?!])\s+/)
      .map(normalizeSentence)
      .filter((s) => s.length > 20);

    if (s1Sentences.length === 0) continue;
    const s1Set = new Set(s1Sentences);

    for (let j = i + 1; j < sections.length; j++) {
      const s2Sentences = sections[j].content
        .split(/(?<=[.?!])\s+/)
        .map(normalizeSentence)
        .filter((s) => s.length > 20);

      if (s2Sentences.length === 0) continue;

      let shared = 0;
      for (const sent of s2Sentences) {
        if (s1Set.has(sent)) {
          shared++;
        }
      }

      const similarity = shared / Math.min(s1Sentences.length, s2Sentences.length);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }

      if (similarity > 0.2) {
        conflictingPair = [sections[i].title, sections[j].title];
        return {
          isUnique: false,
          maxSimilarity: Math.round(maxSimilarity * 100) / 100,
          conflictingPair,
        };
      }
    }
  }

  return {
    isUnique: true,
    maxSimilarity: Math.round(maxSimilarity * 100) / 100,
  };
}
