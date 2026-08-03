/**
 * Compile an Atlas OutputTypeSpec's known structure into Rubric rules.
 *
 * Spec: docs/03-workflow/31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md §4.1:
 * "The template path... a department's Word template contains its
 * formatting rules in machine-readable form. Extracting them requires no
 * model and produces no ambiguity." An Atlas catalog entry is the same kind
 * of high-precision source for the two things it fully specifies: the total
 * word budget and which sections are required. Unlike requirement-source
 * PDF extraction (docs 31 §4, not yet built — that needs a model call),
 * this compilation is deterministic and total.
 */

import type { OutputTypeSpec } from "../atlas/types";
import type { Rule } from "../../domain/compliance/types";

const NOW = () => new Date().toISOString();

/**
 * Compile a document-scope word-limit rule from the type's budget. Sections
 * marked `countsTowardWordcount: false` (front/back matter, typically) are
 * excluded, matching docs 14 §2.1's note on this field.
 */
export function compileWordLimitRule(spec: OutputTypeSpec): Rule {
  const excluded = spec.structure.sections.filter((s) => !s.countsTowardWordcount).map((s) => s.key);
  return {
    id: `${spec.id}-word-limit`,
    source: {
      document: `Atlas catalog entry ${spec.id} v${spec.version}`,
      locator: "budget.totalWords",
      quote: `Typical range ${spec.budget.totalWords.min}–${spec.budget.totalWords.max} words`,
      extractedAt: NOW(),
      confidence: 1.0,
    },
    type: "quantitative",
    scope: "document",
    severity: "required",
    evaluator: {
      kind: "word_count",
      params: { min: spec.budget.totalWords.min, max: spec.budget.totalWords.max, exclude: excluded },
    },
    message: `${spec.label} is typically ${spec.budget.totalWords.min}–${spec.budget.totalWords.max} words.`,
    remedy: "Adjust length to fit the typical range, or confirm your specific limit differs.",
    autoFixable: false,
    userModified: false,
  };
}

/** Compile one structural-presence rule per required section. */
export function compileStructuralRules(spec: OutputTypeSpec): Rule[] {
  const flatten = (sections: OutputTypeSpec["structure"]["sections"]): OutputTypeSpec["structure"]["sections"] =>
    sections.flatMap((s) => [s, ...(s.children ?? [])]);

  return flatten(spec.structure.sections)
    .filter((s) => s.required)
    .map((section) => ({
      id: `${spec.id}-section-${section.key}`,
      source: {
        document: `Atlas catalog entry ${spec.id} v${spec.version}`,
        locator: `structure.sections[key=${section.key}]`,
        quote: section.guidance,
        extractedAt: NOW(),
        confidence: 1.0,
      },
      type: "structural" as const,
      scope: "section" as const,
      severity: "blocking" as const,
      evaluator: { kind: "structural_presence" as const, params: { sectionKey: section.key } },
      message: `"${section.title}" is a required section for ${spec.label}.`,
      remedy: `Add and complete the "${section.title}" section.`,
      autoFixable: false,
      userModified: false,
    }));
}

/** Compile every deterministic rule this module knows how to derive from an Atlas spec. */
export function compileRubricFromOutputType(spec: OutputTypeSpec): Rule[] {
  return [compileWordLimitRule(spec), ...compileStructuralRules(spec)];
}
