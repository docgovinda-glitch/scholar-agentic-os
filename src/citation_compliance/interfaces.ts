/**
 * Citation & Academic Compliance Engine interfaces (Phase 6C, deterministic only)
 */

import type { CanonicalReference } from "./model/reference";
import type { ComplianceReport } from "./model/compliance";
import type { IdentifierValidationOutcome } from "./model/identifiers";

/** Deterministic citation formatting (in-text + bibliography) */
export interface CitationFormattingEngine {
  formatInText(params: CitationInTextParams): string;
  formatReference(params: CitationReferenceParams): string;
}

/** Deterministic bibliography generation */
export interface BibliographyGenerator {
  generateReferenceList(params: BibliographyParams): string[];
}

/** Deterministic identifier validation */
export interface IdentifierValidator {
  validate(params: IdentifierValidationParams): IdentifierValidationOutcome;
}

/** Deterministic manuscript compliance validation */
export interface ManuscriptComplianceValidator {
  validate(params: ManuscriptValidationParams): ComplianceReport;
}

/** Journal requirement pack (extensible without core modifications) */
export interface JournalRequirementPack {
  journalId: string;
  name: string;

  /** Which citation style to enforce (maps to formatter style registry) */
  citationStyle: string;

  /** Word count constraints as a deterministic string/rule (engine may parse later) */
  wordCountGoal?: string;

  /** Required manuscript sections by key */
  requiredSections: string[];

  /** Rule flags for deterministic checklist checks */
  rules: {
    abstractRequired: boolean;
    keywordsRequired: boolean;

    figuresRequired: boolean; // figure numbering + captions present
    tablesRequired: boolean; // table numbering + captions present

    acknowledgementsRequired: boolean;
    fundingRequired: boolean;
    conflictOfInterestRequired: boolean;
    ethicsRequired: boolean;
    dataAvailabilityRequired: boolean;
  };

  /** Submission checklist items (deterministic) */
  submissionChecklist: string[];
}

/** ===========================
 * Parameter types
 * =========================== */

export interface CitationInTextParams {
  /** Style label, e.g. "APA 7", "IEEE", etc */
  style: string;

  /** Canonical reference to cite */
  reference: CanonicalReference;

  /** Optional page/locator for certain styles */
  locator?: string;

  /** Optional citation key/label */
  citationKey?: string;

  /** If numeric renumbering exists, this could be the index/label */
  citationIndex?: number;
}

export interface CitationReferenceParams {
  style: string;
  reference: CanonicalReference;
}

export interface BibliographyParams {
  style: string;
  references: CanonicalReference[];
}

/** Identifier validation input */
export interface IdentifierValidationParams {
  field: "doi" | "orcid" | "isbn" | "issn" | "url";
  value?: string | null;
}

/** Manuscript validation input model (deterministic) */
export interface ManuscriptValidationParams {
  journalPack: JournalRequirementPack;

  /** Manuscript text/structure extracted deterministically */
  manuscript: {
    wordCount?: number;
    abstract?: string;
    keywords?: string[];
    figures?: Array<{ number: string; caption?: string }>;
    tables?: Array<{ number: string; caption?: string }>;

    acknowledgements?: string;
    funding?: string;
    conflictOfInterest?: string;
    ethics?: string;
    dataAvailability?: string;

    /** Ordered section map (for required-section checks) */
    sections?: Record<string, string>;
  };

  /** Canonical normalized references (no AI generation) */
  references?: CanonicalReference[];

  /** Citations as indices/keys referencing canonical references */
  citations?: Array<{
    referenceIndex: number; // index into `references`
    citationText?: string; // optional raw citation string if available
    locator?: string;
  }>;
}
