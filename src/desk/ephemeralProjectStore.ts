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
  if (migratedDrafts.has(projectId)) return true;
  if (projectId.startsWith("draft-")) return true;
  return ephemeralProjects.has(projectId);
}

export function getMigratedDraftRealId(draftId: string): string | null {
  if (!draftId) return null;
  loadStores();
  return migratedDrafts.get(draftId) || null;
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

  // Keep both draftId and realProjectId pointing to the project so lookups never fail
  ephemeralProjects.set(draftId, updatedData);
  ephemeralProjects.set(realProjectId, updatedData);
  persistStores();
}

export function recoverDraftProject(projectId: string): EphemeralProject | null {
  loadStores();
  const direct = ephemeralProjects.get(projectId);
  if (direct) return direct;

  const migratedRealId = migratedDrafts.get(projectId);
  if (migratedRealId && ephemeralProjects.has(migratedRealId)) {
    return ephemeralProjects.get(migratedRealId) || null;
  }

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
  const migratedRealId = migratedDrafts.get(projectId);
  if (migratedRealId) {
    const migrated = ephemeralProjects.get(migratedRealId);
    if (migrated) return migrated;
  }

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
  const effectiveId = migratedDrafts.get(projectId) || projectId;
  const existing = ephemeralProjects.get(effectiveId) || ephemeralProjects.get(projectId);
  if (!existing) return null;

  const updated: EphemeralProject = {
    ...existing,
    answers: { ...existing.answers, ...answers },
  };
  ephemeralProjects.set(effectiveId, updated);
  if (effectiveId !== projectId) {
    ephemeralProjects.set(projectId, updated);
  }
  persistStores();
  return updated;
}

export function deleteEphemeralProject(projectId: string): void {
  loadStores();
  // Instead of completely throwing away the record if it was migrated, preserve the migration alias
  if (!migratedDrafts.has(projectId)) {
    ephemeralProjects.delete(projectId);
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
