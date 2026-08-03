/**
 * The Rubric's rule and finding model.
 *
 * Spec: docs/03-workflow/31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md §3.
 */

export type RuleType =
  | "structural"
  | "quantitative"
  | "bibliographic"
  | "formatting"
  | "metadata"
  | "stylistic"
  | "ethical"
  | "content";

export type RuleSeverity = "blocking" | "required" | "advisory";
export type RuleScope = "document" | "section" | "element" | "metadata";

export interface RuleSource {
  document: string;
  locator: string;
  quote: string;
  extractedAt: string;
  confidence: number;
}

/** The deterministic evaluator kinds implemented so far (docs 31 §5.1's "immediate/fast" tier). */
export type EvaluatorKind = "word_count" | "structural_presence" | "metadata_presence";

export interface WordCountParams {
  max?: number;
  min?: number;
  /** Section keys to exclude from the count (e.g. references, appendices). */
  exclude?: string[];
}

export interface StructuralPresenceParams {
  sectionKey: string;
  /** A present-but-empty section still fails this check. */
  minWords?: number;
}

/** The `metadata` Rule type (docs 31 §3.1: "Must include a data availability statement") — checks `CanonicalDocument.metadata`, not a block. */
export interface MetadataPresenceParams {
  key: string;
  /** A present-but-blank value still fails this check, same guarantee as structural_presence for sections. */
  minLength?: number;
}

export interface Rule {
  id: string;
  source: RuleSource;
  type: RuleType;
  scope: RuleScope;
  severity: RuleSeverity;
  evaluator:
    | { kind: "word_count"; params: WordCountParams }
    | { kind: "structural_presence"; params: StructuralPresenceParams }
    | { kind: "metadata_presence"; params: MetadataPresenceParams };
  message: string;
  remedy: string;
  autoFixable: boolean;
  userModified: boolean;
  waived?: { reason: string; at: string };
}

export type FindingStatus = "pass" | "warn" | "fail" | "not_applicable";

export interface Finding {
  ruleId: string;
  status: FindingStatus;
  severity: RuleSeverity;
  location?: { sectionKey?: string };
  actual?: string;
  expected?: string;
  message: string;
  remedy?: string;
}

/**
 * A rule with a recorded waiver has its failure downgraded to "warn" —
 * EXCEPT for `blocking` severity, which is never waivable (docs
 * 31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md §3 Rule Severity: "blocking...
 * Waivable: No"). A blocking rule's `waived` field, if somehow set, is
 * therefore inert by design rather than silently honoured — see
 * `app/rubric`'s `waiveRule()`, which refuses to set it in the first place.
 */
export function isEffectivelyWaived(rule: Rule): boolean {
  return rule.waived !== undefined && rule.severity !== "blocking";
}
