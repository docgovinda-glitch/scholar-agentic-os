/**
 * Desk's API client — talks only to the new-architecture project/atlas/rubric
 * routes (server/routes/project.ts), never the legacy /api/generate proxy.
 * No provider/apiKey ever passes through here.
 */

import type { CanonicalDocument, OutputTypeSummary, ProjectView, RubricReport } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function listOutputTypes(): Promise<{ items: OutputTypeSummary[] }> {
  return fetch("/api/atlas/output-types").then((r) => json(r));
}

export function createProject(outputTypeId: string): Promise<ProjectView> {
  return fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outputTypeId }),
  }).then((r) => json(r));
}

export function getProject(projectId: string): Promise<ProjectView> {
  return fetch(`/api/projects/${encodeURIComponent(projectId)}`).then((r) => json(r));
}

/** Returns null (not an error) when no document has been submitted yet — a normal, expected state, not a failure. */
export async function getRubric(projectId: string): Promise<RubricReport | null> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/rubric`);
  if (res.status === 404) return null;
  return json<RubricReport>(res);
}

export function submitDocument(projectId: string, document: CanonicalDocument): Promise<ProjectView & { rubric: RubricReport }> {
  return fetch(`/api/projects/${encodeURIComponent(projectId)}/document`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  }).then((r) => json(r));
}
