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

/** Statuses that allow a source to be approved (must be in approvedIds). */
const APPROVALABLE_STATUSES = new Set(["kept", "discovered", null, undefined]);

export function isSourceApproved(source: ApprovableSource, approvedIds: Iterable<string>): boolean {
  // Explicit rejections: removed sources and excluded items are never approved
  if (source.status === "removed" || source.isExcluded) return false;
  // Status must be one that permits approval
  if (!APPROVALABLE_STATUSES.has(source.status)) return false;
  // Finally, check if it's in the approved list
  const ids = approvedIds instanceof Set ? (approvedIds as Set<string>) : new Set(approvedIds);
  return ids.has(source.id);
}

export function selectApprovedSources<T extends ApprovableSource>(sources: readonly T[], approvedIds: Iterable<string> | null | undefined): T[] {
  const ids = new Set(approvedIds ?? []);
  return sources.filter((s) => isSourceApproved(s, ids));
}
