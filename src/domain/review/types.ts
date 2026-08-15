/**
 * Multi-lens adversarial peer review — seven independent reviewer lenses,
 * each producing genuinely critical findings, never a praise-optimized
 * summary. Deliberately plain data, no dependency on app/* or
 * platform/gateway, same rule every other domain/* module here follows.
 *
 * "Versioned review rounds": running peer review again NEVER overwrites a
 * prior round — PeerReviewHistory.rounds only ever grows, so an author can
 * see whether a revision actually addressed round 1's concerns in round 2,
 * rather than the earlier verdict being silently lost.
 */

export type ReviewLens = "contribution" | "literature" | "methodology" | "evidence" | "argument" | "citation" | "journal_fit";

export const REVIEW_LENSES: ReviewLens[] = ["contribution", "literature", "methodology", "evidence", "argument", "citation", "journal_fit"];

export type FindingSeverity = "minor" | "moderate" | "major" | "critical";

export interface ReviewFinding {
  summary: string;
  detail: string;
  severity: FindingSeverity;
  sectionKeys: string[];
}

export interface LensReview {
  lens: ReviewLens;
  findings: ReviewFinding[];
  /** A critical paragraph — required to say something substantive even when findings is empty, so "no findings" reads as a real judgement rather than the lens having nothing to say. */
  overallAssessment: string;
}

export interface ReviewRound {
  roundNumber: number;
  lensReviews: LensReview[];
  /** Which lenses actually completed this round — a partial round (one lens's call failed) is still real, same discipline as domain/coherence's CoherenceReport.passesRun. */
  lensesRun: ReviewLens[];
  lensErrors: Partial<Record<ReviewLens, string>>;
  createdAt: string;
}

export interface PeerReviewHistory {
  rounds: ReviewRound[];
}

export function emptyPeerReviewHistory(): PeerReviewHistory {
  return { rounds: [] };
}
