/**
 * Structured validation outputs for deterministic manuscript compliance (Phase 6C)
 */

export type ComplianceSeverity = "error" | "warning" | "info";

export type ComplianceLocation =
  | { kind: "citation"; index?: number }
  | { kind: "reference"; index?: number }
  | { kind: "manuscript"; section?: string }
  | { kind: "journal"; ruleId?: string };

export interface ComplianceIssue {
  issueCode: string;
  severity: ComplianceSeverity;
  message: string;
  suggestedFix?: string;
  location?: ComplianceLocation;
  /** Machine path to help UI or logs */
  fieldPath?: string;
}

export interface ComplianceStageResult {
  stageId: string;
  stageName: string;
  ok: boolean;
  durationMs?: number;
  issues: ComplianceIssue[];
}

export interface ComplianceReport {
  ok: boolean;

  /** Deterministic summary counts */
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    totalIssues: number;
  };

  /** Stage-by-stage traceability */
  stages: ComplianceStageResult[];

  /** Canonical outputs used by downstream modules */
  normalized?: {
    references?: unknown[];
    citations?: unknown[];
  };

  /** Human-friendly but deterministic message */
  headline: string;
}
