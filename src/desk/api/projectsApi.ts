import { authedFetch, authedJsonFetch, json } from "./client";
import { originalFetch } from "../originalFetch";
import {
  isEphemeralProject,
  getEphemeralProject,
  createEphemeralProject,
  updateEphemeralProject,
  deleteEphemeralProject,
  getMigratedDraftRealId,
  recoverDraftProject,
} from "../ephemeralProjectStore";
import {
  deleteCachedProject,
  removePendingMutationsForProject,
} from "../../services/offline/indexedDbStorage";
import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";
import type {
  Author,
  CanonicalDocument,
  JournalRequirements,
  OutputTypeSpec,
  OutputTypeSummary,
  ProjectView,
  RubricReport,
  SubmissionRecord,
} from "../types";

export function listOutputTypes(): Promise<{ items: OutputTypeSummary[] }> {
  return originalFetch("/api/atlas/output-types").then((r: Response) => json(r));
}

export function createProject(outputTypeId: string): Promise<ProjectView> {
  if (outputTypeId === "OT-06") {
    return createDatabaseProject(outputTypeId);
  }
  const ephemeral = createEphemeralProject(outputTypeId);
  return Promise.resolve(ephemeral);
}

export function createDatabaseProject(outputTypeId: string): Promise<ProjectView> {
  return authedJsonFetch("/api/projects", "POST", { outputTypeId }).then((r) => json(r));
}

/** The signed-in user's own projects, most recently updated first. */
export function listProjects(): Promise<{ items: ProjectView[] }> {
  return authedFetch("/api/projects")
    .then((r) => json<{ items: ProjectView[] }>(r))
    .then((data) => {
      if (!data?.items || !Array.isArray(data.items)) return { items: [] };
      const seen = new Set<string>();
      const uniqueItems = data.items.filter((p) => {
        if (!p?.projectId || seen.has(p.projectId)) return false;
        seen.add(p.projectId);
        return true;
      });
      return { items: uniqueItems };
    });
}

/**
 * Purge any project keys from browser storage to eliminate zombie cache data.
 */
export function cleanupProjectStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    const cleanStorage = (storage: Storage) => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (
          key &&
          (key.includes(projectId) ||
            key.startsWith(`project_${projectId}`) ||
            key.startsWith(`draft_${projectId}`))
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    };

    if (window.localStorage) cleanStorage(window.localStorage);
    if (window.sessionStorage) cleanStorage(window.sessionStorage);
  } catch (err) {
    console.warn("Non-fatal: failed to clean up project storage", err);
  }
}

export async function deleteProject(projectId: string): Promise<{ success: boolean; id: string }> {
  if (isEphemeralProject(projectId)) {
    deleteEphemeralProject(projectId);
    cleanupProjectStorage(projectId);
    return { success: true, id: projectId };
  }

  cleanupProjectStorage(projectId);
  try {
    await deleteCachedProject(projectId);
    await removePendingMutationsForProject(projectId);
  } catch (err) {
    console.warn("Non-fatal: offline cache cleanup failed for project", projectId, err);
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("project_id", projectId);

      if (error) {
        console.warn("Direct Supabase deletion error, falling back to server route:", error);
      }
    }
  }

  try {
    await authedFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    }).then((r) => json(r));
  } catch (err) {
    console.warn("Server DELETE /api/projects/:id response:", err);
  }

  return { success: true, id: projectId };
}

export function getOutputTypeSpec(outputTypeId: string): Promise<OutputTypeSpec> {
  return authedFetch(`/api/atlas/output-types/${encodeURIComponent(outputTypeId)}`).then((r) => json(r));
}

export function saveIntakeAnswers(
  projectId: string,
  answers: Record<string, unknown>
): Promise<ProjectView> {
  const effectiveId = getMigratedDraftRealId(projectId) || projectId;
  if (isEphemeralProject(effectiveId)) {
    const updated = updateEphemeralProject(effectiveId, answers);
    if (updated) return Promise.resolve(updated);
  }
  return authedJsonFetch(`/api/projects/${encodeURIComponent(effectiveId)}/intake`, "PATCH", { answers }).then((r) =>
    json(r)
  );
}

export function saveAuthors(projectId: string, authors: Author[]): Promise<ProjectView> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/authors`, "PUT", { authors }).then((r) => json(r));
}

export function signOffGate(projectId: string, gate: string, actor: string): Promise<ProjectView> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/gates/${encodeURIComponent(gate)}/signoff`,
    "POST",
    { actor }
  ).then((r) => json(r));
}

export function invalidateGate(projectId: string, gate: string, reason: string): Promise<ProjectView> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/gates/${encodeURIComponent(gate)}/invalidate`,
    "POST",
    { reason }
  ).then((r) => json(r));
}

export function getProject(projectId: string): Promise<ProjectView> {
  const migratedId = getMigratedDraftRealId(projectId);
  if (migratedId && migratedId !== projectId) {
    return getProject(migratedId);
  }

  if (isEphemeralProject(projectId)) {
    const draft = getEphemeralProject(projectId);
    if (draft) return Promise.resolve(draft);

    const recovered = recoverDraftProject(projectId);
    if (recovered) return Promise.resolve(recovered);

    return authedFetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((r) => json<ProjectView>(r))
      .catch(() => Promise.reject(new Error(`Draft project ${projectId} not found in ephemeral memory`)));
  }
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}`).then((r) => json(r));
}

export async function getRubric(projectId: string): Promise<RubricReport | null> {
  if (isEphemeralProject(projectId)) return null;
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/rubric`);
  if (res.status === 404 || res.status === 204) return null;
  return json<RubricReport>(res);
}

export async function getDocument(projectId: string): Promise<CanonicalDocument | null> {
  if (isEphemeralProject(projectId)) return null;
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/document`);
  if (res.status === 404 || res.status === 204) return null;
  return json<CanonicalDocument>(res);
}

export function submitDocument(projectId: string, document: CanonicalDocument): Promise<ProjectView & { rubric: RubricReport }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/document`, "PUT", { document }).then((r) => json(r));
}

export function resolveCitations(
  projectId: string,
  style?: string
): Promise<ProjectView & { rubric: RubricReport; citedSourceIds: string[]; unresolvedIds: string[] }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/resolve-citations`, "POST", { style }).then((r) => json(r));
}

export async function getJournalRequirements(projectId: string): Promise<JournalRequirements | null> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/journal-requirements`);
  if (res.status === 404 || res.status === 204) return null;
  return json<JournalRequirements>(res);
}

export function saveJournalRequirements(
  projectId: string,
  payload: Omit<JournalRequirements, "source" | "capturedAt" | "capturedBy"> & { source?: JournalRequirements["source"] }
): Promise<{ journalRequirements: JournalRequirements; gates: ProjectView["gates"] }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/journal-requirements`, "PUT", payload).then((r) => json(r));
}

export function listSubmissions(projectId: string): Promise<{ submissions: SubmissionRecord[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/submissions`).then((r) => json(r));
}

export function addSubmission(
  projectId: string,
  submission: Omit<SubmissionRecord, "id" | "statusUpdatedAt">
): Promise<{ submissions: SubmissionRecord[] }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/submissions`, "POST", submission).then((r) => json(r));
}

export function updateSubmission(
  projectId: string,
  submissionId: string,
  patch: Partial<Omit<SubmissionRecord, "id" | "statusUpdatedAt">>
): Promise<{ submissions: SubmissionRecord[] }> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/submissions/${encodeURIComponent(submissionId)}`,
    "PATCH",
    patch
  ).then((r) => json(r));
}

export function deleteSubmission(projectId: string, submissionId: string): Promise<{ submissions: SubmissionRecord[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/submissions/${encodeURIComponent(submissionId)}`, {
    method: "DELETE",
  }).then((r) => json(r));
}
