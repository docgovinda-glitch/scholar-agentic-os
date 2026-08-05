/**
 * Pure operations over a project's submission list. See types.ts for the
 * scope note on what this tracks and why it lives outside the gate machinery.
 */

import type { SubmissionRecord } from "./types";

export class SubmissionError extends Error {}

/** Add a submission. Throws if its id is already used — submissions are add-once, not upserted. */
export function addSubmission(submissions: SubmissionRecord[], submission: SubmissionRecord): SubmissionRecord[] {
  if (submissions.some((s) => s.id === submission.id)) {
    throw new SubmissionError(`Submission "${submission.id}" already exists.`);
  }
  return [...submissions, submission];
}

/**
 * Patch a submission. `statusUpdatedAt` is only bumped to `now` when the
 * patch actually changes `status` — editing notes or the journal URL is not
 * a status change and must not reset "days since last update".
 */
export function updateSubmission(
  submissions: SubmissionRecord[],
  id: string,
  patch: Partial<Omit<SubmissionRecord, "id" | "statusUpdatedAt">>,
  now: string
): SubmissionRecord[] {
  const index = submissions.findIndex((s) => s.id === id);
  if (index === -1) {
    throw new SubmissionError(`No submission "${id}".`);
  }
  const current = submissions[index];
  const updated: SubmissionRecord = {
    ...current,
    ...patch,
    statusUpdatedAt: patch.status !== undefined && patch.status !== current.status ? now : current.statusUpdatedAt,
  };
  return [...submissions.slice(0, index), updated, ...submissions.slice(index + 1)];
}

/** Remove a submission. Throws if it doesn't exist, same "must be real" discipline as update. */
export function deleteSubmission(submissions: SubmissionRecord[], id: string): SubmissionRecord[] {
  if (!submissions.some((s) => s.id === id)) {
    throw new SubmissionError(`No submission "${id}".`);
  }
  return submissions.filter((s) => s.id !== id);
}
