/**
 * Coursework source search, browser side: one call to the project's search
 * route (POST /api/projects/:id/assignment/sources/search), which runs the
 * shared retrieval pipeline on the server, merges duplicates, verifies
 * metadata and measures relevance (see server/routes/project/assignment/
 * sourceRoutes.ts and src/domain/assignment/sourceSearch.ts).
 *
 * The browser never calls a scholarly index itself and never invents a
 * record: a failed search throws, and the caller leaves the list as it is.
 * Merging into the list is the caller's job (mergeSearchResults), so
 * approved, prescribed, Vault and hand-added sources always stay.
 */
import type { DiscoveredSource } from "../types";
import { authedJsonFetch } from "../../api";

export interface SourceSearchRequest {
  /** Search phrases (the subject word of the brief is added on the server). */
  queries?: string[];
  /** A topic to search for instead of the brief's own phrases. */
  topic?: string;
  limit?: number;
  /** List the references the brief names first. */
  includePrescribed?: boolean;
}

export async function searchSourcesForProject(projectId: string, request: SourceSearchRequest): Promise<DiscoveredSource[]> {
  const res = await authedJsonFetch(`/api/projects/${projectId}/assignment/sources/search`, "POST", request, { skipLlmFallback: true });
  const data = (await res.json().catch(() => null)) as { sources?: DiscoveredSource[]; error?: string } | null;
  if (!res.ok) throw new Error(data?.error || `The search did not run (${res.status}).`);
  return Array.isArray(data?.sources) ? data.sources : [];
}

/** The references the brief names, then live results for the brief's own phrases. */
export function discoverSourcesForAssignment(projectId: string): Promise<DiscoveredSource[]> {
  return searchSourcesForProject(projectId, { includePrescribed: true, limit: 30 });
}

/** A wider search; the caller keeps only what is not listed yet. */
export async function fetchMoreRealSources(projectId: string, existing: DiscoveredSource[], batchSize = 10): Promise<DiscoveredSource[]> {
  return searchSourcesForProject(projectId, { limit: Math.min(50, existing.length + batchSize * 2) });
}

/** Search for the student's own phrases (or a topic), alongside the brief's subject. */
export function discoverRealScholarlySourcesFromServer(projectId: string, request: { queries?: string[]; topic?: string; limit?: number }): Promise<DiscoveredSource[]> {
  return searchSourcesForProject(projectId, request);
}
