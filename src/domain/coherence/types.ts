/**
 * The global coherence pass — a post-assembly, multi-pass consistency check
 * over a completed (or in-progress) manuscript's sections. Deliberately
 * plain data, no dependency on app/* or platform/gateway, same rule every
 * other domain/* module here follows.
 *
 * "Multi-pass" is the load-bearing property: each dimension below is its
 * own separate, bounded model call (src/app/coherence/checkCoherence.ts),
 * never one call asked to judge everything about the manuscript at once.
 */

export type CoherenceDimension = "terminology" | "argument_continuity" | "methodology";

export const COHERENCE_DIMENSIONS: CoherenceDimension[] = ["terminology", "argument_continuity", "methodology"];

export type CoherenceSeverity = "minor" | "moderate" | "major";

export interface CoherenceIssue {
  dimension: CoherenceDimension;
  description: string;
  /** Section keys this issue spans — usually 2+, since a coherence issue is by definition a disagreement between sections, not a single-section problem (that's what per-section validation, already run at generation time, is for). */
  sectionKeys: string[];
  severity: CoherenceSeverity;
}

export interface CoherenceReport {
  issues: CoherenceIssue[];
  /** Which dimensions actually ran — a partial run (one pass's model call failed) still returns the passes that succeeded, never silently hidden as "no issues found". */
  passesRun: CoherenceDimension[];
  /** Dimension -> error, for any pass that failed rather than silently vanishing from the report. */
  passErrors: Partial<Record<CoherenceDimension, string>>;
  checkedAt: string;
}
