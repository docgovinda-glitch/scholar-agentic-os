import type { ProjectView } from "../types";
import {
  isEphemeralProject,
  getEphemeralProject,
  createEphemeralProject,
  updateEphemeralProject,
  deleteEphemeralProject,
  recordDraftMigration,
  getMigratedDraftRealId,
  recoverDraftProject,
} from "../ephemeralProjectStore";
import { authedJsonFetch, json } from "./httpClient";

export {
  isEphemeralProject,
  getEphemeralProject,
  createEphemeralProject,
  updateEphemeralProject,
  deleteEphemeralProject,
  recordDraftMigration,
  getMigratedDraftRealId,
  recoverDraftProject,
};

const committingProjects = new Set<string>();

export function isCommittingProject(projectId: string): boolean {
  return committingProjects.has(projectId);
}

/**
 * Commit an ephemeral in-memory project into permanent PostgreSQL database
 * (e.g. clicking "Analyze Assignment Brief with AI").
 * Executes the backend database INSERT and saves all accumulated intake answers.
 */
export async function commitProjectToDatabase(projectId: string): Promise<ProjectView> {
  if (committingProjects.has(projectId)) {
    const existing = getEphemeralProject(projectId);
    if (existing) return existing;
    throw new Error(`Project ${projectId} is already in the process of committing`);
  }

  const ephemeral = getEphemeralProject(projectId);
  if (!ephemeral) {
    throw new Error(`Cannot commit ephemeral project ${projectId}: not found in ephemeral store`);
  }

  committingProjects.add(projectId);
  try {
    // 1. Idempotent & Atomic database commit with deterministic key
    const migrationPayload = {
      outputTypeId: ephemeral.outputTypeId,
      idempotencyKey: projectId,
      ephemeralId: projectId,
      answers: ephemeral.answers,
    };

    const res = await authedJsonFetch("/api/projects", "POST", migrationPayload);
    if (!res.ok) {
      throw new Error(`Failed to commit project: HTTP ${res.status} ${res.statusText}`);
    }

    const created = await json<ProjectView>(res);
    if (!created || !created.projectId) {
      throw new Error("Invalid response received during project migration");
    }

    // 2. Save any collected intake answers if not already merged
    let finalProject = created;
    if (ephemeral.answers && Object.keys(ephemeral.answers).length > 0 && (!created.answers || Object.keys(created.answers).length === 0)) {
      try {
        const patchRes = await authedJsonFetch(
          `/api/projects/${encodeURIComponent(created.projectId)}/intake`,
          "PATCH",
          { answers: ephemeral.answers }
        );
        if (patchRes.ok) {
          finalProject = await json<ProjectView>(patchRes);
        }
      } catch (e) {
        console.warn("Failed to persist intake answers after project commit:", e);
      }
    }

    // 3. Atomically record draft migration and ONLY remove from local store upon verified server response
    recordDraftMigration(projectId, created.projectId, finalProject);
    deleteEphemeralProject(projectId);

    // 4. Update browser URL history if on the draft page
    if (typeof window !== "undefined") {
      if (window.location.pathname.includes(projectId)) {
        const updatedPath = window.location.pathname.replace(projectId, created.projectId);
        window.history.replaceState(null, "", updatedPath);
      }
      window.dispatchEvent(
        new CustomEvent("scholar:project-persisted", {
          detail: { draftId: projectId, realId: created.projectId, project: finalProject },
        })
      );
    }

    return finalProject;
  } catch (err: unknown) {
    // If network or auth fails mid-flight, keep the local ephemeral record intact
    // with a "Pending Cloud Sync — Will retry automatically" status.
    try {
      updateEphemeralProject(projectId, {
        ...(ephemeral.answers || {}),
        _syncStatus: "Pending Cloud Sync — Will retry automatically",
        _syncError: err instanceof Error ? err.message : String(err),
      });
    } catch {}
    throw err;
  } finally {
    committingProjects.delete(projectId);
  }
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
