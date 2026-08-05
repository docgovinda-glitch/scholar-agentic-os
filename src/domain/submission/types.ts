/**
 * Post-G6 submission tracking: what journal a document went to, and where
 * it stands. Orthogonal to the Conductor's gates (docs 30) — G6 answers "is
 * the manuscript compliant and exportable", full stop; a project can sit at
 * G6-signed-off with zero, one, or several submission attempts against
 * different venues, which is exactly why this is its own array on
 * ProjectRecord rather than another gate.
 *
 * Ported from src/types/submissionTypes.ts's SubmissionRecord (the legacy
 * client's model, itself real and working — see SubmissionTracker.tsx) but
 * server-persisted here rather than localStorage-only.
 */

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "minor_revisions"
  | "major_revisions"
  | "accepted"
  | "rejected"
  | "desk_rejected";

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "minor_revisions",
  "major_revisions",
  "accepted",
  "rejected",
  "desk_rejected",
];

export interface SubmissionRecord {
  id: string;
  journalName: string;
  journalUrl?: string;
  submittedAt: string;
  status: SubmissionStatus;
  /** The journal's own tracking id for this submission, if the portal issued one — free text, never fabricated. */
  journalSubmissionId?: string;
  notes?: string;
  /** Set to `now` whenever `status` changes — untouched by edits to any other field. */
  statusUpdatedAt: string;
}
