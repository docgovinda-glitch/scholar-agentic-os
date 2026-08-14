/**
 * A generated cover letter accompanying a journal submission (docs
 * 33-EXPORT-ARCHITECTURE.md §7: "Cover letter | Journal submissions").
 * One per project, overwritten wholesale on each generation — same
 * "captured fact, replaced in place" pattern as domain/journal/types.ts's
 * JournalRequirements, not a versioned history like domain/review's
 * peer-review rounds, since an earlier cover letter draft has no standing
 * value once superseded by a fresh one.
 */
export interface CoverLetter {
  text: string;
  journalName: string;
  generatedAt: string;
}
