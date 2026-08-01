import { useCallback, useEffect, useRef } from "react";
import { PaperProject, PROFILE_STATE_PREFIX, DEFAULT_STATE, UserProfile } from "../types";

export interface UseProjectPersistenceResult {
  loadAllProjects: () => void;
  updateProject: (newFields: Partial<PaperProject>) => void;
  createNewProject: () => void;
  switchToProject: (projectId: string) => void;
  deleteProject: (projectId: string) => void;
}

/**
 * Encapsulates project persistence behavior:
 * - localStorage load/save (multi-project profiles)
 * - loadAllProjects, updateProject, createNewProject, switchToProject, deleteProject
 * - client-side schema migration (v2 cost metrics / model preferences / usage logs / aiSettings)
 * - scholar_project_updated event handling
 *
 * App.tsx retains ownership of project state (via auth context) and the allProjects list,
 * and passes setViewMode / setActiveTab / allProjects so navigation side-effects are preserved.
 */
export function useProjectPersistence(
  user: string | null,
  project: PaperProject | null,
  setProject: React.Dispatch<React.SetStateAction<PaperProject | null>>,
  setAllProjects: React.Dispatch<React.SetStateAction<PaperProject[]>>,
  allProjects: PaperProject[],
  setViewMode: React.Dispatch<React.SetStateAction<"dashboard" | "workspace">>,
  setActiveTab: React.Dispatch<React.SetStateAction<"workspace" | "vault" | "agents" | "publishing" | "citation" | "settings" | "profile">>
): UseProjectPersistenceResult {
  // Fixes a real race: updateProject() used to close over the `project`
  // argument from the render that created it. Two updateProject() calls in
  // the same synchronous tick (no re-render between them — e.g.
  // ManuscriptDraftingWorkspace.tsx's draftSection(): saveVersion() calls
  // updateProject({ versions }), then updateProject({ sections }) runs
  // immediately after) both read the SAME stale `project`, so the second
  // call's `{ ...project, ...newFields }` silently dropped the first call's
  // fields — confirmed live, every AI-drafted section was losing its own
  // version-history checkpoint the moment it was saved.
  //
  // projectRef is the fix: updateProject reads/writes it synchronously, so a
  // second call in the same tick sees the first call's result immediately,
  // without waiting for React to re-render and refresh the `project` prop.
  // The effect below keeps it in sync with `project` for every OTHER path
  // that changes it (switchToProject, the scholar_project_updated listener,
  // etc.), so updateProject is always working from the true latest value
  // regardless of what last changed it.
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Listen for background project state updates from AI service calls
  useEffect(() => {
    const handleProjectUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setProject(customEvent.detail);
      }
    };
    window.addEventListener("scholar_project_updated", handleProjectUpdated);
    return () => {
      window.removeEventListener("scholar_project_updated", handleProjectUpdated);
    };
  }, [setProject]);

  // Load ALL projects belonging to this user from localStorage
  const loadAllProjects = useCallback(() => {
    if (!user) return;
    const stateStr = localStorage.getItem(`${PROFILE_STATE_PREFIX}${user}`);
    if (!stateStr) return;
    try {
      const profile = JSON.parse(stateStr) as UserProfile;
      // Multi-project support: collect from projects[] array or create from projectState
      let projects: PaperProject[] = profile.projects || [];
      // Always ensure the current active project is included
      if (profile.projectState && !projects.find(p => p.id === profile.projectState?.id)) {
        projects = [profile.projectState, ...projects];
      }
      setAllProjects(projects.filter(Boolean));
    } catch (e) {
      console.error("Failed to load projects list:", e);
    }
  }, [user, setAllProjects]);

  useEffect(() => {
    loadAllProjects();
  }, [loadAllProjects, project]);

  // Client-side migration runner to support cost metrics, model preferences and usage logs
  const updateProject = useCallback((newFields: Partial<PaperProject>) => {
    if (!user || !projectRef.current) return;
    const updated = { ...projectRef.current, ...newFields, lastActivity: new Date().toISOString() };
    projectRef.current = updated; // synchronous, so a second call in the same tick sees this immediately
    setProject(updated);

    const savedStateStr = localStorage.getItem(`phd_profile_state_${user}`);
    let existingProfile: any = {};
    if (savedStateStr) {
      try {
        existingProfile = JSON.parse(savedStateStr);
      } catch (e) {
        console.error("Failed to parse existing profile for update:", e);
      }
    }

    // Update in projects array too
    const currentProjects: PaperProject[] = existingProfile.projects || [];
    const idx = currentProjects.findIndex((p: PaperProject) => p.id === updated.id);
    if (idx >= 0) {
      currentProjects[idx] = updated;
    } else {
      currentProjects.unshift(updated);
    }

    const profileData = {
      ...existingProfile,
      username: user,
      projectState: updated,
      projects: currentProjects
    };
    localStorage.setItem(`phd_profile_state_${user}`, JSON.stringify(profileData));

    // Dispatch event to notify other components of project state update
    window.dispatchEvent(new CustomEvent("scholar_project_updated", { detail: updated }));
    // Deliberately no `project` dependency — this reads/writes projectRef.current
    // instead, so its identity stays stable across renders and it always acts
    // on the true latest value regardless of when React last re-rendered.
  }, [user, setProject]);

  useEffect(() => {
    if (user && project) {
      const needsMigration =
        !project.usageLogs ||
        !project.costMetrics ||
        !project.modelPreferences ||
        !project.aiSettings;

      if (needsMigration) {
        console.log("[Migration Runner] Migrating schema to v2 for user:", user);

        const migratedProject = {
          ...project,
          aiSettings: project.aiSettings || { provider: "gemini" },
          usageLogs: project.usageLogs || [],
          costMetrics: project.costMetrics || { totalCost: 0, totalCalls: 0 },
          modelPreferences: project.modelPreferences || {
            grounding: "deepseek",
            dataDiscovery: "gemini",
            journalDiscovery: "gemini",
            requirements: "gemini",
            drafting: "qwen",
            qc: "deepseek",
            submissionPack: "gemini"
          }
        };

        updateProject(migratedProject);
      }
    }
  }, [user, project, updateProject]);

  // Create a fresh new research project
  const createNewProject = useCallback(() => {
    if (!user) return;
    const newProject = {
      ...DEFAULT_STATE(user),
      id: `${user}-${Date.now()}`,
      lastActivity: new Date().toISOString()
    };

    const savedStateStr = localStorage.getItem(`phd_profile_state_${user}`);
    let existingProfile: any = {};
    if (savedStateStr) {
      try { existingProfile = JSON.parse(savedStateStr); } catch (_) {}
    }
    const currentProjects: PaperProject[] = existingProfile.projects || [];
    // Ensure old active is persisted
    if (project && !currentProjects.find(p => p.id === project.id)) {
      currentProjects.unshift(project);
    }
    currentProjects.unshift(newProject);

    const profileData = {
      ...existingProfile,
      username: user,
      projectState: newProject,
      projects: currentProjects,
      activeProjectId: newProject.id
    };
    localStorage.setItem(`phd_profile_state_${user}`, JSON.stringify(profileData));
    setProject(newProject);
    setAllProjects(currentProjects);
    setViewMode("workspace");
    setActiveTab("workspace");
  }, [user, project, setProject, setAllProjects, setViewMode, setActiveTab]);

  // Switch to a different project from the dashboard
  const switchToProject = useCallback((projectId: string) => {
    const found = allProjects.find(p => p.id === projectId);
    if (!found) return;

    const savedStateStr = localStorage.getItem(`phd_profile_state_${user}`);
    let existingProfile: any = {};
    if (savedStateStr) {
      try { existingProfile = JSON.parse(savedStateStr); } catch (_) {}
    }
    const profileData = {
      ...existingProfile,
      projectState: found,
      activeProjectId: projectId
    };
    localStorage.setItem(`phd_profile_state_${user}`, JSON.stringify(profileData));
    setProject(found);
    setViewMode("workspace");
    setActiveTab("workspace");
  }, [user, allProjects, setProject, setViewMode, setActiveTab]);

  // Delete a project from the dashboard
  const deleteProject = useCallback((projectId: string) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to permanently delete this workspace? This action cannot be undone.")) return;

    const savedStateStr = localStorage.getItem(`phd_profile_state_${user}`);
    let existingProfile: any = {};
    if (savedStateStr) {
      try { existingProfile = JSON.parse(savedStateStr); } catch (_) {}
    }
    let currentProjects: PaperProject[] = existingProfile.projects || [];
    currentProjects = currentProjects.filter((p: PaperProject) => p.id !== projectId);

    // If we deleted the active project, switch to another or create a fresh one
    const wasActive = project?.id === projectId;
    let newActive = wasActive ? (currentProjects[0] || null) : project;
    if (wasActive && !newActive) {
      newActive = { ...DEFAULT_STATE(user), id: `${user}-${Date.now()}`, lastActivity: new Date().toISOString() };
      currentProjects.unshift(newActive);
    }

    const profileData = {
      ...existingProfile,
      username: user,
      projectState: newActive,
      projects: currentProjects,
      activeProjectId: newActive?.id
    };
    localStorage.setItem(`phd_profile_state_${user}`, JSON.stringify(profileData));
    setAllProjects(currentProjects);
    if (wasActive && newActive) {
      setProject(newActive);
    }
  }, [user, project, setProject, setAllProjects]);

  return {
    loadAllProjects,
    updateProject,
    createNewProject,
    switchToProject,
    deleteProject
  };
}
