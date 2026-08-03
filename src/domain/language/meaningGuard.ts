/**
 * Meaning verification — stage 4 of the Studio pipeline.
 *
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §3 stage 4,
 * §7 (the "suggest" → "demonstrate" worked example), and
 * docs/05-delivery/53-RISK-REGISTER.md RISK-08.
 *
 * SCOPE, STATED HONESTLY. Full semantic equivalence checking is a model-scale
 * problem. What is implemented here is a deterministic, curated detector for
 * the single most consequential and well-defined failure mode: a change that
 * shifts a claim's epistemic strength (hedged → asserted, or the reverse),
 * introduces/removes a negation, or alters a stated number. It is not a
 * complete meaning-change detector, and is not claimed to be one — app/studio
 * additionally asks the model itself to flag meaning changes when it
 * performs the refinement (the prompt includes an explicit instruction to
 * self-report), and this module is the second, independent, deterministic
 * check that runs regardless of whether the model complied. Recall on the
 * curated categories below is what §7's example depends on; the golden-set
 * obligation in docs/05-delivery/52-TESTING-STRATEGY.md §4.5 is exactly
 * "grow this list from real failures."
 */

import type { DiffChange } from "./types";

/** Words ordered from weakest to strongest claim of certainty within each family. */
const STRENGTH_FAMILIES: string[][] = [
  ["may", "might", "could", "suggests", "suggest", "suggested", "indicates", "indicate", "indicated", "implies", "imply", "implied"],
  ["appears to", "seems to", "tends to"],
  ["shows", "show", "showed", "demonstrates", "demonstrate", "demonstrated", "proves", "prove", "proved", "confirms", "confirm", "confirmed", "establishes", "establish", "established"],
];

// index within STRENGTH_FAMILIES: 0 = weakest tier, 2 = strongest tier.
const STRENGTH_TIER: Map<string, number> = new Map();
STRENGTH_FAMILIES.forEach((family, tier) => {
  for (const word of family) STRENGTH_TIER.set(word, tier);
});

const NEGATIONS = ["not", "no", "never", "cannot", "can't", "doesn't", "did not", "didn't", "isn't", "wasn't"];

function tierOf(text: string): number | undefined {
  const normalized = text.trim().toLowerCase();
  return STRENGTH_TIER.get(normalized);
}

function containsNegation(text: string): boolean {
  const normalized = ` ${text.toLowerCase()} `;
  return NEGATIONS.some((n) => normalized.includes(` ${n} `));
}

function extractNumbers(text: string): string[] {
  return text.match(/\b\d+(\.\d+)?%?\b/g) ?? [];
}

/**
 * Inspect a single diff hunk and, if it crosses a meaning boundary,
 * return the reclassification: category "content" plus a specific note.
 * Returns undefined when the hunk is a pure language change.
 */
export function detectMeaningShift(change: DiffChange): { meaningNote: string } | undefined {
  const originalTier = tierOf(change.originalText);
  const replacementTier = tierOf(change.replacementText);
  if (originalTier !== undefined && replacementTier !== undefined && originalTier !== replacementTier) {
    const direction = replacementTier > originalTier ? "strengthens" : "weakens";
    return {
      meaningNote: `This ${direction} the claim: "${change.originalText.trim()}" → "${change.replacementText.trim()}".`,
    };
  }

  const originalNeg = containsNegation(change.originalText);
  const replacementNeg = containsNegation(change.replacementText);
  if (originalNeg !== replacementNeg) {
    return {
      meaningNote: originalNeg
        ? "This removes a negation, reversing what the sentence claims."
        : "This adds a negation, reversing what the sentence claims.",
    };
  }

  const originalNums = extractNumbers(change.originalText);
  const replacementNums = extractNumbers(change.replacementText);
  if (originalNums.length > 0 || replacementNums.length > 0) {
    const changed =
      originalNums.length !== replacementNums.length ||
      originalNums.some((n, i) => n !== replacementNums[i]);
    if (changed) {
      return {
        meaningNote: `This changes a number: "${originalNums.join(", ") || "(none)"}" → "${replacementNums.join(", ") || "(none)"}". Verify against your source before accepting.`,
      };
    }
  }

  return undefined;
}

/**
 * Apply meaning verification to a full diff. Returns a new array with any
 * shifted hunks reclassified as "content" and given a meaningNote, sorted so
 * content changes come first — per docs §7, "meaning changes are always
 * separated and always first."
 */
export function applyMeaningGuard(changes: DiffChange[]): DiffChange[] {
  const reclassified = changes.map((c) => {
    const shift = detectMeaningShift(c);
    if (!shift) return c;
    return { ...c, category: "content" as const, meaningNote: shift.meaningNote };
  });
  return [...reclassified].sort((a, b) => {
    if (a.category === b.category) return 0;
    return a.category === "content" ? -1 : 1;
  });
}
