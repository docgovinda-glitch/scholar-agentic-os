/**
 * The one definition of an approved Coursework source.
 *
 * A source is approved only when its id is in the student's approved list
 * (`approved_source_ids`; before any decision that list holds the brief's
 * prescribed references and the student's uploads). `status: "kept"` only means
 * a discovered paper is still in the list, not that the student approved it.
 * Removed or excluded sources are never approved, whatever the list says.
 */

export interface ApprovableSource {
  id: string;
  status?: string;
  isExcluded?: boolean;
}

export function isSourceApproved(source: ApprovableSource, approvedIds: Iterable<string>): boolean {
  if (source.status === "removed" || source.isExcluded) return false;
  const ids = approvedIds instanceof Set ? (approvedIds as Set<string>) : new Set(approvedIds);
  return ids.has(source.id);
}

export function selectApprovedSources<T extends ApprovableSource>(sources: readonly T[], approvedIds: Iterable<string> | null | undefined): T[] {
  const ids = new Set(approvedIds ?? []);
  return sources.filter((s) => isSourceApproved(s, ids));
}
