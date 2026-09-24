import type { ProjectView } from "./types";

export interface EphemeralProject extends ProjectView {
  isEphemeral?: boolean;
}

const ephemeralProjects = new Map<string, EphemeralProject>();
const SESSION_STORAGE_KEY = "scholar_ephemeral_projects";

function loadSessionStore(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const items: EphemeralProject[] = JSON.parse(raw);
      for (const item of items) {
        if (!ephemeralProjects.has(item.projectId)) {
          ephemeralProjects.set(item.projectId, item);
        }
      }
    }
  } catch {}
}

function persistSessionStore(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const items = Array.from(ephemeralProjects.values());
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

// Initial hydration from sessionStorage
loadSessionStore();

export function isEphemeralProject(projectId: string): boolean {
  if (!projectId) return false;
  if (projectId.startsWith("draft-")) return true;
  loadSessionStore();
  return ephemeralProjects.has(projectId);
}

export function getEphemeralProject(projectId: string): EphemeralProject | null {
  loadSessionStore();
  return ephemeralProjects.get(projectId) || null;
}

export function createEphemeralProject(outputTypeId: string, title = "Untitled Project"): EphemeralProject {
  loadSessionStore();
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
  persistSessionStore();
  return project;
}

export function updateEphemeralProject(
  projectId: string,
  answers: Record<string, string>
): EphemeralProject | null {
  loadSessionStore();
  const existing = ephemeralProjects.get(projectId);
  if (!existing) return null;
  const updated: EphemeralProject = {
    ...existing,
    answers: { ...existing.answers, ...answers },
  };
  ephemeralProjects.set(projectId, updated);
  persistSessionStore();
  return updated;
}

export function deleteEphemeralProject(projectId: string): void {
  loadSessionStore();
  ephemeralProjects.delete(projectId);
  persistSessionStore();
}

export function clearAllEphemeralProjects(): void {
  ephemeralProjects.clear();
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {}
  }
}
