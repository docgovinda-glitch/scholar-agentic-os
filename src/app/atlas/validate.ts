/**
 * Catalog validation — the architectural rules from
 * docs/01-product/14-OUTPUT-TYPE-CATALOG.md that every entry must satisfy.
 * Run over the whole catalog in __tests__/catalogData.test.ts so a
 * malformed entry fails the build rather than reaching a user.
 */

import type { IntakeField, OutputTypeSpec } from "./types";

export interface ValidationIssue {
  outputTypeId: string;
  field?: string;
  message: string;
}

function validateField(outputTypeId: string, field: IntakeField): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const g = field.guidance;
  // "Every field MUST supply four things" — docs 14 §5.2.
  if (!g.whatItIs.trim()) issues.push(bad(outputTypeId, field.key, "missing 'what it is'"));
  if (!g.whyItMatters.trim()) issues.push(bad(outputTypeId, field.key, "missing 'why it matters'"));
  if (!g.example.trim()) issues.push(bad(outputTypeId, field.key, "missing an example"));
  if (!g.defaultWithRationale.trim()) issues.push(bad(outputTypeId, field.key, "missing default rationale"));

  // "never an empty required field" (docs 14 §5.2 / REQ-OUT-7) means never
  // presented with no guidance — the four checks above enforce that. It
  // does NOT mean every required field must have a pre-fillable value or a
  // provisional escape hatch: some fields (OT-16's funder and call
  // document, per docs 14 §9) are legitimately required with no safe
  // default and no safe provisional path, and correctly block progress
  // until answered. `defaultWithRationale` is exactly where that "why
  // there's no default" explanation belongs, and it is already required
  // and non-empty by the check above.

  return issues;
}

function bad(outputTypeId: string, field: string | undefined, message: string): ValidationIssue {
  return { outputTypeId, field, message };
}

export function validateOutputType(spec: OutputTypeSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const tier of ["required", "recommended", "optional"] as const) {
    for (const field of spec.intakeSchema[tier]) {
      if (field.tier !== tier) {
        issues.push(bad(spec.id, field.key, `listed under intakeSchema.${tier} but field.tier is "${field.tier}"`));
      }
      issues.push(...validateField(spec.id, field));
    }
  }

  // Budget distribution should not wildly exceed 1.0 (some slack is fine —
  // it is advisory per §2.1 — but a distribution summing to, say, 3.0 is a
  // data-entry bug, not a legitimate advisory looseness).
  const distributionSum = Object.values(spec.budget.distribution).reduce((a, b) => a + b, 0);
  if (distributionSum > 1.2) {
    issues.push(bad(spec.id, undefined, `budget distribution sums to ${distributionSum.toFixed(2)}, expected ~1.0`));
  }

  // Every required structural section needs guidance text.
  for (const section of spec.structure.sections) {
    if (!section.guidance.trim()) {
      issues.push(bad(spec.id, section.key, "structural section has no guidance text"));
    }
  }

  if (spec.structure.sections.length === 0) {
    issues.push(bad(spec.id, undefined, "structure has no sections"));
  }

  return issues;
}

export function validateCatalog(specs: OutputTypeSpec[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  for (const spec of specs) {
    if (seenIds.has(spec.id)) {
      issues.push(bad(spec.id, undefined, "duplicate output type id in the catalog"));
    }
    seenIds.add(spec.id);
    issues.push(...validateOutputType(spec));
  }
  return issues;
}
