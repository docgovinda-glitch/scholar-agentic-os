/**
 * Maps Desk's own ProjectView (server/routes/project.ts's projectView()) to
 * Pocket's PocketProject — replaces the legacy PaperProject→PocketProject
 * adapter (src/pocket/adapters.ts) now that Pocket mounts inside Desk
 * directly, against Desk's real data rather than a translation layer.
 *
 * Three PocketProject fields have no Desk equivalent and are always 0/empty
 * here, honestly rather than fabricated:
 *   - unreadComments / pendingStudioChanges: Pocket's comment and Studio-diff
 *     features aren't wired to any Desk-side tracking of these counts.
 *   - sourcesAwaitingApproval: Desk's Vault has no discovery-then-approval
 *     workflow (legacy's Phase C DiscoveredDataSource concept) — Vault items
 *     are added directly. There is nothing to approve, so this is correctly
 *     always 0, not a gap.
 */

import type { ProjectView } from "../types";
import type { PocketProject } from "../../pocket/types";

/** ProjectView carries no title field and no timestamp — same gap
 *  Desk's own ProjectListScreen already lives with, falling back to the
 *  output type id (ProjectListScreen.tsx's ProjectRow does the same). */
export function toPocketProject(project: ProjectView): PocketProject {
  return {
    ...project,
    title: project.answers?.title?.trim() || project.outputTypeId,
    lastModified: new Date(),
    unreadComments: 0,
    pendingStudioChanges: 0,
    sourcesAwaitingApproval: 0,
  };
}

export function toPocketProjects(projects: ProjectView[]): PocketProject[] {
  return projects.map(toPocketProject);
}
