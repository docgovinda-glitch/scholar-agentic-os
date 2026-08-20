import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import type { CanonicalDocument, OutputTypeSpec, ProjectView, RubricReport } from "../types";
import type { ResearchStage, StageStatus } from "./types";
import { getDocument, getOutputTypeSpec, getProject, getRubric, UnauthenticatedError } from "../api";
import { computeStageStatuses } from "./utils";
import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";

interface ResearchContextValue {
  projectId: string;
  project: ProjectView | null;
  document: CanonicalDocument | null;
  rubric: RubricReport | null;
  outputType: OutputTypeSpec | null;
  currentStage: ResearchStage;
  stageStatuses: Record<ResearchStage, StageStatus>;
  setProject: (project: ProjectView) => void;
  setStage: (stage: ResearchStage, options?: { replace?: boolean }) => void;
  advanceStage: (nextStage: ResearchStage) => void;
  error: string | null;
  isLoading: boolean;
}

const ResearchContext = createContext<ResearchContextValue | null>(null);

export function useResearchWorkspace() {
  const context = useContext(ResearchContext);
  if (!context) {
    throw new Error("useResearchWorkspace must be used within a ResearchProvider");
  }
  return context;
}

export function ResearchProvider({
  projectId,
  initialStage,
  onStageChangeCallback,
  children,
}: {
  projectId: string;
  initialStage: ResearchStage | null;
  onStageChangeCallback: (stage: ResearchStage, options?: { replace?: boolean }) => void;
  children: ReactNode;
}) {
  const [project, setProject] = useState<ProjectView | null>(null);
  const [document, setDocument] = useState<CanonicalDocument | null>(null);
  const [rubric, setRubric] = useState<RubricReport | null>(null);
  const [outputType, setOutputType] = useState<OutputTypeSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const currentStage = initialStage ?? "definition";

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const proj = await getProject(projectId);
      const [rub, doc] = proj.hasDocument 
        ? await Promise.all([getRubric(projectId), getDocument(projectId)])
        : [null, null];
      setProject(proj);
      setDocument(doc);
      setRubric(rub);
      setOutputType(await getOutputTypeSpec(proj.outputTypeId).catch(() => null));

      if (initialStage === null) {
        onStageChangeCallback("definition", { replace: true });
      }
    } catch (e) {
      setError(
        e instanceof UnauthenticatedError
          ? "Your session has expired. Sign in again to continue."
          : (e as Error).message
      );
    } finally {
      setIsLoading(false);
    }
  }, [projectId, onStageChangeCallback, initialStage]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    
    const client = getSupabaseClient();
    
    const channel = client
      .channel(`project-sync-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("Realtime Sync: Project updated remotely. Reloading workspace state...", payload);
          // Reload the workspace state from the server to guarantee we have 
          // the latest parsed document, rubric, and project data.
          load();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [projectId, load]);

  const stageStatuses = computeStageStatuses(project);

  const setStage = useCallback((stage: ResearchStage, options?: { replace?: boolean }) => {
    onStageChangeCallback(stage, options);
  }, [onStageChangeCallback]);

  const advanceStage = useCallback((nextStage: ResearchStage) => {
    onStageChangeCallback(nextStage);
  }, [onStageChangeCallback]);

  const value: ResearchContextValue = {
    projectId,
    project,
    document,
    rubric,
    outputType,
    currentStage,
    stageStatuses,
    setProject,
    setStage,
    advanceStage,
    error,
    isLoading,
  };

  return (
    <ResearchContext.Provider value={value}>
      {children}
    </ResearchContext.Provider>
  );
}
