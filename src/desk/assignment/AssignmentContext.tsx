import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo } from "react";
import type { CanonicalDocument, OutputTypeSpec, ProjectView, RubricReport } from "../types";
import {
  getDocument,
  getOutputTypeSpec,
  getProject,
  getRubric,
  saveIntakeAnswers,
  commitProjectToDatabase,
  isEphemeralProject,
  authedJsonFetch,
  UnauthenticatedError,
} from "../api";
import { getSupabaseClient, isSupabaseConfigured } from "../../services/supabaseClient";
import type {
  AssignmentStage,
  StageStatus,
  AcademicLevel,
  AssignmentType,
  AssignmentAnalysis,
  ResearchPlan,
  DiscoveredSource,
  EvidenceItem,
  ThinkingMap,
  OutlineSection,
  SubmissionCheckReport,
  TutorChatMessage,
  TutorMode,
  RubricGradeEstimation,
} from "./types";
import {
  ASSIGNMENT_STAGES,
  cleanAnswerString,
  extractStandardizedInstructions,
} from "./types";

interface AssignmentContextValue {
  projectId: string;
  project: ProjectView | null;
  document: CanonicalDocument | null;
  rubric: RubricReport | null;
  outputType: OutputTypeSpec | null;
  currentStage: AssignmentStage;
  stageStatuses: Record<AssignmentStage, StageStatus>;
  setStage: (stage: AssignmentStage, options?: { replace?: boolean }) => void;
  advanceStage: (nextStage?: AssignmentStage) => void;
  isLoading: boolean;
  error: string | null;

  // Key Domain Properties
  academicLevel: AcademicLevel;
  assignmentType: AssignmentType;
  targetWordCount: number;
  citationStyle: string;
  question: string;
  assignmentBriefText: string;

  // Analysis & Plan
  analysis: AssignmentAnalysis | null;
  setAnalysis: (analysis: AssignmentAnalysis) => Promise<void>;
  updateAnalysis: (delta: Partial<AssignmentAnalysis>) => Promise<void>;
  researchPlan: ResearchPlan | null;
  setResearchPlan: (plan: ResearchPlan) => Promise<void>;
  updatePlan: (delta: Partial<ResearchPlan>) => Promise<void>;
  setQuestion: (question: string) => Promise<void>;

  // Sources & Evidence
  sources: DiscoveredSource[];
  setSources: (sources: DiscoveredSource[]) => Promise<void>;
  toggleSourceStatus: (sourceId: string, status: "kept" | "removed") => Promise<void>;
  evidenceItems: EvidenceItem[];
  setEvidenceItems: (items: EvidenceItem[]) => Promise<void>;
  toggleEvidenceStatus: (evidenceId: string, status: "approved" | "rejected") => Promise<void>;
  addEvidenceItem: (item: Omit<EvidenceItem, "id">) => Promise<void>;

  // Thinking & Thesis
  thinkingMap: ThinkingMap | null;
  setThinkingMap: (map: ThinkingMap) => Promise<void>;

  // Outline & Drafting
  outline: OutlineSection[];
  setOutline: (outline: OutlineSection[]) => Promise<void>;
  updateSectionDraft: (sectionId: string, content: string) => Promise<void>;

  // Word Count Stats
  currentWordCount: number;
  remainingWordCount: number;
  wordCountPercentage: number;

  // Review & Finalize
  submissionReport: SubmissionCheckReport | null;
  setSubmissionReport: (report: SubmissionCheckReport) => Promise<void>;

  // AI Tutor & Rubric Estimator
  tutorMode: TutorMode;
  setTutorMode: (mode: TutorMode) => void;
  tutorMessages: TutorChatMessage[];
  sendTutorMessage: (message: string, overrideMode?: TutorMode, activeDraftText?: string) => Promise<void>;
  isTutorReplying: boolean;
  isEstimatingRubric: boolean;
  lastRubricEstimation: RubricGradeEstimation | null;
  estimateRubricGrade: (selectedSectionId?: string) => Promise<RubricGradeEstimation | null>;
  applyTutorSuggestionToDraft: (suggestion: { targetSectionId?: string; suggestedText: string; type?: string }) => Promise<void>;

  // Save Answers Helper
  saveAnswers: (updates: Record<string, any>) => Promise<void>;
  updateProjectAnswers: (updates: Record<string, any>) => Promise<void>;
  ensurePersisted: () => Promise<string>;
}

const AssignmentContext = createContext<AssignmentContextValue | null>(null);

export function useAssignmentWorkspace() {
  const context = useContext(AssignmentContext);
  if (!context) {
    throw new Error("useAssignmentWorkspace must be used within an AssignmentProvider");
  }
  return context;
}

export function AssignmentProvider({
  projectId,
  initialStage,
  onStageChangeCallback,
  children,
}: {
  projectId: string;
  initialStage: AssignmentStage | null;
  onStageChangeCallback: (stage: AssignmentStage, options?: { replace?: boolean }) => void;
  children: ReactNode;
}) {
  const [activeProjectId, setActiveProjectId] = useState(projectId);
  const [project, setProject] = useState<ProjectView | null>(null);
  const [document, setDocument] = useState<CanonicalDocument | null>(null);
  const [rubric, setRubric] = useState<RubricReport | null>(null);
  const [outputType, setOutputType] = useState<OutputTypeSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPersisted = (e: Event) => {
      const custom = e as CustomEvent<{ draftId: string; realId: string; project: ProjectView }>;
      if (custom.detail && custom.detail.draftId === activeProjectId) {
        setActiveProjectId(custom.detail.realId);
        setProject(custom.detail.project);
      }
    };
    window.addEventListener("scholar:project-persisted", onPersisted);
    return () => window.removeEventListener("scholar:project-persisted", onPersisted);
  }, [activeProjectId]);

  const ensurePersisted = useCallback(async (): Promise<string> => {
    if (!isEphemeralProject(activeProjectId)) {
      return activeProjectId;
    }
    const realProject = await commitProjectToDatabase(activeProjectId);
    setActiveProjectId(realProject.projectId);
    setProject(realProject);
    return realProject.projectId;
  }, [activeProjectId]);

  // Active stage
  const currentStage: AssignmentStage = initialStage ?? "understand";

  // AI Tutor & Rubric Estimator state
  const [tutorMode, setTutorMode] = useState<TutorMode>("socratic");
  const [tutorMessages, setTutorMessages] = useState<TutorChatMessage[]>([]);
  const [isTutorReplying, setIsTutorReplying] = useState(false);
  const [isEstimatingRubric, setIsEstimatingRubric] = useState(false);
  const [lastRubricEstimation, setLastRubricEstimation] = useState<RubricGradeEstimation | null>(null);

  // Load project data
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const proj = await getProject(activeProjectId);
      const [rub, doc] = proj.hasDocument
        ? await Promise.all([getRubric(activeProjectId), getDocument(activeProjectId)])
        : [null, null];
      setProject(proj);
      setDocument(doc);
      setRubric(rub);
      setOutputType(await getOutputTypeSpec(proj.outputTypeId).catch(() => null));

      if (initialStage === null) {
        const persistedStage = proj.answers?.["assignment_current_stage"];
        const targetStage: AssignmentStage =
          persistedStage && ASSIGNMENT_STAGES.some((s) => s.id === persistedStage)
            ? (persistedStage as AssignmentStage)
            : "understand";
        onStageChangeCallback(targetStage, { replace: true });
      }

      // Initialize AI Tutor greeting if empty
      if (tutorMessages.length === 0) {
        setTutorMessages([
          {
            id: "greeting",
            sender: "tutor",
            mode: "socratic",
            text: `👋 Hello! I am your Scholar Core Socratic Academic Tutor & Rubric Estimator.\n\nChoose an advising mode above: Engage in deep Socratic questioning, estimate your marking rubric grade band (1st / 2:1 / 2:2), stress-test counterarguments, or polish academic prose.`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
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
  }, [activeProjectId, onStageChangeCallback, initialStage]);

  useEffect(() => {
    load();
  }, [load]);

  // Persist answers
  const saveAnswers = useCallback(
    async (updates: Record<string, any>) => {
      if (!project) return;
      const standardized: Record<string, any> = { ...updates };
      if (updates.instructions !== undefined || updates.assignment_question !== undefined) {
        const text = cleanAnswerString(updates.instructions ?? updates.assignment_question ?? "");
        standardized.instructions = text;
        standardized.assignment_question = text;
        standardized.assignment_brief_text = text;
        standardized.research_topic = text;
        if (standardized.assignment_brief === "provisional" || text) {
          standardized.assignment_brief = text;
        }
      }
      if (updates.academicLevel !== undefined || updates.academic_level !== undefined) {
        const lvl = updates.academicLevel ?? updates.academic_level;
        standardized.academicLevel = lvl;
        standardized.academic_level = lvl;
      }
      if (updates.assignmentType !== undefined || updates.assignment_type !== undefined) {
        const t = updates.assignmentType ?? updates.assignment_type;
        standardized.assignmentType = t;
        standardized.assignment_type = t;
      }
      if (updates.targetWordCount !== undefined || updates.word_count !== undefined || updates.word_limit !== undefined) {
        const wc = updates.targetWordCount ?? updates.word_count ?? updates.word_limit;
        standardized.targetWordCount = Number(wc);
        standardized.target_word_count = Number(wc);
        standardized.word_count = Number(wc);
        standardized.word_limit = Number(wc);
      }
      if (updates.citationStyle !== undefined || updates.citation_style !== undefined) {
        const cs = updates.citationStyle ?? updates.citation_style;
        standardized.citationStyle = cs;
        standardized.citation_style = cs;
      }

      if (updates.title !== undefined || updates.assignment_title !== undefined || updates.updatedTitle !== undefined) {
        const titleVal = String(updates.title ?? updates.assignment_title ?? updates.updatedTitle ?? "").trim();
        if (titleVal) {
          standardized.title = titleVal;
          standardized.assignment_title = titleVal;
        }
      }

      const merged = { ...project.answers, ...standardized };
      setProject((prev) => (prev ? { ...prev, answers: merged } : null));

      try {
        await saveIntakeAnswers(activeProjectId, merged);
      } catch (err) {
        console.error("Failed to persist assignment answers:", err);
      }
    },
    [project, activeProjectId]
  );

  // Stage Navigation
  const setStage = useCallback(
    (stage: AssignmentStage, options?: { replace?: boolean }) => {
      saveAnswers({ assignment_current_stage: stage });
      onStageChangeCallback(stage, options);
    },
    [onStageChangeCallback, saveAnswers]
  );

  const advanceStage = useCallback(
    (nextStage?: AssignmentStage) => {
      if (nextStage) {
        setStage(nextStage);
        return;
      }
      const currentIndex = ASSIGNMENT_STAGES.findIndex((s) => s.id === currentStage);
      if (currentIndex >= 0 && currentIndex < ASSIGNMENT_STAGES.length - 1) {
        const next = ASSIGNMENT_STAGES[currentIndex + 1].id;
        setStage(next);
      }
    },
    [currentStage, setStage]
  );

  // Extract core properties from project answers
  const answers = project?.answers || {};
  const academicLevel: AcademicLevel =
    (answers["academicLevel"] as AcademicLevel) ||
    (answers["academic_level"] as AcademicLevel) ||
    "undergraduate";
  const assignmentType: AssignmentType =
    (answers["assignmentType"] as AssignmentType) ||
    (answers["assignment_type"] as AssignmentType) ||
    "essay";
  const targetWordCount = Number(
    answers["targetWordCount"] ||
    answers["target_word_count"] ||
    answers["word_count"] ||
    answers["word_limit"] ||
    2000
  );
  const citationStyle =
    cleanAnswerString(answers["citationStyle"]) ||
    cleanAnswerString(answers["citation_style"]) ||
    "apa7";
  const question = extractStandardizedInstructions(answers);
  const assignmentBriefText =
    cleanAnswerString(answers["assignment_brief_text"]) ||
    cleanAnswerString(answers["briefText"]) ||
    cleanAnswerString(answers["brief"]) ||
    question;

  // Structured entities
  const analysis: AssignmentAnalysis | null = answers["assignment_analysis"]
    ? (typeof answers["assignment_analysis"] === "string"
        ? JSON.parse(answers["assignment_analysis"])
        : answers["assignment_analysis"])
    : null;

  const rawPlan = answers["assignment_plan"] || answers["assignment_research_plan"];
  const researchPlan: ResearchPlan | null = rawPlan
    ? (typeof rawPlan === "string"
        ? JSON.parse(rawPlan)
        : rawPlan)
    : null;

  const sources: DiscoveredSource[] = useMemo(() => {
    const raw = answers["assignment_sources"];
    if (!raw) return [];
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return [];
    }
  }, [answers["assignment_sources"]]);

  const evidenceItems: EvidenceItem[] = useMemo(() => {
    const raw = answers["assignment_evidence_items"];
    if (!raw) return [];
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return [];
    }
  }, [answers["assignment_evidence_items"]]);

  const thinkingMap: ThinkingMap | null = answers["assignment_thinking_map"]
    ? (typeof answers["assignment_thinking_map"] === "string"
        ? JSON.parse(answers["assignment_thinking_map"])
        : answers["assignment_thinking_map"])
    : null;

  const outline: OutlineSection[] = useMemo(() => {
    const raw = answers["assignment_outline"];
    if (!raw) return [];
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return [];
    }
  }, [answers["assignment_outline"]]);

  const submissionReport: SubmissionCheckReport | null = answers["assignment_submission_report"]
    ? (typeof answers["assignment_submission_report"] === "string"
        ? JSON.parse(answers["assignment_submission_report"])
        : answers["assignment_submission_report"])
    : null;

  // Setters
  const setAnalysis = useCallback(
    async (newAnalysis: AssignmentAnalysis) => {
      await saveAnswers({
        assignment_analysis: typeof newAnalysis === "string" ? newAnalysis : JSON.stringify(newAnalysis),
      });
    },
    [saveAnswers]
  );

  const updateAnalysis = useCallback(
    async (delta: Partial<AssignmentAnalysis>) => {
      if (!analysis) return;
      const updated: AssignmentAnalysis = {
        ...analysis,
        ...delta,
      };
      await setAnalysis(updated);
    },
    [analysis, setAnalysis]
  );

  const setResearchPlan = useCallback(
    async (newPlan: ResearchPlan) => {
      await saveAnswers({
        assignment_plan: typeof newPlan === "string" ? newPlan : JSON.stringify(newPlan),
        assignment_research_plan: typeof newPlan === "string" ? newPlan : JSON.stringify(newPlan),
      });
    },
    [saveAnswers]
  );

  const updatePlan = useCallback(
    async (delta: Partial<ResearchPlan>) => {
      const current = researchPlan || {
        coreQuestions: [],
        mainConcepts: [],
        keyDebates: [],
        evidenceTypesNeeded: [],
        searchStrategies: [],
        outOfScopeTopics: [],
        approvedByUser: false,
      };
      const updated: ResearchPlan = {
        ...current,
        ...delta,
      };
      await setResearchPlan(updated);
    },
    [researchPlan, setResearchPlan]
  );

  const setQuestion = useCallback(
    async (newQuestion: string) => {
      await saveAnswers({ assignment_question: newQuestion });
    },
    [saveAnswers]
  );

  const setSources = useCallback(
    async (newSources: DiscoveredSource[]) => {
      await saveAnswers({ assignment_sources: newSources });
    },
    [saveAnswers]
  );

  const toggleSourceStatus = useCallback(
    async (sourceId: string, status: "kept" | "removed") => {
      const updated = sources.map((s) => (s.id === sourceId ? { ...s, status } : s));
      await setSources(updated);
    },
    [sources, setSources]
  );

  const setEvidenceItems = useCallback(
    async (items: EvidenceItem[]) => {
      await saveAnswers({ assignment_evidence_items: items });
    },
    [saveAnswers]
  );

  const toggleEvidenceStatus = useCallback(
    async (evidenceId: string, status: "approved" | "rejected") => {
      const updated = evidenceItems.map((e) => (e.id === evidenceId ? { ...e, status } : e));
      await setEvidenceItems(updated);
    },
    [evidenceItems, setEvidenceItems]
  );

  const addEvidenceItem = useCallback(
    async (item: Omit<EvidenceItem, "id">) => {
      const newItem: EvidenceItem = {
        ...item,
        id: `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      };
      await setEvidenceItems([...evidenceItems, newItem]);
    },
    [evidenceItems, setEvidenceItems]
  );

  const setThinkingMap = useCallback(
    async (map: ThinkingMap) => {
      await saveAnswers({ assignment_thinking_map: map });
    },
    [saveAnswers]
  );

  const setOutline = useCallback(
    async (newOutline: OutlineSection[]) => {
      await saveAnswers({ assignment_outline: newOutline });
    },
    [saveAnswers]
  );

  const updateSectionDraft = useCallback(
    async (sectionId: string, content: string) => {
      const words = content.trim() ? content.trim().split(/\s+/).length : 0;
      const updated = outline.map((s) =>
        s.id === sectionId ? { ...s, draftContent: content, currentWordCount: words } : s
      );
      await setOutline(updated);
    },
    [outline, setOutline]
  );

  const setSubmissionReport = useCallback(
    async (report: SubmissionCheckReport) => {
      await saveAnswers({ assignment_submission_report: report });
    },
    [saveAnswers]
  );

  // Word count calculations
  const currentWordCount = useMemo(() => {
    return outline.reduce((sum, sec) => sum + (sec.currentWordCount || 0), 0);
  }, [outline]);

  const remainingWordCount = Math.max(0, targetWordCount - currentWordCount);
  const wordCountPercentage = targetWordCount > 0 ? Math.min(100, Math.round((currentWordCount / targetWordCount) * 100)) : 0;

  // AI Tutor chat
  const sendTutorMessage = useCallback(
    async (text: string, overrideMode?: TutorMode, activeDraftText?: string) => {
      const modeToUse = overrideMode || tutorMode;
      const userMsg: TutorChatMessage = {
        id: `msg-${Date.now()}`,
        sender: "user",
        mode: modeToUse,
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setTutorMessages((prev) => [...prev, userMsg]);
      setIsTutorReplying(true);

      try {
        const response = await authedJsonFetch(`/api/projects/${projectId}/assignment/tutor-chat`, "POST", {
          message: text,
          mode: modeToUse,
          stage: currentStage,
          academicLevel,
          assignmentType,
          question,
          targetWordCount,
          currentWordCount,
          analysis,
          plan: researchPlan,
          outline,
          evidence: evidenceItems.filter((e) => e.status === "approved"),
          thesis: thinkingMap?.customThesis || thinkingMap?.thesisOptions?.find((t) => t.id === thinkingMap?.selectedThesisId)?.statement,
          activeDraftText,
        });

        if (!response.ok) throw new Error("Failed to reach AI Tutor");
        const data = await response.json();

        // Apply bidirectional patch if returned by the tutor
        if (data.patch) {
          if (data.patch.plan) {
            await updatePlan(data.patch.plan);
          }
          if (data.patch.analysis) {
            await updateAnalysis(data.patch.analysis);
          }
          if (data.patch.question) {
            await setQuestion(data.patch.question);
          }
        }

        if (data.rubricEstimation) {
          setLastRubricEstimation(data.rubricEstimation);
        }

        const replyMsg: TutorChatMessage = {
          id: `tutor-${Date.now()}`,
          sender: "tutor",
          mode: modeToUse,
          text: data.reply || "I am analyzing your query. How else can I assist your writing?",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          socraticQuestions: data.socraticQuestions,
          rubricEstimation: data.rubricEstimation,
          counterArguments: data.counterArguments,
          actionableSuggestion: data.suggestion,
          patch: data.patch,
        };
        setTutorMessages((prev) => [...prev, replyMsg]);
      } catch (err: any) {
        const errorMsg: TutorChatMessage = {
          id: `err-${Date.now()}`,
          sender: "tutor",
          text: `I encountered an issue generating a response: ${err.message}. Please try again.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setTutorMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsTutorReplying(false);
      }
    },
    [projectId, tutorMode, currentStage, academicLevel, assignmentType, question, targetWordCount, currentWordCount, outline, evidenceItems, thinkingMap, analysis, researchPlan, updatePlan, updateAnalysis, setQuestion]
  );

  // Estimate Rubric Grade
  const estimateRubricGrade = useCallback(
    async (selectedSectionId?: string): Promise<RubricGradeEstimation | null> => {
      setIsEstimatingRubric(true);
      try {
        const res = await authedJsonFetch(`/api/projects/${projectId}/assignment/estimate-rubric`, "POST", {
          question,
          academicLevel,
          assignmentType,
          targetWordCount,
          outline,
          selectedSectionId,
        });
        if (!res.ok) throw new Error("Failed to estimate rubric grade");
        const data: RubricGradeEstimation = await res.json();
        setLastRubricEstimation(data);

        // Also add a tutor message with this estimation
        const estMsg: TutorChatMessage = {
          id: `rubric-est-${Date.now()}`,
          sender: "tutor",
          mode: "rubric",
          text: `📊 **Rubric Grade Assessment:** Your current draft is estimated at **${data.bandLabel}** (${data.overallScore}%).\n\n${data.summary}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          rubricEstimation: data,
        };
        setTutorMessages((prev) => [...prev, estMsg]);
        return data;
      } catch (err) {
        console.error("Failed to estimate rubric grade:", err);
        return null;
      } finally {
        setIsEstimatingRubric(false);
      }
    },
    [projectId, question, academicLevel, assignmentType, targetWordCount, outline]
  );

  // Apply Tutor Suggestion to Draft
  const applyTutorSuggestionToDraft = useCallback(
    async (suggestion: { targetSectionId?: string; suggestedText: string; type?: string }) => {
      if (!suggestion.suggestedText) return;
      const targetSec = suggestion.targetSectionId
        ? outline.find((s) => s.id === suggestion.targetSectionId)
        : outline[0];
      if (!targetSec) return;

      const currentText = targetSec.draftContent || "";
      const updatedText = currentText
        ? `${currentText}\n\n${suggestion.suggestedText}`
        : suggestion.suggestedText;

      await updateSectionDraft(targetSec.id, updatedText);
    },
    [outline, updateSectionDraft]
  );

  // Compute status for all 8 stages
  const stageStatuses: Record<AssignmentStage, StageStatus> = useMemo(() => {
    const hasUnderstand = Boolean(question && targetWordCount > 0 && citationStyle);
    const hasAnalysis = Boolean(analysis && analysis.approvedByUser);
    const hasPlan = Boolean(researchPlan && researchPlan.approvedByUser);
    const hasSources = sources.filter((s) => s.status === "kept").length >= 2;
    const hasEvidence = evidenceItems.filter((e) => e.status === "approved").length >= 2;
    const hasThinking = Boolean(thinkingMap && (thinkingMap.selectedThesisId || thinkingMap.customThesis));
    const hasStructure = outline.length >= 3;
    const hasDraft = currentWordCount >= Math.min(200, targetWordCount * 0.3);
    const hasReport = Boolean(submissionReport);

    return {
      understand: hasUnderstand && hasAnalysis ? "completed" : currentStage === "understand" ? "active" : "needs_review",
      plan: hasPlan ? "completed" : currentStage === "plan" ? "active" : hasUnderstand ? "available" : "locked",
      research: hasSources ? "completed" : currentStage === "research" ? "active" : hasPlan ? "available" : "locked",
      evidence: hasEvidence ? "completed" : currentStage === "evidence" ? "active" : hasSources ? "available" : "locked",
      think: hasThinking ? "completed" : currentStage === "think" ? "active" : hasEvidence ? "available" : "locked",
      structure: hasStructure ? "completed" : currentStage === "structure" ? "active" : hasThinking ? "available" : "locked",
      draft: hasDraft ? "completed" : currentStage === "draft" ? "active" : hasStructure ? "available" : "locked",
      final: hasReport ? "completed" : currentStage === "final" ? "active" : hasDraft ? "available" : "locked",
    };
  }, [
    question,
    targetWordCount,
    citationStyle,
    analysis,
    researchPlan,
    sources,
    evidenceItems,
    thinkingMap,
    outline,
    currentWordCount,
    submissionReport,
    currentStage,
  ]);

  return (
    <AssignmentContext.Provider
      value={{
        projectId: activeProjectId,
        ensurePersisted,
        project,
        document,
        rubric,
        outputType,
        currentStage,
        stageStatuses,
        setStage,
        advanceStage,
        isLoading,
        error,
        academicLevel,
        assignmentType,
        targetWordCount,
        citationStyle,
        question,
        assignmentBriefText,
        analysis,
        setAnalysis,
        updateAnalysis,
        researchPlan,
        setResearchPlan,
        updatePlan,
        setQuestion,
        sources,
        setSources,
        toggleSourceStatus,
        evidenceItems,
        setEvidenceItems,
        toggleEvidenceStatus,
        addEvidenceItem,
        thinkingMap,
        setThinkingMap,
        outline,
        setOutline,
        updateSectionDraft,
        currentWordCount,
        remainingWordCount,
        wordCountPercentage,
        submissionReport,
        setSubmissionReport,
        tutorMode,
        setTutorMode,
        tutorMessages,
        sendTutorMessage,
        isTutorReplying,
        isEstimatingRubric,
        lastRubricEstimation,
        estimateRubricGrade,
        applyTutorSuggestionToDraft,
        saveAnswers,
        updateProjectAnswers: saveAnswers,
      }}
    >
      {children}
    </AssignmentContext.Provider>
  );
}
