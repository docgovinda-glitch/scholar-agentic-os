import type { ProjectView } from "./types";

export interface EphemeralProject extends ProjectView {
  isEphemeral?: boolean;
  realProjectId?: string;
}

const ephemeralProjects = new Map<string, EphemeralProject>();
const migratedDrafts = new Map<string, string>(); // draftId -> realProjectId

const SESSION_STORAGE_KEY = "scholar_ephemeral_projects";
const LOCAL_STORAGE_KEY = "scholar_ephemeral_projects_backup";
const MIGRATED_DRAFTS_KEY = "scholar_migrated_drafts_map";

function getStorageSafe(type: "session" | "local"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return type === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

const isDraftId = (id: string) => id.startsWith("draft-");

/** Persisted server ids are never ephemeral; drop any that older builds stored. */
function purgePersistedKeys(): void {
  for (const id of Array.from(ephemeralProjects.keys())) {
    if (!isDraftId(id)) ephemeralProjects.delete(id);
  }
}

function loadStores(): void {
  const session = getStorageSafe("session");
  const local = getStorageSafe("local");

  // 1. Hydrate migrated drafts mapping
  try {
    const rawMigrated = session?.getItem(MIGRATED_DRAFTS_KEY) || local?.getItem(MIGRATED_DRAFTS_KEY);
    if (rawMigrated) {
      const parsed: Record<string, string> = JSON.parse(rawMigrated);
      for (const [draftId, realId] of Object.entries(parsed)) {
        migratedDrafts.set(draftId, realId);
      }
    }
  } catch {}

  // 2. Hydrate ephemeral projects from session and local storage
  const tryLoad = (storage: Storage | null) => {
    if (!storage) return;
    try {
      const raw = storage.getItem(SESSION_STORAGE_KEY) || storage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const items: EphemeralProject[] = JSON.parse(raw);
        for (const item of items) {
          if (item && item.projectId && !ephemeralProjects.has(item.projectId)) {
            ephemeralProjects.set(item.projectId, item);
          }
        }
      }
    } catch {}
  };

  tryLoad(session);
  tryLoad(local);
  purgePersistedKeys();
}

function persistStores(): void {
  const session = getStorageSafe("session");
  const local = getStorageSafe("local");

  try {
    const items = Array.from(ephemeralProjects.values());
    const serialized = JSON.stringify(items);
    session?.setItem(SESSION_STORAGE_KEY, serialized);
    local?.setItem(LOCAL_STORAGE_KEY, serialized);

    const migratedObj: Record<string, string> = {};
    for (const [d, r] of migratedDrafts.entries()) {
      migratedObj[d] = r;
    }
    const serializedMigrated = JSON.stringify(migratedObj);
    session?.setItem(MIGRATED_DRAFTS_KEY, serializedMigrated);
    local?.setItem(MIGRATED_DRAFTS_KEY, serializedMigrated);
  } catch {}
}

// Initial hydration on module load
loadStores();

export function isEphemeralProject(projectId: string): boolean {
  if (!projectId) return false;
  loadStores();
  // A draft that already has a server row resolves to that row: it is persisted.
  if (migratedDrafts.has(projectId)) return false;
  return isDraftId(projectId);
}

/** Follows draft -> real chains (with cycle detection) to the final id. */
export function getMigratedDraftRealId(draftId: string): string | null {
  if (!draftId) return null;
  loadStores();
  const seen = new Set<string>([draftId]);
  let current = migratedDrafts.get(draftId);
  if (!current) return null;
  while (migratedDrafts.has(current) && !seen.has(current)) {
    seen.add(current);
    current = migratedDrafts.get(current) as string;
  }
  return current;
}

export function recordDraftMigration(draftId: string, realProjectId: string, project?: ProjectView): void {
  if (!draftId || !realProjectId) return;
  loadStores();
  migratedDrafts.set(draftId, realProjectId);

  const existing = ephemeralProjects.get(draftId);
  const updatedData: EphemeralProject = {
    ...(existing || {}),
    ...(project || {}),
    projectId: realProjectId,
    realProjectId,
    isEphemeral: false,
  } as EphemeralProject;

  // Only the draft alias is kept; the real id is a persisted server project.
  if (draftId !== realProjectId) ephemeralProjects.set(draftId, updatedData);
  persistStores();
}

export function recoverDraftProject(projectId: string): EphemeralProject | null {
  loadStores();
  const direct = ephemeralProjects.get(projectId);
  if (direct) return direct;

  const migratedRealId = getMigratedDraftRealId(projectId);

  // Attempt local storage deep scan
  const local = getStorageSafe("local");
  if (local) {
    try {
      const raw = local.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const items: EphemeralProject[] = JSON.parse(raw);
        const found = items.find((it) => it.projectId === projectId || it.projectId === migratedRealId);
        if (found) {
          ephemeralProjects.set(projectId, found);
          return found;
        }
      }
    } catch {}
  }

  return null;
}

export function getEphemeralProject(projectId: string): EphemeralProject | null {
  loadStores();

  // If this draft was already migrated to a permanent project, retrieve via realId
  const existing = ephemeralProjects.get(projectId);
  if (existing) return existing;

  return recoverDraftProject(projectId);
}

export function createEphemeralProject(outputTypeId: string, title = "Untitled Project"): EphemeralProject {
  loadStores();
  const id = `draft-${outputTypeId.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const project: EphemeralProject = {
    projectId: id,
    outputTypeId,
    answers: { title },
    authors: [],
    intakeCompleteness: 0,
    hasDocument: false,
    hasJournalRequirements: false,
    gates: [
      { gate: "G0", name: "Intake", status: "in_progress", outstandingBlocking: [] },
      { gate: "G1", name: "Evidence", status: "not_started", outstandingBlocking: [] },
      { gate: "G2", name: "Draft", status: "not_started", outstandingBlocking: [] },
    ],
    isEphemeral: true,
  };
  ephemeralProjects.set(id, project);
  persistStores();
  return project;
}

export function saveEphemeralProject(projectId: string, answers: Record<string, any>): EphemeralProject {
  loadStores();
  const existing = ephemeralProjects.get(projectId);
  if (existing) {
    return updateEphemeralProject(projectId, answers)!;
  }
  const project: EphemeralProject = {
    projectId,
    outputTypeId: "ot-01",
    answers: { ...answers },
    authors: [],
    intakeCompleteness: 0,
    hasDocument: false,
    hasJournalRequirements: false,
    gates: [],
    isEphemeral: true,
  };
  ephemeralProjects.set(projectId, project);
  persistStores();
  return project;
}

export function updateEphemeralProject(
  projectId: string,
  answers: Record<string, any>
): EphemeralProject | null {
  loadStores();
  const existing = ephemeralProjects.get(projectId);
  if (!existing) return null;

  const updated: EphemeralProject = {
    ...existing,
    answers: { ...existing.answers, ...answers },
  };
  ephemeralProjects.set(projectId, updated);
  persistStores();
  return updated;
}

export function deleteEphemeralProject(projectId: string): void {
  loadStores();
  ephemeralProjects.delete(projectId);
  // Remove the alias in both directions: the draft id and any draft pointing at this id.
  migratedDrafts.delete(projectId);
  for (const [draftId, realId] of Array.from(migratedDrafts.entries())) {
    if (realId === projectId) {
      migratedDrafts.delete(draftId);
      ephemeralProjects.delete(draftId);
    }
  }
  persistStores();
}

export function clearAllEphemeralProjects(): void {
  ephemeralProjects.clear();
  migratedDrafts.clear();
  const session = getStorageSafe("session");
  const local = getStorageSafe("local");
  try {
    session?.removeItem(SESSION_STORAGE_KEY);
    session?.removeItem(MIGRATED_DRAFTS_KEY);
    local?.removeItem(LOCAL_STORAGE_KEY);
    local?.removeItem(MIGRATED_DRAFTS_KEY);
  } catch {}
}
