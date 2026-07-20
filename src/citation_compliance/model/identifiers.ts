/**
 * Identifier validation request/response types (Phase 6C, deterministic only)
 */

export type IdentifierField = "doi" | "orcid" | "isbn" | "issn" | "url";
export type IdentifierSeverity = "error" | "warning";

export interface IdentifierIssue {
  field: IdentifierField;
  severity: IdentifierSeverity;
  message: string;
  suggestedFix?: string;

  /** Deterministic code for machine consumers */
  code?: string;
}

export interface IdentifierValidationResult {
  ok: true;
  issues: IdentifierIssue[];
  validated: {
    [K in IdentifierField]?: boolean;
  };
}

export interface IdentifierValidationFailure {
  ok: false;
  issues: IdentifierIssue[];
}

export type IdentifierValidationOutcome = IdentifierValidationResult | IdentifierValidationFailure;
