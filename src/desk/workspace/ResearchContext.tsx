import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import type { CanonicalDocument, OutputTypeSpec, ProjectView, RubricReport } from "../types";
import type { ResearchStage, StageStatus } from "./types";
import { isResearchStage } from "./types";
import { getDocument, getOutputTypeSpec, getProject, getRubric, saveIntakeAnswers, setGlobalManualModelOverride, UnauthenticatedError } from "../api";
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
  manualModelOverride: { providerId: string; modelId?: string } | null;
  setManualModelOverride: (override: { providerId: string; modelId?: string } | null) => void;
  chapterId: string | null;
  setChapterId: (id: string | null) => void;
  aiExhaustedError: string | null;
  setAiExhaustedError: (err: string | null) => void;
  fallbackToast: string | null;
  setFallbackToast: (msg: string | null) => void;
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
  const [manualModelOverride, setManualModelOverride] = useState<{ providerId: string; modelId?: string } | null>(null);
  const [aiExhaustedError, setAiExhaustedError] = useState<string | null>(null);
  const [fallbackToast, setFallbackToast] = useState<string | null>(null);

  const currentStage = initialStage ?? "definition";
  const latestStageRef = React.useRef<ResearchStage | null>(initialStage);

  useEffect(() => {
    if (initialStage) {
      latestStageRef.current = initialStage;
    }
  }, [initialStage]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const proj = await getProject(projectId);
      const [rub, doc] = proj.hasDocument 
        ? await Promise.all([getRubric(projectId), getDocument(projectId)])
        : [null, null];

      // Prevent stale remote state from overwriting a newly selected in-flight stage
      if (latestStageRef.current && proj.answers?.["current_stage"] !== latestStageRef.current) {
        proj.answers = {
          ...(proj.answers || {}),
          current_stage: latestStageRef.current,
        };
      }

      setProject(proj);
      setDocument(doc);
      setRubric(rub);
      setOutputType(await getOutputTypeSpec(proj.outputTypeId).catch(() => null));

      if (initialStage === null) {
        const persistedStage = proj.answers?.["current_stage"];
        const targetStage: ResearchStage = (persistedStage && isResearchStage(persistedStage)) ? (persistedStage as ResearchStage) : "definition";
        onStageChangeCallback(targetStage, { replace: true });
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
          // P4-2: dev-only log — eliminated by the production build (import.meta.env.DEV is false → tree-shaken).
          if (import.meta.env.DEV) {
            console.log("Realtime Sync: Project updated remotely. Reloading workspace state...", payload);
          }
          load();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [projectId, load]);

  const stageStatuses = computeStageStatuses(project);

  const setStage = useCallback(async (stage: ResearchStage, options?: { replace?: boolean }) => {
    if (!isResearchStage(stage)) {
      const msg = `[ResearchNavigation] Blocked invalid stage navigation to: "${String(stage)}". Stage must exist in STAGE_MAP.`;
      console.error(msg);
      setError(msg);
      return;
    }

    const previousStage = currentStage;
    const previousAnswers = project?.answers;

    latestStageRef.current = stage;
    setProject((prev) => (prev ? { ...prev, answers: { ...prev.answers, current_stage: stage } } : prev));
    onStageChangeCallback(stage, options);

    try {
      const updated = await saveIntakeAnswers(projectId, { current_stage: stage });
      setProject(updated);
    } catch (err: any) {
      console.error("[ResearchNavigation] Failed to persist stage change, reconciling state:", err);
      latestStageRef.current = previousStage;
      setProject((prev) => (prev ? { ...prev, answers: previousAnswers || prev.answers } : prev));
      onStageChangeCallback(previousStage);
      setError(`Failed to switch to stage "${stage}". Reverted to "${previousStage}".`);
    }
  }, [currentStage, onStageChangeCallback, project?.answers, projectId]);

  useEffect(() => {
    setGlobalManualModelOverride(manualModelOverride);
  }, [manualModelOverride]);

  const advanceStage = useCallback(async (nextStage: ResearchStage) => {
    if (!isResearchStage(nextStage)) {
      const msg = `[ResearchNavigation] Blocked invalid stage advance to: "${String(nextStage)}". Stage must exist in STAGE_MAP.`;
      console.error(msg);
      setError(msg);
      return;
    }

    const previousStage = currentStage;
    const previousAnswers = project?.answers;

    latestStageRef.current = nextStage;
    setProject((prev) => (prev ? { ...prev, answers: { ...prev.answers, current_stage: nextStage } } : prev));
    onStageChangeCallback(nextStage);

    try {
      const updated = await saveIntakeAnswers(projectId, { current_stage: nextStage });
      setProject(updated);
    } catch (err: any) {
      console.error("[ResearchNavigation] Failed to persist stage progression, reconciling state:", err);
      latestStageRef.current = previousStage;
      setProject((prev) => (prev ? { ...prev, answers: previousAnswers || prev.answers } : prev));
      onStageChangeCallback(previousStage);
      setError(`Failed to advance to stage "${nextStage}". Reverted to "${previousStage}".`);
    }
  }, [currentStage, onStageChangeCallback, project?.answers, projectId]);

  const [chapterId, setChapterId] = useState<string | null>(null);

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
    manualModelOverride,
    setManualModelOverride,
    chapterId,
    setChapterId,
    aiExhaustedError,
    setAiExhaustedError,
    fallbackToast,
    setFallbackToast,
  };

  return (
    <ResearchContext.Provider value={value}>
      {children}
    </ResearchContext.Provider>
  );
}
