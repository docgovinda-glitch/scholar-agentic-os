/**
 * Adapters from the desktop workspace's data model (PaperProject, in
 * src/types.ts) to Pocket's view model (PocketProject, which extends the
 * desk ProjectView).
 *
 * These are two genuinely different shapes: PaperProject is the localStorage
 * project the workspace edits, while ProjectView is the server-side
 * projection Pocket's tabs were written against. Without a translation step
 * App.tsx had nothing it could legally pass to <PocketShell>, which is why it
 * was mounted with no props at all and rendered an empty shell.
 */

import type { PaperProject, DiscoveredDataSource } from "../types";
import type { ApprovalCandidate, ApprovalQueueState, PocketProject } from "./types";

/**
 * Sources Phase C discovered that the user has not accepted yet.
 * PaperProject.dataSources carries a `status` of "pending" | "approved".
 */
function pendingSources(project: PaperProject): DiscoveredDataSource[] {
  return (project.dataSources ?? []).filter((s) => s.status !== "approved");
}

export function toPocketProject(project: PaperProject): PocketProject {
  const lastActivity = project.lastActivity ? new Date(project.lastActivity) : new Date();

  return {
    projectId: project.id,
    title: project.title?.trim() || "Untitled Manuscript",
    outputTypeId: project.outputFormat || "",
    answers: {},
    intakeCompleteness: 0,
    hasDocument: Object.values(project.sections ?? {}).some((s) => Boolean(s?.trim())),
    // Pocket's ProjectsTab reads `gates` to show status. The workspace tracks
    // progress as a phase letter, not gates, so expose the current phase as a
    // single in-progress gate rather than fabricating a full gate list.
    gates: [
      {
        gate: project.currentPhase,
        name: `Phase ${project.currentPhase}`,
        status: "in_progress",
        outstandingBlocking: [],
      },
    ],
    lastModified: Number.isNaN(lastActivity.getTime()) ? new Date() : lastActivity,
    unreadComments: 0,
    pendingStudioChanges: 0,
    sourcesAwaitingApproval: pendingSources(project).length,
  };
}

export function toPocketProjects(projects: PaperProject[]): PocketProject[] {
  return projects.map(toPocketProject);
}

/**
 * Builds the approval queue Pocket's card view renders.
 *
 * DiscoveredDataSource is a dataset/repository record, not a bibliographic
 * one, so the fields ApprovalCandidate reserves for papers (authors, DOI,
 * venue, retraction status) genuinely have no counterpart here. They are left
 * empty rather than filled with plausible-looking values — the card shows
 * what the workspace actually knows: name, relevance, reliability, limits.
 */
export function toApprovalQueue(project: PaperProject | null): ApprovalQueueState {
  if (!project) {
    return { candidates: [], currentIndex: 0, approvedCount: 0, rejectedCount: 0 };
  }

  const pending = pendingSources(project);
  const approved = (project.dataSources ?? []).length - pending.length;

  const candidates: ApprovalCandidate[] = pending.map((source, i) => ({
    id: source.url || source.name || String(i),
    title: source.name,
    authors: [],
    venue: source.type,
    summary: source.relevance,
    authenticityChecks: {
      doiResolves: false,
      publisherVerified: false,
      notRetracted: true,
      journalRanking: source.reliability,
    },
    citationString: source.url,
    reasonSuggested: source.limitations,
    position: i,
    total: pending.length,
  }));

  return { candidates, currentIndex: 0, approvedCount: approved, rejectedCount: 0 };
}
