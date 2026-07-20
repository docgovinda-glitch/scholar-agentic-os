/**
 * Identifier models for Citation & Academic Compliance
 *
 * Each identifier type has its own validation rules and normalization logic.
 */

import type { IdentifierValidationOutcome } from "./identifiers";

// ============================================================================
// Identifier Types
// ============================================================================

/**
 * DOI identifier with validation and normalization.
 */
export interface DOI {
  raw: string;
  normalized: string; // https://doi.org/10.xxx/yyy
  isValid: boolean;
  registryId?: string;
}

/**
 * ORCID identifier (16-digit format with or without dashes).
 */
export interface ORCID {
  raw: string;
  normalized: string; // https://orcid.org/0000-0000-0000-0000
  isValid: boolean;
  name?: string;
}

/**
 * ISBN (10 or 13 digit).
 */
export interface ISBN {
  raw: string;
  normalized: string;
  isValid: boolean;
  type: "ISBN-10" | "ISBN-13";
}

/**
 * ISSN (8-digit with hyphen).
 */
export interface ISSN {
  raw: string;
  normalized: string;
  isValid: boolean;
}

/**
 * PMID (PubMed ID - numeric).
 */
export interface PMID {
  raw: string;
  normalized: string;
  isValid: boolean;
}

/**
 * PMCID (PubMed Central ID - PMC###### format).
 */
export interface PMCID {
  raw: string;
  normalized: string;
  isValid: boolean;
}

/**
 * arXiv identifier (YYMM.NNNNN or category/YYMM.NNNNN format).
 */
export interface ArXivId {
  raw: string;
  normalized: string;
  isValid: boolean;
  primaryClass?: string;
}

// ============================================================================
// Identifier Validators
// ============================================================================

/**
 * DOI validation result.
 */
export type DOIValidation = IdentifierValidationOutcome & {
  value?: DOI;
};

/**
 * ORCID validation result.
 */
export type ORCIDValidation = IdentifierValidationOutcome & {
  value?: ORCID;
};

/**
 * ISBN validation result.
 */
export type ISBNValidation = IdentifierValidationOutcome & {
  value?: ISBN;
};

/**
 * ISSN validation result.
 */
export type ISSNValidation = IdentifierValidationOutcome & {
  value?: ISSN;
};

/**
 * PMID validation result.
 */
export type PMIDValidation = IdentifierValidationOutcome & {
  value?: PMID;
};

/**
 * PMCID validation result.
 */
export type PMCIDValidation = IdentifierValidationOutcome & {
  value?: PMCID;
};

/**
 * arXiv validation result.
 */
export type ArXivValidation = IdentifierValidationOutcome & {
  value?: ArXivId;
};