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
 *
 * `compileReadabilityGateRules` compiles gates that set `readabilityGate`
 * into `readability` rules, checking Flesch-Kincaid grade level and/or
 * jargon density — OT-17's participant-information-sheet gate and OT-20's
 * two readability gates are the first real examples.
 *
 * `compilePositionInTextGateRules` compiles gates that set
 * `positionInTextGate` into `position_in_text` rules — OT-20's
 * recommendation-in-first-200-words gate is the first real example.
 *
 * Three more compile functions read `JournalRequirements` (docs
 * 30-ACADEMIC-WORKFLOW-ARCHITECTURE.md G1, `domain/journal/types.ts`) in
 * addition to the catalog spec — the venue-specific values no Atlas entry
 * alone can supply, first wired for OT-10's three previously-uncompiled
 * gates:
 *
 * `compileSectionWordLimitGateRules` compiles gates that set
 * `sectionWordLimitGate` into a `word_count` rule scoped to one section
 * (e.g. OT-10's abstract_limit), reading min/max from that section's own
 * catalog `wordBudget` — no venue input needed, same "catalog is
 * authoritative for structure" precedent as `compileWordLimitRule`.
 *
 * `compileDeclarationsPresentGateRules` compiles gates that set
 * `declarationsPresentGate` into one `metadata_presence` rule per
 * declaration named in `journalRequirements.requiredDeclarations`.
 * Produces zero rules until requirements are captured — never invents
 * which declarations a venue requires.
 *
 * `compileCitationStyleGateRules` compiles gates that set
 * `citationStyleExactGate` into an exact-match `metadata_presence` rule,
 * preferring `journalRequirements.citationStyle` and falling back to the
 * catalog's `citation.defaultStyle` — always produces a rule, same
 * "catalog default until a venue is captured" precedent as
 * `compileWordLimitRule`.
 */

import type { OutputTypeSpec, SectionSpec } from "../atlas/types";
import type { Rule } from "../../domain/compliance/types";
import type { JournalRequirements } from "../../domain/journal/types";

const NOW = () => new Date().toISOString();

function flattenSections(sections: SectionSpec[]): SectionSpec[] {
  return sections.flatMap((s) => [s, ...(s.children ?? [])]);
}

/** `conflict-of-interest` from "Conflict of Interest" — a stable, metadata-key-safe form of a free-text declaration name. */
function slugifyDeclaration(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

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
  return flattenSections(spec.structure.sections)
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

/**
 * Compile one readability rule per quality gate that sets `readabilityGate`
 * (`QualityGateSpec.readabilityGate`'s own doc comment).
 */
export function compileReadabilityGateRules(spec: OutputTypeSpec): Rule[] {
  return spec.qualityGates
    .filter((gate) => gate.readabilityGate !== undefined)
    .map((gate) => ({
      id: `${spec.id}-readability-${gate.id}`,
      source: {
        document: `Atlas catalog entry ${spec.id} v${spec.version}`,
        locator: `qualityGates[id=${gate.id}]`,
        quote: gate.description,
        extractedAt: NOW(),
        confidence: 1.0,
      },
      type: "stylistic" as const,
      scope: gate.readabilityGate!.sectionKey ? ("section" as const) : ("document" as const),
      severity: gate.severity,
      evaluator: {
        kind: "readability" as const,
        params: {
          maxGradeLevel: gate.readabilityGate!.maxGradeLevel,
          maxJargonDensity: gate.readabilityGate!.maxJargonDensity,
          sectionKey: gate.readabilityGate!.sectionKey,
        },
      },
      message: gate.description,
      remedy: "Shorten sentences and prefer shorter, more common words to lower the reading level.",
      autoFixable: false,
      userModified: false,
    }));
}

/**
 * Compile one position-in-text rule per quality gate that sets
 * `positionInTextGate` (`QualityGateSpec.positionInTextGate`'s own doc
 * comment).
 */
export function compilePositionInTextGateRules(spec: OutputTypeSpec): Rule[] {
  return spec.qualityGates
    .filter((gate) => gate.positionInTextGate !== undefined)
    .map((gate) => ({
      id: `${spec.id}-position-${gate.id}`,
      source: {
        document: `Atlas catalog entry ${spec.id} v${spec.version}`,
        locator: `qualityGates[id=${gate.id}]`,
        quote: gate.description,
        extractedAt: NOW(),
        confidence: 1.0,
      },
      type: "structural" as const,
      scope: gate.positionInTextGate!.sectionKey ? ("section" as const) : ("document" as const),
      severity: gate.severity,
      evaluator: {
        kind: "position_in_text" as const,
        params: {
          keywords: gate.positionInTextGate!.keywords,
          withinWords: gate.positionInTextGate!.withinWords,
          sectionKey: gate.positionInTextGate!.sectionKey,
        },
      },
      message: gate.description,
      remedy: `Move the key point earlier — it should appear within the first ${gate.positionInTextGate!.withinWords} words.`,
      autoFixable: false,
      userModified: false,
    }));
}

/**
 * Compile one section-scoped word-limit rule per quality gate that sets
 * `sectionWordLimitGate` (`QualityGateSpec.sectionWordLimitGate`'s own doc
 * comment). No rule is produced if the referenced section doesn't exist or
 * has no `wordBudget` of its own — matching this file's "leave uncompiled
 * rather than invent a limit" discipline.
 */
export function compileSectionWordLimitGateRules(spec: OutputTypeSpec): Rule[] {
  const sections = flattenSections(spec.structure.sections);
  return spec.qualityGates
    .filter((gate) => gate.sectionWordLimitGate !== undefined)
    .flatMap((gate): Rule[] => {
      const { sectionKey } = gate.sectionWordLimitGate!;
      const section = sections.find((s) => s.key === sectionKey);
      if (!section || !section.wordBudget) return [];
      return [
        {
          id: `${spec.id}-section-word-limit-${gate.id}`,
          source: {
            document: `Atlas catalog entry ${spec.id} v${spec.version}`,
            locator: `structure.sections[key=${sectionKey}].wordBudget`,
            quote: `${section.wordBudget.min}–${section.wordBudget.max} words`,
            extractedAt: NOW(),
            confidence: 1.0,
          },
          type: "quantitative",
          scope: "section",
          severity: gate.severity,
          evaluator: { kind: "word_count", params: { min: section.wordBudget.min, max: section.wordBudget.max, sectionKey } },
          message: gate.description,
          remedy: `Adjust "${section.title}" to ${section.wordBudget.min}–${section.wordBudget.max} words.`,
          autoFixable: false,
          userModified: false,
        },
      ];
    });
}

/**
 * Compile one metadata-presence rule per declaration a quality gate that
 * sets `declarationsPresentGate` requires (`QualityGateSpec.declarationsPresentGate`'s
 * own doc comment). Returns `[]` — never a fabricated requirement — until
 * `journalRequirements` has actually been captured, or if it names zero
 * declarations.
 */
export function compileDeclarationsPresentGateRules(spec: OutputTypeSpec, journalRequirements: JournalRequirements | undefined): Rule[] {
  if (!journalRequirements || journalRequirements.requiredDeclarations.length === 0) return [];

  return spec.qualityGates
    .filter((gate) => gate.declarationsPresentGate === true)
    .flatMap((gate) =>
      journalRequirements.requiredDeclarations.map((declaration) => ({
        id: `${spec.id}-declaration-${gate.id}-${slugifyDeclaration(declaration)}`,
        source: {
          document: `Journal requirements captured for ${journalRequirements.journalName}`,
          locator: "requiredDeclarations",
          quote: declaration,
          extractedAt: journalRequirements.capturedAt,
          confidence: 1.0,
        },
        type: "metadata" as const,
        scope: "metadata" as const,
        severity: gate.severity,
        evaluator: { kind: "metadata_presence" as const, params: { key: `declaration:${slugifyDeclaration(declaration)}` } },
        message: `"${declaration}" is a declaration ${journalRequirements.journalName} requires.`,
        remedy: `Provide the "${declaration}" declaration.`,
        autoFixable: false,
        userModified: false,
      }))
    );
}

/**
 * Compile one exact-match citation-style rule per quality gate that sets
 * `citationStyleExactGate` (`QualityGateSpec.citationStyleExactGate`'s own
 * doc comment). Always produces a rule: `journalRequirements.citationStyle`
 * where captured, otherwise the catalog's own `citation.defaultStyle`.
 */
export function compileCitationStyleGateRules(spec: OutputTypeSpec, journalRequirements: JournalRequirements | undefined): Rule[] {
  return spec.qualityGates
    .filter((gate) => gate.citationStyleExactGate === true)
    .map((gate) => {
      const requiredStyle = journalRequirements?.citationStyle ?? spec.citation.defaultStyle;
      return {
        id: `${spec.id}-citation-style-${gate.id}`,
        source: journalRequirements
          ? {
              document: `Journal requirements captured for ${journalRequirements.journalName}`,
              locator: "citationStyle",
              quote: requiredStyle,
              extractedAt: journalRequirements.capturedAt,
              confidence: 1.0,
            }
          : {
              document: `Atlas catalog entry ${spec.id} v${spec.version}`,
              locator: "citation.defaultStyle",
              quote: requiredStyle,
              extractedAt: NOW(),
              confidence: 1.0,
            },
        type: "bibliographic" as const,
        scope: "metadata" as const,
        severity: gate.severity,
        evaluator: { kind: "metadata_presence" as const, params: { key: "citationStyle", expectedValue: requiredStyle } },
        message: journalRequirements
          ? `References must use ${requiredStyle} style, ${journalRequirements.journalName}'s required style.`
          : `References must use ${requiredStyle} style, ${spec.label}'s default pending a captured venue style.`,
        remedy: `Set the document's citation style metadata to "${requiredStyle}", and format every reference accordingly.`,
        autoFixable: false,
        userModified: false,
      };
    });
}

/**
 * Compile every deterministic rule this module knows how to derive from an
 * Atlas spec. `journalRequirements` is optional — supplying it additionally
 * compiles the venue-specific gates (`compileDeclarationsPresentGateRules`,
 * `compileCitationStyleGateRules`); omitting it compiles everything else
 * exactly as before those gates existed.
 */
export function compileRubricFromOutputType(spec: OutputTypeSpec, journalRequirements?: JournalRequirements): Rule[] {
  return [
    compileWordLimitRule(spec),
    ...compileStructuralRules(spec),
    ...compileMetadataGateRules(spec),
    ...compileClaimSupportGateRules(spec),
    ...compileReadabilityGateRules(spec),
    ...compilePositionInTextGateRules(spec),
    ...compileSectionWordLimitGateRules(spec),
    ...compileDeclarationsPresentGateRules(spec, journalRequirements),
    ...compileCitationStyleGateRules(spec, journalRequirements),
  ];
}
