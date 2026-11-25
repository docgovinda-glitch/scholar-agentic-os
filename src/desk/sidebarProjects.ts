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
  const deleted = options.deletedIds ?? readDeletedProjectIds();
  const kept = items.filter((p) => {
    const id = p?.projectId;
    return !!id && !deleted.has(id) && !deleted.has(getMigratedDraftRealId(id) ?? id);
  });
  const context = options.contextProjects ?? kept;
  return deduplicateProjectList(kept, context, options.pinnedIds).map((p) => {
    const id = getMigratedDraftRealId(p.projectId as string) ?? (p.projectId as string);
    return { id, projectId: id, title: getProjectDisplayName(p, context), project: p };
  });
}
