/**
 * Atlas — the Output Type Catalog schema.
 *
 * Spec: docs/01-product/14-OUTPUT-TYPE-CATALOG.md §2.
 * "Every catalog entry conforms to this shape. Field semantics are
 * normative." This file is the TypeScript encoding of that YAML shape.
 */

import type {
  AcademicLevel,
  ComplianceProfile,
  OutputFamily,
  StructureVariant,
  WorkflowVariant,
} from "../../domain/project/types";

export interface WordRange {
  min: number;
  max: number;
  typical?: number;
}

export interface SectionSpec {
  key: string;
  title: string;
  required: boolean;
  countsTowardWordcount: boolean;
  guidance: string;
  wordBudget?: WordRange;
  /** Nested sections — chapters containing sections, for chapter_based types. */
  children?: SectionSpec[];
}

export interface StructureSpec {
  variant: StructureVariant;
  sections: SectionSpec[];
  frontMatter: string[];
  backMatter: string[];
}

export interface BudgetSpec {
  totalWords: WordRange;
  /** Fraction of total budget per top-level section key. Advisory (§2.1). */
  distribution: Record<string, number>;
}

export interface SourceExpectation {
  targetCount: { min: number; typical: number };
  recencyExpectation: string;
  typeMix: Record<string, number>;
}

export interface CitationSpec {
  defaultStyle: string;
  commonStyles: string[];
}

/** Intake field tier — drives UI treatment per docs 14 §5. */
export type IntakeTier = "required" | "recommended" | "optional";

export interface IntakeField {
  key: string;
  label: string;
  tier: IntakeTier;
  /** The four-part guidance contract (docs 14 §5.2) — all four are mandatory. */
  guidance: {
    whatItIs: string;
    whyItMatters: string;
    example: string;
    defaultWithRationale: string;
  };
  /** A concrete default value the UI can pre-fill, honouring "never an empty required field." */
  defaultValue?: string;
  /** Whether "I'm not sure yet" is an accepted provisional answer (docs 14 §5.2's Amara case). */
  allowsProvisional: boolean;
}

export type QualityGateSeverity = "blocking" | "required" | "advisory";

export interface QualityGateSpec {
  id: string;
  description: string;
  severity: QualityGateSeverity;
  /** Which academic levels / empirical status this gate applies to; undefined = all. */
  appliesWhen?: string;
  /**
   * The `CanonicalDocument.metadata` key this gate checks for presence, if
   * it maps to exactly one declaration (e.g. a single "declaration of
   * originality" statement). Optional: many quality gates describe a
   * compound or content-level check (e.g. "all required declarations
   * present" spanning several distinct declarations, or a structural/word-
   * count check) that a single metadata key can't represent — those are
   * left unset and remain uncompiled rather than force a false 1:1 mapping.
   * When set, `app/rubric/fromAtlas.ts`'s `compileMetadataGateRules`
   * compiles this into a `metadata_presence` Rule at the gate's own
   * severity.
   */
  metadataKey?: string;
  /**
   * True when this gate is a "no unsupported claims" check — e.g. OT-08's
   * contribution-claims gate, OT-20's every-claim-sourced gate, OT-22's
   * claims-traceable gate. When set, `app/rubric/fromAtlas.ts`'s
   * `compileClaimSupportGateRules` compiles this into a `claim_support`
   * Rule at the gate's own severity, checking the project's
   * `domain/claim` `ClaimEvidenceGraph` rather than document content.
   */
  usesClaimGraph?: boolean;
}

export interface ExportDefaults {
  format: "docx" | "odt" | "pdf";
  includeToc: boolean;
}

export interface OutputTypeSpec {
  id: string;
  version: number;
  label: string;
  aliases: string[];
  family: OutputFamily;
  academicLevels: AcademicLevel[];
  typicalDisciplines: string[];

  structure: StructureSpec;
  budget: BudgetSpec;
  sources: SourceExpectation;
  citation: CitationSpec;

  intakeSchema: {
    required: IntakeField[];
    recommended: IntakeField[];
    optional: IntakeField[];
  };

  qualityGates: QualityGateSpec[];
  workflowVariant: WorkflowVariant;
  complianceProfile: ComplianceProfile;
  exportDefaults: ExportDefaults;
}

/** A proposed value for an intake field, with the rationale the UI must show (docs 14 §5.2). */
export interface FieldProposal {
  key: string;
  value: string;
  rationale: string;
}
