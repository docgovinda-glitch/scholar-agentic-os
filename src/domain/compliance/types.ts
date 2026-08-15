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
export type RuleScope = "document" | "section" | "element" | "metadata" | "claims";

export interface RuleSource {
  document: string;
  locator: string;
  quote: string;
  extractedAt: string;
  confidence: number;
}

/** The deterministic evaluator kinds implemented so far (docs 31 §5.1's "immediate/fast" tier). */
export type EvaluatorKind = "word_count" | "structural_presence" | "metadata_presence" | "claim_support" | "readability" | "position_in_text";

export interface WordCountParams {
  max?: number;
  min?: number;
  /** Section keys to exclude from the count (e.g. references, appendices). Ignored when `sectionKey` is set. */
  exclude?: string[];
  /** If set, count only this one section's words instead of the whole document — e.g. OT-10's abstract_limit gate, which has its own min/max distinct from the document total. */
  sectionKey?: string;
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
  /** If set, the value must case-insensitively equal this exact string, not merely be present — e.g. OT-10's citation_style_exact gate. */
  expectedValue?: string;
}

/**
 * Checks a `domain/claim` `ClaimEvidenceGraph` (not the `CanonicalDocument`)
 * for unsupported claims — AG-13's "no unsupported claims" guarantee,
 * reachable as a Rubric rule for the first time via this evaluator kind.
 */
export interface ClaimSupportParams {
  /** Reserved for future claim-subset scoping (e.g. only claims within a given section). V1 checks the whole graph, unscoped. */
  scope?: "all";
}

/**
 * Checks the Flesch-Kincaid grade level of a document (or one of its
 * sections) against `maxGradeLevel`, via `domain/language/readability.ts`'s
 * `analyzeReadability()` — the pure logic AG-18 (the Readability Analyst,
 * `app/mesh/agents/ag18ReadabilityAnalyst.ts`) also wraps. This evaluator
 * calls that pure function directly rather than through `app/mesh`'s
 * capability-gated executor: there is no untrusted caller here, just the
 * Rubric's own trusted evaluation of a document it already has in hand,
 * which is the same reason every other evaluator in this file calls
 * `domain/*` logic directly instead of routing through an agent.
 */
export interface ReadabilityParams {
  /** If set, evaluates only the block whose id matches this key (same convention as StructuralPresenceParams.sectionKey). Unset evaluates the whole document. */
  sectionKey?: string;
  /** At least one of maxGradeLevel / maxJargonDensity must be set — the compiler (app/rubric/fromAtlas.ts's compileReadabilityGateRules) always sets exactly the one(s) its source QualityGateSpec.readabilityGate names. */
  maxGradeLevel?: number;
  /** 0-1, checked against domain/language/readability.ts's jargonDensity metric (fraction of 3+ syllable words). */
  maxJargonDensity?: number;
}

/**
 * Checks whether at least one of `keywords` (case-insensitive substring
 * match) appears within the first `withinWords` words of the document (or
 * one section, via `sectionKey`) — e.g. OT-20's "the recommendation is
 * stated within the first 200 words". A heuristic proxy for "is the
 * recommendation actually here", same honesty as textStats.ts's
 * passive-voice regex: literal keyword presence, not semantic
 * understanding of whether the sentence containing it truly is a
 * recommendation.
 */
export interface PositionInTextParams {
  keywords: string[];
  withinWords: number;
  sectionKey?: string;
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
    | { kind: "metadata_presence"; params: MetadataPresenceParams }
    | { kind: "claim_support"; params: ClaimSupportParams }
    | { kind: "readability"; params: ReadabilityParams }
    | { kind: "position_in_text"; params: PositionInTextParams };
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
