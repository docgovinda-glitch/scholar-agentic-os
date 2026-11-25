import { getMigratedDraftRealId } from "./ephemeralProjectStore";
import { deduplicateProjectList, getProjectDisplayName, type ProjectTitleItem } from "./projectNaming";

export const DELETED_PROJECT_IDS_KEY = "scholar_deleted_project_ids";

/** Ids the user deleted in this tab, kept so a slow list reload cannot bring them back. */
export function readDeletedProjectIds(): Set<string> {
  const ids = new Set<string>();
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(DELETED_PROJECT_IDS_KEY) || "[]");
    if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === "string") ids.add(id);
  } catch {
    // ignore unreadable storage
  }
  return ids;
}

function writeDeletedProjectIds(ids: Set<string>): void {
  try {
    sessionStorage.setItem(DELETED_PROJECT_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // storage unavailable (private mode): the in-memory list still hides it for this render
  }
}

/** Remember a deletion (and its draft alias's server id) so no list reload resurrects it. */
export function markProjectDeleted(id: string): void {
  if (!id) return;
  const ids = readDeletedProjectIds();
  ids.add(id);
  const real = getMigratedDraftRealId(id);
  if (real) ids.add(real);
  writeDeletedProjectIds(ids);
}

/** Undo `markProjectDeleted` after a failed delete, so the project shows again. */
export function unmarkProjectDeleted(id: string): void {
  const ids = readDeletedProjectIds();
  ids.delete(id);
  const real = getMigratedDraftRealId(id);
  if (real) ids.delete(real);
  writeDeletedProjectIds(ids);
}

/** Drop deleted ids (and deleted draft aliases) from a list. */
export function withoutDeletedProjects<T extends { projectId?: string }>(items: T[], deletedIds: Set<string> = readDeletedProjectIds()): T[] {
  return items.filter((p) => {
    const id = p?.projectId;
    return !!id && !deletedIds.has(id) && !deletedIds.has(getMigratedDraftRealId(id) ?? id);
  });
}

export interface SidebarProjectRow<T extends ProjectTitleItem> {
  id: string;
  projectId: string;
  title: string;
  project: T;
}

/**
 * The one project list every workspace sidebar shows: deleted ids removed, draft
 * aliases resolved to their server id, one row per title, one display name.
 */
export function normalizeProjectList<T extends ProjectTitleItem>(
  items: T[],
  options: { deletedIds?: Set<string>; pinnedIds?: string[]; contextProjects?: ProjectTitleItem[] } = {}
): SidebarProjectRow<T>[] {
  const kept = withoutDeletedProjects(items, options.deletedIds ?? readDeletedProjectIds());
  const context = options.contextProjects ?? kept;
  return deduplicateProjectList(kept, context, options.pinnedIds).map((p) => {
    const id = getMigratedDraftRealId(p.projectId as string) ?? (p.projectId as string);
    return { id, projectId: id, title: getProjectDisplayName(p, context), project: p };
  });
}
