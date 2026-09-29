/**
 * Proposal generation — turns an OutputTypeSpec into concrete, editable
 * defaults, per docs/01-product/14-OUTPUT-TYPE-CATALOG.md §2.1 and
 * docs/01-product/10-PRD.md REQ-OUT-6/7: "The system should propose values
 * for structure, word count, ... Where the user does not know an answer,
 * the system should offer a defensible default with its rationale, not an
 * empty field."
 */

import type { FieldProposal, OutputTypeSpec, SectionSpec } from "./types";

export interface StructureProposal {
  sectionKey: string;
  title: string;
  wordBudget: number;
  required: boolean;
}

/**
 * Propose a per-section word budget from the type's total budget and
 * distribution map. Sections absent from `distribution` (e.g. front matter
 * that doesn't count toward the word count) get 0. This is the calculation
 * behind "the initial budget proposal at G3" (docs 14 §2.1).
 */
export function proposeStructure(spec: OutputTypeSpec): StructureProposal[] {
  const total = spec.budget.totalWords.typical ?? spec.budget.totalWords.max;
  const flatten = (sections: SectionSpec[], seen = new Set<string>()): SectionSpec[] =>
    sections.flatMap((s) => {
      if (seen.has(s.key)) return [];
      seen.add(s.key);
      return [s, ...(s.children ? flatten(s.children, seen) : [])];
    });

  return flatten(spec.structure.sections).map((section) => {
    const fraction = spec.budget.distribution[section.key];
    const budgetFromDistribution = fraction !== undefined ? Math.round(total * fraction) : undefined;
    const budgetFromSpec = section.wordBudget?.typical ?? section.wordBudget?.max;
    return {
      sectionKey: section.key,
      title: section.title,
      wordBudget: budgetFromDistribution ?? budgetFromSpec ?? 0,
      required: section.required,
    };
  });
}

/** Every field across all three tiers, in review-priority order (required first). */
export function allIntakeFields(spec: OutputTypeSpec) {
  return [...spec.intakeSchema.required, ...spec.intakeSchema.recommended, ...spec.intakeSchema.optional];
}

/**
 * Propose a value for every intake field that has a defaultValue, so no
 * required field is ever presented empty (REQ-OUT-7). Fields without a
 * defaultValue (a genuine "we can't guess this" case, e.g. a research
 * question) are proposed with allowsProvisional guidance text instead of a
 * value — the caller (an intake UI) renders that as "I'm not sure yet."
 */
export function proposeIntakeValues(spec: OutputTypeSpec): FieldProposal[] {
  return allIntakeFields(spec)
    .filter((f) => f.defaultValue !== undefined)
    .map((f) => ({
      key: f.key,
      value: f.defaultValue as string,
      rationale: f.guidance.defaultWithRationale,
    }));
}

/** The citation style to propose — the spec's default unless the caller supplies an institution override. */
export function proposeCitationStyle(spec: OutputTypeSpec, institutionDefault?: string): string {
  return institutionDefault ?? spec.citation.defaultStyle;
}

/** Total word budget as a single number for display, preferring "typical" over the midpoint of the range. */
export function proposeTotalWordBudget(spec: OutputTypeSpec): number {
  return spec.budget.totalWords.typical ?? Math.round((spec.budget.totalWords.min + spec.budget.totalWords.max) / 2);
}

/**
 * Whether the intake can proceed to G1 given the answers so far: every
 * required field must have either an answer or an explicit provisional
 * marker (docs 30 §3 G0: "Deferral is permitted... becomes a blocking item
 * at G3 instead").
 */
export function canProceedFromIntake(
  spec: OutputTypeSpec,
  answers: Record<string, string | "provisional">
): { canProceed: boolean; missing: string[] } {
  const missing = spec.intakeSchema.required
    .filter((f) => {
      const answer = answers[f.key];
      if (answer === undefined) return true;
      if (answer === "provisional") return !f.allowsProvisional;
      return false;
    })
    .map((f) => f.key);
  return { canProceed: missing.length === 0, missing };
}
