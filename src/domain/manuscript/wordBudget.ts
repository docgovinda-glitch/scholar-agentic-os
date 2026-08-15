/**
 * Allocates a per-section word target across a manuscript's body sections —
 * the sections the long-form generation engine (app/manuscript/generate.ts)
 * is actually responsible for drafting.
 *
 * Duck-typed against Atlas's SectionSpec/BudgetSpec shape (src/app/atlas/
 * types.ts) rather than importing those types directly, so this stays a
 * dependency-free domain/* module — the catalog itself already carries real
 * word-budget data per output type (every SectionSpec's
 * countsTowardWordcount flag and optional own wordBudget, every
 * BudgetSpec's totalWords range and per-section distribution fractions),
 * this module is just the first thing to actually read it.
 *
 * Sections with countsTowardWordcount: false (title, declarations,
 * references for OT-10) are excluded outright: they are boilerplate,
 * derived, or the citation engine's job, not free-form generated prose
 * sharing a body-text word budget. A countsTowardWordcount section that
 * ALSO carries its own explicit wordBudget (an abstract, for a type where
 * it counts) uses that fixed target directly rather than the proportional
 * distribution.
 */

import type { SectionPlan } from "./types";

export interface WordBudgetSection {
  key: string;
  title: string;
  guidance: string;
  countsTowardWordcount: boolean;
  wordBudget?: { min: number; max: number; typical?: number };
}

export interface WordBudgetSpec {
  totalWords: { min: number; max: number; typical?: number };
  /** Fraction of total budget per section key — advisory, need not sum to 1 (docs 14 §2.1). */
  distribution: Record<string, number>;
}

function midpoint(range: { min: number; max: number; typical?: number }): number {
  return range.typical ?? Math.round((range.min + range.max) / 2);
}

/**
 * `overrideTotal` is a venue-specific word limit (JournalRequirements.
 * wordLimit.max) taking precedence over the catalog's own typical total —
 * the venue's stated limit is a real fact about this submission, the
 * catalog's number is a generic fallback for when nothing more specific is
 * known yet.
 */
export function allocateWordBudget(sections: WordBudgetSection[], budget: WordBudgetSpec, overrideTotal?: number): SectionPlan[] {
  const total = overrideTotal ?? midpoint(budget.totalWords);
  const bodySections = sections.filter((s) => s.countsTowardWordcount);

  const fixed = bodySections.filter((s) => s.wordBudget);
  const distributed = bodySections.filter((s) => !s.wordBudget);

  const fixedTotal = fixed.reduce((sum, s) => sum + midpoint(s.wordBudget!), 0);
  const remainingTotal = Math.max(0, total - fixedTotal);

  const explicitlyCovered = distributed.filter((s) => budget.distribution[s.key] !== undefined);
  const uncovered = distributed.filter((s) => budget.distribution[s.key] === undefined);
  const explicitFraction = explicitlyCovered.reduce((sum, s) => sum + budget.distribution[s.key], 0);
  const remainingFraction = Math.max(0, 1 - explicitFraction);
  const perUncoveredFraction = uncovered.length > 0 ? remainingFraction / uncovered.length : 0;

  const MIN_SECTION_WORDS = 50;

  return bodySections.map((s) => {
    if (s.wordBudget) {
      return { key: s.key, title: s.title, guidance: s.guidance, targetWords: midpoint(s.wordBudget) };
    }
    const fraction = budget.distribution[s.key] ?? perUncoveredFraction;
    return { key: s.key, title: s.title, guidance: s.guidance, targetWords: Math.max(MIN_SECTION_WORDS, Math.round(remainingTotal * fraction)) };
  });
}
