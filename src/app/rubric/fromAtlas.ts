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
 *
 * Two more rule sources live here too, both compiling `QualityGateSpec`
 * flags rather than structure or budget:
 *
 * `compileMetadataGateRules` compiles gates that name a `metadataKey` into
 * `metadata_presence` rules — a structured fact that isn't rendered as
 * document content (OT-06's ethics approval status is the first real
 * example; most "declarations" this catalog specifies are document
 * *sections* instead, already covered by `compileStructuralRules`, and
 * forcing a redundant `metadataKey` mapping onto the same requirement
 * would be worse than leaving it uncompiled).
 *
 * `compileClaimSupportGateRules` compiles gates that set `usesClaimGraph`
 * into `claim_support` rules, checking a `domain/claim` `ClaimEvidenceGraph`
 * for unsupported claims rather than checking document content at all —
 * OT-08's contribution-claims gate, OT-20's every-claim-sourced gate, and
 * OT-22's claims-traceable gate all compile through this path.
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

/**
 * Compile one metadata-presence rule per quality gate that names a
 * `metadataKey` (docs/01-product/14-OUTPUT-TYPE-CATALOG.md §6 quality
 * gates; `QualityGateSpec.metadataKey`'s own doc comment explains why most
 * gates don't set it).
 */
export function compileMetadataGateRules(spec: OutputTypeSpec): Rule[] {
  return spec.qualityGates
    .filter((gate) => gate.metadataKey !== undefined)
    .map((gate) => ({
      id: `${spec.id}-metadata-${gate.metadataKey}`,
      source: {
        document: `Atlas catalog entry ${spec.id} v${spec.version}`,
        locator: `qualityGates[id=${gate.id}]`,
        quote: gate.description,
        extractedAt: NOW(),
        confidence: 1.0,
      },
      type: "metadata" as const,
      scope: "metadata" as const,
      severity: gate.severity,
      evaluator: { kind: "metadata_presence" as const, params: { key: gate.metadataKey as string } },
      message: gate.description,
      remedy: `Provide "${gate.metadataKey}".`,
      autoFixable: false,
      userModified: false,
    }));
}

/**
 * Compile one claim-support rule per quality gate that sets
 * `usesClaimGraph` (`QualityGateSpec.usesClaimGraph`'s own doc comment).
 * Unscoped: checks the project's whole `ClaimEvidenceGraph` for any claim
 * with zero evidence bindings, same as `domain/claim`'s own
 * `unsupportedClaims()`. Scoping to a claim subset (e.g. only claims within
 * a specific section) is a real future refinement, not modeled here.
 */
export function compileClaimSupportGateRules(spec: OutputTypeSpec): Rule[] {
  return spec.qualityGates
    .filter((gate) => gate.usesClaimGraph === true)
    .map((gate) => ({
      id: `${spec.id}-claims-${gate.id}`,
      source: {
        document: `Atlas catalog entry ${spec.id} v${spec.version}`,
        locator: `qualityGates[id=${gate.id}]`,
        quote: gate.description,
        extractedAt: NOW(),
        confidence: 1.0,
      },
      type: "content" as const,
      scope: "claims" as const,
      severity: gate.severity,
      evaluator: { kind: "claim_support" as const, params: {} },
      message: gate.description,
      remedy: "Bind evidence to every claim, or remove claims that can't be supported.",
      autoFixable: false,
      userModified: false,
    }));
}

/** Compile every deterministic rule this module knows how to derive from an Atlas spec. */
export function compileRubricFromOutputType(spec: OutputTypeSpec): Rule[] {
  return [
    compileWordLimitRule(spec),
    ...compileStructuralRules(spec),
    ...compileMetadataGateRules(spec),
    ...compileClaimSupportGateRules(spec),
  ];
}
