import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import type { CanonicalDocument, OutputTypeSpec, ProjectView, RubricReport } from "../types";
import type { ResearchStage, StageStatus, JournalStudioMode } from "./types";
import { isResearchStage, getStudioModeForStage, isStudioMode, JOURNAL_STUDIO_MODES } from "./types";
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
  currentMode: JournalStudioMode;
  stageStatuses: Record<ResearchStage, StageStatus>;
  setProject: (project: ProjectView) => void;
  setStage: (stage: ResearchStage, options?: { replace?: boolean }) => void;
  setMode: (mode: JournalStudioMode) => void;
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

export function useOptionalResearchWorkspace() {
  return useContext(ResearchContext);
}

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
  const [currentMode, setCurrentModeState] = useState<JournalStudioMode>(() => {
    return getStudioModeForStage(currentStage).id;
  });
  const latestStageRef = React.useRef<ResearchStage | null>(initialStage);
  // Read through refs so that moving between views (which changes the URL
  // stage) does not reload the whole project.
  const initialStageRef = React.useRef(initialStage);
  initialStageRef.current = initialStage;
  const onStageChangeRef = React.useRef(onStageChangeCallback);
  onStageChangeRef.current = onStageChangeCallback;
  const loadedRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (initialStage) {
      latestStageRef.current = initialStage;
      setCurrentModeState(getStudioModeForStage(initialStage).id);
    }
  }, [initialStage]);

  const load = useCallback(async () => {
    // Only the first load blanks the workspace; a later refresh (remote
    // update) swaps the data in place so open work isn't unmounted.
    if (loadedRef.current !== projectId) setIsLoading(true);
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
          current_mode: getStudioModeForStage(latestStageRef.current).id,
        };
      }

      setProject(proj);
      setDocument(doc);
      setRubric(rub);
      setOutputType(await getOutputTypeSpec(proj.outputTypeId).catch(() => null));

      const persistedStage = proj.answers?.["current_stage"];
      const targetStage: ResearchStage = (persistedStage && isResearchStage(persistedStage)) ? (persistedStage as ResearchStage) : "definition";

      const persistedMode = proj.answers?.["current_mode"];
      if (persistedMode && isStudioMode(persistedMode)) {
        setCurrentModeState(persistedMode);
      } else {
        setCurrentModeState(getStudioModeForStage(targetStage).id);
      }

      if (initialStageRef.current === null) {
        onStageChangeRef.current(targetStage, { replace: true });
      }
      loadedRef.current = projectId;
    } catch (e) {
      setError(
        e instanceof UnauthenticatedError
          ? "Your session has expired. Sign in again to continue."
          : (e as Error).message
      );
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

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
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (import.meta.env.DEV) {
            console.warn(`[Realtime Sync] Project sync channel ${status}: ${err?.message || "connection error"}. Gracefully using REST.`);
          }
          // Detach channel immediately to prevent retry storms
          client.removeChannel(channel).catch(() => {});
        }
      });

    return () => {
      client.removeChannel(channel).catch(() => {});
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
    const targetMode = getStudioModeForStage(stage).id;

    latestStageRef.current = stage;
    setCurrentModeState(targetMode);
    setProject((prev) => (prev ? {
      ...prev,
      answers: { ...prev.answers, current_stage: stage, current_mode: targetMode }
    } : prev));
    onStageChangeCallback(stage, options);

    try {
      const updated = await saveIntakeAnswers(projectId, { current_stage: stage, current_mode: targetMode });
      setProject(updated);
    } catch (err: unknown) {
      console.error("[ResearchNavigation] Failed to persist stage change, reconciling state:", err);
      latestStageRef.current = previousStage;
      setCurrentModeState(getStudioModeForStage(previousStage).id);
      setProject((prev) => (prev ? { ...prev, answers: previousAnswers || prev.answers } : prev));
      onStageChangeCallback(previousStage);
      setError(`Failed to switch to stage "${stage}". Reverted to "${previousStage}".`);
    }
  }, [currentStage, onStageChangeCallback, project?.answers, projectId]);

  const setMode = useCallback(async (mode: JournalStudioMode) => {
    // "audit" is the older name of the Delivery mode.
    if (mode === "audit") mode = "audit_export";
    setCurrentModeState(mode);
    const modeDef = JOURNAL_STUDIO_MODES.find((m) => m.id === mode);
    const targetStage = modeDef?.primaryStage || "definition";
    const previousStage = currentStage;
    const previousAnswers = project?.answers;

    latestStageRef.current = targetStage;
    setProject((prev) => (prev ? {
      ...prev,
      answers: { ...prev.answers, current_mode: mode, current_stage: targetStage }
    } : prev));
    onStageChangeCallback(targetStage);

    try {
      const updated = await saveIntakeAnswers(projectId, { current_mode: mode, current_stage: targetStage });
      setProject(updated);
    } catch (err: unknown) {
      console.warn("[ResearchNavigation] Failed to persist mode change:", err);
      latestStageRef.current = previousStage;
      setCurrentModeState(getStudioModeForStage(previousStage).id);
      setProject((prev) => (prev ? { ...prev, answers: previousAnswers || prev.answers } : prev));
      onStageChangeCallback(previousStage);
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
    const targetMode = getStudioModeForStage(nextStage).id;

    latestStageRef.current = nextStage;
    setCurrentModeState(targetMode);
    setProject((prev) => (prev ? {
      ...prev,
      answers: { ...prev.answers, current_stage: nextStage, current_mode: targetMode }
    } : prev));
    onStageChangeCallback(nextStage);

    try {
      const updated = await saveIntakeAnswers(projectId, { current_stage: nextStage, current_mode: targetMode });
      setProject(updated);
    } catch (err: unknown) {
      console.error("[ResearchNavigation] Failed to persist stage progression, reconciling state:", err);
      latestStageRef.current = previousStage;
      setCurrentModeState(getStudioModeForStage(previousStage).id);
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
    currentMode,
    stageStatuses,
    setProject,
    setStage,
    setMode,
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
