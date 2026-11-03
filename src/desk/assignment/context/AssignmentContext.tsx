import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useMemo, useRef } from "react";
import type { CanonicalDocument, OutputTypeSpec, ProjectView, RubricReport } from "../../types";
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
} from "../../api";
import type {
  AssignmentPhaseId,
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
  SectionBreakdown,
  AssignmentProjectState,
  UploadedSourceDocument,
  AssignmentBriefRubricCriterion,
  CitationAuditResult,
  RubricScoreReport,
  SectionBudgetItem,
  WritingToneConfig,
  WritingTonePreset,
  WritingStyleConfig,
  WritingStylePreset,
  AssignmentStructure,
  FlowAuditResult,
} from "../types";
import {
  ASSIGNMENT_PHASES,
  ASSIGNMENT_STAGES,
  cleanAnswerString,
  extractStandardizedInstructions,
  normalizeProjectAnswers,
  normalizeAssignmentPhase,
  AssignmentDraftingSection,
  structureToInternalSections,
  structureToSectionBudgets,
} from "../types";
import { generateDynamicAssignmentStructure } from "../services/outlineService";
import {
  decomposeWordBudget,
  tuneSectionsToQuestion,
  type InternalSectionPlan,
} from "../services/invisibleChunkerService";
import { auditCitations, evaluateRubricCompliance, auditFlowAndTransitions } from "../services/submissionAuditService";
import { getCitationCoverage } from "../services/citationAnchoringService";
import { generateReferenceListBlock } from "../services/referenceListGenerator";
import { stripCircularReferences } from "../../../utils/briefExtractor";
import type { CourseworkExecutionMode } from "../../../features/coursework/types/orchestrator";
import { safeParseAnswerField } from "../../../shared/projectStateSchema";

export interface AssignmentContextValue {
  projectId: string;
  project: ProjectView | null;
  document: CanonicalDocument | null;
  rubric: RubricReport | null;
  outputType: OutputTypeSpec | null;

  // Approved 4-Phase Architecture
  currentPhase: AssignmentPhaseId;
  setPhase: (phase: AssignmentPhaseId, options?: { replace?: boolean }) => void;
  phaseStatuses: Record<AssignmentPhaseId, "active" | "completed" | "upcoming">;
  advancePhase: (nextPhase?: AssignmentPhaseId) => void;

  // Backward-compatible Stage Aliases
  stage: AssignmentStage;
  currentStage: AssignmentStage;
  setStage: (stage: AssignmentStage, options?: { replace?: boolean }) => void;
  stageStatuses: Record<AssignmentStage, StageStatus>;
  advanceStage: (nextStage?: AssignmentStage) => void;

  // Unified 4-Phase Project State Model (Section 4.2)
  projectState: AssignmentProjectState;

  isLoading: boolean;
  error: string | null;

  // Minimal vs Detailed Execution Mode (OT-10 Parity)
  executionMode: CourseworkExecutionMode;
  setExecutionMode: (mode: CourseworkExecutionMode) => Promise<void>;

  // Key Domain Properties
  academicLevel: AcademicLevel;
  assignmentType: AssignmentType;
  targetWordCount: number;
  citationStyle: string;
  sections?: SectionBreakdown;
  setSections: (sections: SectionBreakdown) => Promise<void>;
  writingStyle: WritingStyleConfig;
  setWritingStyle: (style: WritingStyleConfig) => Promise<void>;
  writingTone: WritingToneConfig;
  setWritingTone: (tone: WritingToneConfig) => Promise<void>;
  structure: AssignmentStructure;
  /** Whether the latest changes have reached the server. */
  saveStatus: "saved" | "saving" | "error";
  setStructure: (structure: AssignmentStructure) => Promise<void>;
  sectionBudgets: SectionBudgetItem[];
  addCustomSection: (title: string, targetWordCount: number) => Promise<void>;
  updateSectionBudget: (id: string, updates: Partial<{ title: string; targetWordCount: number }>) => Promise<void>;
  removeCustomSection: (id: string) => Promise<void>;
  resetSectionBudgets: (totalWords?: number) => Promise<void>;
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
  approvedSourceIds: string[];
  setApprovedSourceIds: (ids: string[]) => Promise<void>;
  toggleSourceApproval: (sourceId: string) => Promise<void>;
  dismissSource: (sourceId: string, replacement?: DiscoveredSource) => Promise<void>;
  userUploadedSources: UploadedSourceDocument[];
  addUserUploadedSource: (doc: UploadedSourceDocument) => Promise<void>;
  removeUserUploadedSource: (docId: string) => Promise<void>;
  evidenceItems: EvidenceItem[];
  setEvidenceItems: (items: EvidenceItem[]) => Promise<void>;
  toggleEvidenceStatus: (evidenceId: string, status: "approved" | "rejected") => Promise<void>;
  addEvidenceItem: (item: Omit<EvidenceItem, "id">) => Promise<void>;

  // Thinking & Thesis
  thinkingMap: ThinkingMap | null;
  setThinkingMap: (map: ThinkingMap) => Promise<void>;

  // Outline & Drafting (Phase 3)
  outline: OutlineSection[];
  setOutline: (outline: OutlineSection[]) => Promise<void>;
  updateSectionDraft: (sectionId: string, content: string) => Promise<void>;
  internalSections: AssignmentDraftingSection[];
  activeSectionId: string | null;
  setActiveSectionId: (id: string | null) => void;
  updateSectionContent: (sectionId: string, content: string) => Promise<void>;
  updateSectionTitle: (sectionId: string, newTitle: string) => Promise<void>;
  tuneOutlineWithQuestion: () => Promise<AssignmentDraftingSection[]>;
  /** Writes the outline from the brief with the student's AI, or revises it as asked. Keeps written text. */
  rewriteOutline: (instruction?: string) => Promise<{ ok: true; structure: AssignmentStructure } | { ok: false; error: string }>;
  /** Puts back an earlier outline (undo). */
  restoreOutline: (previous: AssignmentStructure) => Promise<void>;
  setGeneratingSection: (sectionId: string, isGenerating: boolean) => void;
  generatingSectionIds: Record<string, boolean>;
  initializeDraftingPlan: () => AssignmentDraftingSection[];
  recalculateWordCounts: () => Promise<void>;

  // Word Count Stats
  currentWordCount: number;
  remainingWordCount: number;
  wordCountPercentage: number;

  // Review & Finalize (Phase 4 Submission)
  submissionReport: RubricScoreReport | SubmissionCheckReport | null;
  setSubmissionReport: (report: RubricScoreReport | SubmissionCheckReport) => Promise<void>;
  runSubmissionAudit: () => Promise<{ citationAudit: CitationAuditResult; rubricReport: RubricScoreReport } | undefined>;
  isAuditingSubmission: boolean;
  citationAuditResult: CitationAuditResult | null;
  flowAuditResult: FlowAuditResult | null;

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
  const projectRef = useRef<ProjectView | null>(null);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  // Saves go to the server one at a time, each carrying the latest answers, so
  // a slower earlier save can never land after (and erase) a newer one.
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveRunningRef = useRef(false);
  // What the header shows: only "saved" once the server has the latest answers.
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const saveDirtyRef = useRef(false);
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

  const [activeStage, setActiveStage] = useState<AssignmentStage>(initialStage ?? "understand");

  useEffect(() => {
    if (initialStage) {
      setActiveStage(initialStage);
    }
  }, [initialStage]);

  // Active phase normalized from initial stage / phase
  const currentPhase: AssignmentPhaseId = useMemo(() => {
    return normalizeAssignmentPhase(activeStage);
  }, [activeStage]);

  const currentStage: AssignmentStage = activeStage;

  // AI Tutor & Rubric Estimator state
  const [tutorMode, setTutorMode] = useState<TutorMode>("socratic");
  const [tutorMessages, setTutorMessages] = useState<TutorChatMessage[]>([]);
  const [isTutorReplying, setIsTutorReplying] = useState(false);
  const [isEstimatingRubric, setIsEstimatingRubric] = useState(false);
  const [lastRubricEstimation, setLastRubricEstimation] = useState<RubricGradeEstimation | null>(null);

  // Phase 3 Drafting Engine state
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [generatingSectionIds, setGeneratingSectionIds] = useState<Record<string, boolean>>({});

  // Minimal vs Detailed Execution Mode (OT-10 Parity)
  const [executionMode, setExecutionModeState] = useState<CourseworkExecutionMode>(() => {
    try {
      const saved = localStorage.getItem("scholar_coursework_mode");
      if (saved === "detailed" || saved === "minimal") return saved;
    } catch {
      // Ignore
    }
    const raw = project?.answers?.["execution_mode"] || project?.answers?.["orchestration_mode"];
    if (raw === "detailed" || raw === "minimal") return raw;
    return "minimal";
  });

  useEffect(() => {
    const raw = project?.answers?.["execution_mode"] || project?.answers?.["orchestration_mode"];
    if (raw === "detailed" || raw === "minimal") {
      setExecutionModeState(raw);
    }
  }, [project?.answers?.["execution_mode"], project?.answers?.["orchestration_mode"]]);

  // Load project data with phase auto-migration
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
        const persisted =
          proj.answers?.["assignment_current_phase"] ||
          proj.answers?.["assignment_current_stage"];
        const targetPhase: AssignmentPhaseId = normalizeAssignmentPhase(persisted);
        setActiveStage(targetPhase);
        onStageChangeCallback(targetPhase, { replace: true });
      }

      // Initialize AI Tutor greeting if empty
      setTutorMessages((prev) => {
        if (prev.length === 0) {
          return [
            {
              id: "greeting",
              sender: "tutor",
              mode: "socratic",
              text: `👋 Hello! I am your Scholar Core Socratic Academic Tutor & Rubric Estimator.\n\nChoose an advising mode above: Engage in deep Socratic questioning, estimate your marking rubric grade band (1st / 2:1 / 2:2), stress-test counterarguments, or polish academic prose.`,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ];
        }
        return prev;
      });
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
      if (updates.sections !== undefined) {
        standardized.sections = updates.sections;
      }
      if (updates.writingStyle !== undefined || updates.writing_style !== undefined) {
        const ws = updates.writingStyle ?? updates.writing_style;
        standardized.writingStyle = ws;
        standardized.writing_style = ws;
        const toneStr = typeof ws === "string" ? ws : ws?.preset || ws?.id || "analytical";
        standardized.writingTone = toneStr;
        standardized.writing_tone = toneStr;
      }
      if (updates.writingTone !== undefined || updates.writing_tone !== undefined) {
        const wt = updates.writingTone ?? updates.writing_tone;
        const toneStr = typeof wt === "string" ? wt : wt?.preset || wt?.id || "analytical";
        standardized.writingTone = toneStr;
        standardized.writing_tone = toneStr;
        if (!standardized.writingStyle) {
          standardized.writingStyle = { preset: toneStr as any, label: toneStr };
          standardized.writing_style = { preset: toneStr as any, label: toneStr };
        }
      }
      if (updates.sectionBudgets !== undefined || updates.section_budgets !== undefined) {
        const sb = updates.sectionBudgets ?? updates.section_budgets;
        standardized.sectionBudgets = sb;
        standardized.section_budgets = sb;
      }

      if (updates.title !== undefined || updates.assignment_title !== undefined || updates.updatedTitle !== undefined) {
        const titleVal = String(updates.title ?? updates.assignment_title ?? updates.updatedTitle ?? "").trim();
        if (titleVal) {
          standardized.title = titleVal;
          standardized.assignment_title = titleVal;
        }
      }

      const baseAnswers = projectRef.current?.answers || project?.answers || {};
      const mergedAnswers = { ...baseAnswers, ...standardized };
      const safeAnswers = stripCircularReferences(mergedAnswers);
      if (projectRef.current) {
        projectRef.current = {
          ...projectRef.current,
          answers: safeAnswers,
          title: standardized.title || projectRef.current.title,
        };
      }
      setProject((prev) => {
        if (!prev) return null;
        return { ...prev, answers: safeAnswers, title: standardized.title || prev.title };
      });

      // One write in flight at a time. The first starts at once; changes made
      // while it runs are sent together, as the latest answers, right after.
      saveDirtyRef.current = true;
      if (!saveRunningRef.current) {
        saveRunningRef.current = true;
        setSaveStatus("saving");
        saveChainRef.current = (async () => {
          let failed = false;
          try {
            while (saveDirtyRef.current) {
              saveDirtyRef.current = false;
              try {
                await saveIntakeAnswers(activeProjectId, projectRef.current?.answers ?? safeAnswers);
                failed = false;
              } catch (err) {
                failed = true;
                console.error("Failed to persist assignment answers:", err);
              }
            }
          } finally {
            saveRunningRef.current = false;
            setSaveStatus(failed ? "error" : "saved");
          }
        })();
      }
      await saveChainRef.current;
    },
    [project, activeProjectId]
  );

  // Phase Navigation
  const setPhase = useCallback(
    (phase: AssignmentPhaseId, options?: { replace?: boolean }) => {
      setActiveStage(phase);
      saveAnswers({
        assignment_current_phase: phase,
        assignment_current_stage: phase,
      });
      if (typeof onStageChangeCallback === "function") {
        onStageChangeCallback(phase, options);
      }
    },
    [onStageChangeCallback, saveAnswers]
  );

  // Backward-compatible setStage alias
  const setStage = useCallback(
    (stage: AssignmentStage, options?: { replace?: boolean }) => {
      setActiveStage(stage);
      const mappedPhase = normalizeAssignmentPhase(stage);
      saveAnswers({
        assignment_current_phase: mappedPhase,
        assignment_current_stage: stage,
      });
      if (typeof onStageChangeCallback === "function") {
        onStageChangeCallback(stage, options);
      }
    },
    [onStageChangeCallback, saveAnswers]
  );

  const advancePhase = useCallback(
    (nextPhase?: AssignmentPhaseId) => {
      if (nextPhase) {
        setPhase(nextPhase);
        return;
      }
      const currentIndex = ASSIGNMENT_PHASES.findIndex((p) => p.id === currentPhase);
      if (currentIndex >= 0 && currentIndex < ASSIGNMENT_PHASES.length - 1) {
        const next = ASSIGNMENT_PHASES[currentIndex + 1].id;
        setPhase(next);
      }
    },
    [currentPhase, setPhase]
  );

  const advanceStage = useCallback(
    (nextStage?: AssignmentStage) => {
      if (nextStage) {
        setStage(nextStage);
        return;
      }
      advancePhase();
    },
    [advancePhase, setStage]
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
  const rawTarget =
    answers["targetWordCount"] !== undefined
      ? answers["targetWordCount"]
      : answers["target_word_count"] !== undefined
      ? answers["target_word_count"]
      : answers["word_count"] !== undefined
      ? answers["word_count"]
      : answers["word_limit"];
  let parsedTarget =
    rawTarget !== undefined && rawTarget !== null && rawTarget !== ""
      ? Number(rawTarget)
      : 2000;
  if (isNaN(parsedTarget) || parsedTarget <= 0) {
    parsedTarget = 2000;
  } else if (parsedTarget > 50000) {
    // Auto-heal runaway or concatenated values e.g. 2000150 -> 2000
    parsedTarget = 2000;
  }
  const targetWordCount = parsedTarget;

  const rawCitation =
    answers["citationStyle"] !== undefined
      ? answers["citationStyle"]
      : answers["citation_style"];
  const citationStyle =
    rawCitation !== undefined ? cleanAnswerString(rawCitation) : "apa7";

  const rawSections = answers["sections"];
  const rawSectionsKey =
    typeof rawSections === "object" ? JSON.stringify(rawSections) : String(rawSections ?? "");
  const sections: SectionBreakdown | undefined = useMemo(() => {
    if (rawSections) {
      const parsed = safeParseAnswerField<SectionBreakdown | undefined>(rawSections, undefined);
      if (parsed && typeof parsed === "object") return parsed;
    }
    const normalized = normalizeProjectAnswers({ ...answers, targetWordCount });
    return normalized?.sections;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSectionsKey, targetWordCount]);

  const setSections = useCallback(
    async (newSections: SectionBreakdown) => {
      await saveAnswers({ sections: newSections });
    },
    [saveAnswers]
  );

  const rawStyle =
    answers["writingStyle"] ||
    answers["writing_style"] ||
    answers["writingTone"] ||
    answers["writing_tone"];
  const rawStyleKey =
    typeof rawStyle === "object" ? JSON.stringify(rawStyle) : String(rawStyle ?? "");
  const writingStyle: WritingStyleConfig = useMemo(() => {
    if (rawStyle) {
      const parsed = safeParseAnswerField<WritingStyleConfig | undefined>(rawStyle, undefined);
      if (parsed && parsed.preset) return parsed;
    }
    return {
      preset: "analytical",
      description: "Breaks down causes, patterns, and connections between concepts.",
    };
  }, [rawStyleKey]);

  const setWritingStyle = useCallback(
    async (style: WritingStyleConfig) => {
      await saveAnswers({
        writingStyle: style,
        writing_style: style,
        writingTone: style,
        writing_tone: style,
      });
    },
    [saveAnswers]
  );

  const writingTone: WritingToneConfig = useMemo(() => {
    return writingStyle;
  }, [writingStyle]);

  const setWritingTone = useCallback(
    async (tone: WritingToneConfig) => {
      await setWritingStyle(tone as WritingStyleConfig);
    },
    [setWritingStyle]
  );

  const question = extractStandardizedInstructions(answers);
  const briefText =
    cleanAnswerString(answers["assignment_brief_text"]) ||
    cleanAnswerString(answers["briefText"]) ||
    cleanAnswerString(answers["brief"]) ||
    question;
  const assignmentBriefText = briefText;

  const structure: AssignmentStructure = useMemo(() => {
    const raw = answers["assignment_structure"] || answers["structure"];
    if (raw) {
      const parsed = safeParseAnswerField<AssignmentStructure | undefined>(raw, undefined);
      if (parsed?.headings && Array.isArray(parsed.headings) && parsed.headings.length > 0) {
        const isNonMLTopic = !/\b(machine learning|deep learning|neural network|transformer|foundation model)\b/i.test(`${question} ${briefText}`);
        const hasLeakedML = parsed.headings.some((h: any) =>
          /Mathematical Formulations|Loss Optimization Landscapes|Algorithmic Architectures/i.test(h.title || "") ||
          (h.subheadings || []).some((sub: any) => /Mathematical Formulations|Loss Optimization Landscapes|empirical risk minimization/i.test(sub.title || sub.guidance || ""))
        );
        const hasClassroomLogistics = parsed.headings.some((h: any) =>
          /Divide Yourself in Teams|teams of 2|in classroom discussion/i.test(h.title || "")
        );

        if (!((isNonMLTopic && hasLeakedML) || hasClassroomLogistics)) {
          return parsed;
        }
      }
    }
    return generateDynamicAssignmentStructure({
      question: cleanAnswerString(question),
      assignmentType,
      academicLevel,
      targetWordCount: targetWordCount > 0 ? targetWordCount : 2000,
      briefText: cleanAnswerString(briefText),
    });
  }, [answers, question, assignmentType, academicLevel, targetWordCount, briefText]);

  const setStructure = useCallback(
    async (newStructure: AssignmentStructure) => {
      const internalSecs = structureToInternalSections(newStructure);
      const budgets = structureToSectionBudgets(newStructure);
      await saveAnswers({
        assignment_structure: newStructure,
        structure: newStructure,
        sectionBudgets: budgets,
        section_budgets: budgets,
        assignment_internal_sections: internalSecs,
        assignment_outline: internalSecs,
      });
    },
    [saveAnswers]
  );

  const rawBudgets = answers["sectionBudgets"] || answers["section_budgets"];
  const rawBudgetsKey =
    typeof rawBudgets === "object" ? JSON.stringify(rawBudgets) : String(rawBudgets ?? "");
  const sectionBudgets: SectionBudgetItem[] = useMemo(() => {
    if (structure?.headings && structure.headings.length > 0) {
      const converted = structureToSectionBudgets(structure);
      if (converted.length > 0) return converted;
    }
    if (rawBudgets) {
      const parsed = safeParseAnswerField<SectionBudgetItem[]>(rawBudgets, []);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // Baseline allocation
    const total = targetWordCount > 0 ? targetWordCount : 2000;
    const intro = Math.round(total * 0.10);
    const conclusion = Math.round(total * 0.10);
    const body = Math.max(0, total - intro - conclusion);
    return [
      { id: "intro", title: "Introduction", targetWordCount: intro, isCustom: false },
      { id: "body", title: "Body Paragraphs", targetWordCount: body, isCustom: false },
      { id: "conclusion", title: "Conclusion", targetWordCount: conclusion, isCustom: false },
    ];
  }, [rawBudgetsKey, rawBudgets, structure, targetWordCount]);

  const addCustomSection = useCallback(
    async (title: string, targetWordCountVal: number) => {
      const newSection: SectionBudgetItem = {
        id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: title.trim() || "Custom Section",
        targetWordCount: Math.max(0, targetWordCountVal),
        isCustom: true,
      };
      const updated = [...sectionBudgets, newSection];
      await saveAnswers({
        sectionBudgets: updated,
        section_budgets: updated,
      });
    },
    [sectionBudgets, saveAnswers]
  );

  const updateSectionBudget = useCallback(
    async (id: string, updates: Partial<{ title: string; targetWordCount: number }>) => {
      const updated = sectionBudgets.map((sec) =>
        sec.id === id ? { ...sec, ...updates } : sec
      );
      await saveAnswers({
        sectionBudgets: updated,
        section_budgets: updated,
      });
    },
    [sectionBudgets, saveAnswers]
  );

  const removeCustomSection = useCallback(
    async (id: string) => {
      const updated = sectionBudgets.filter((sec) => sec.id !== id);
      await saveAnswers({
        sectionBudgets: updated,
        section_budgets: updated,
      });
    },
    [sectionBudgets, saveAnswers]
  );

  const resetSectionBudgets = useCallback(
    async (totalWords?: number) => {
      const total = totalWords || targetWordCount || 2000;
      const intro = Math.round(total * 0.10);
      const conclusion = Math.round(total * 0.10);
      const body = Math.max(0, total - intro - conclusion);
      const defaults: SectionBudgetItem[] = [
        { id: "intro", title: "Introduction", targetWordCount: intro, isCustom: false },
        { id: "body", title: "Body Paragraphs", targetWordCount: body, isCustom: false },
        { id: "conclusion", title: "Conclusion", targetWordCount: conclusion, isCustom: false },
      ];
      await saveAnswers({
        sectionBudgets: defaults,
        section_budgets: defaults,
      });
    },
    [targetWordCount, saveAnswers]
  );

  // Structured entities
  const analysis: AssignmentAnalysis | null = answers["assignment_analysis"]
    ? safeParseAnswerField<AssignmentAnalysis | null>(answers["assignment_analysis"], null)
    : null;

  const rawPlan = answers["assignment_plan"] || answers["assignment_research_plan"];
  const researchPlan: ResearchPlan | null = rawPlan
    ? safeParseAnswerField<ResearchPlan | null>(rawPlan, null)
    : null;

  const sources: DiscoveredSource[] = useMemo(() => {
    const raw = answers["assignment_sources"];
    if (!raw) return [];
    return safeParseAnswerField<DiscoveredSource[]>(raw, []);
  }, [answers]);

  const userUploadedSources: UploadedSourceDocument[] = useMemo(() => {
    const raw = answers["assignment_user_uploaded_sources"] || answers["userUploadedSources"];
    if (!raw) return [];
    return safeParseAnswerField<UploadedSourceDocument[]>(raw, []);
  }, [answers]);

  const approvedSourceIds: string[] = useMemo(() => {
    const raw = answers["approved_source_ids"] || answers["approvedSourceIds"];
    if (raw !== undefined && raw !== null) {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fallback
      }
    }
    const fromSources = (sources ?? [])
      .filter((s) => s.status !== "removed" && !s.isExcluded)
      .map((s) => s.id);
    const fromUploaded = userUploadedSources.map((u) => u.id);
    return Array.from(new Set([...fromSources, ...fromUploaded]));
  }, [answers, sources, userUploadedSources, question, citationStyle]);

  const rubricCriteriaList: AssignmentBriefRubricCriterion[] = useMemo(() => {
    const raw = answers["rubricCriteria"] || answers["rubric_criteria"];
    if (raw) {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // fallback
      }
    }
    const rubricText = answers["marking_rubric"] || answers["rubric"] || "";
    if (rubricText && rubricText.trim()) {
      const lines = rubricText.split("\n").map((l: string) => l.trim()).filter(Boolean);
      return lines.slice(0, 8).map((line: string, idx: number) => {
        const match = line.match(/(.*?)(?:[:\-–—]\s*(\d+)%?|(?:\((\d+)%\)))/);
        return {
          id: `rc-${idx + 1}`,
          title: match ? match[1].replace(/^[0-9]+[.)\s]*/, "").trim() : line.slice(0, 50),
          criterion: match ? match[1].replace(/^[0-9]+[.)\s]*/, "").trim() : line.slice(0, 50),
          description: line,
          weightPercentage: match ? parseInt(match[2] || match[3] || "0", 10) || undefined : undefined,
          weightPercent: match ? parseInt(match[2] || match[3] || "0", 10) || undefined : undefined,
        };
      });
    }
    return [];
  }, [answers]);

  const evidenceItems: EvidenceItem[] = useMemo(() => {
    const raw = answers["assignment_evidence_items"];
    if (!raw) return [];
    return safeParseAnswerField<EvidenceItem[]>(raw, []);
  }, [answers]);

  const thinkingMap: ThinkingMap | null = answers["assignment_thinking_map"]
    ? safeParseAnswerField<ThinkingMap | null>(answers["assignment_thinking_map"], null)
    : null;

  const outline: OutlineSection[] = useMemo(() => {
    const raw = answers["assignment_outline"];
    if (!raw) return [];
    return safeParseAnswerField<OutlineSection[]>(raw, []);
  }, [answers]);

  const internalSections: AssignmentDraftingSection[] = useMemo(() => {
    const isNonML = !/\b(machine learning|deep learning|neural network|transformer|foundation model)\b/i.test(`${question} ${briefText}`);
    const isCorrupted = (list: any[]) =>
      list.some((sec: any) =>
        (isNonML && /Mathematical Formulations|Loss Optimization Landscapes|Algorithmic Architectures/i.test(sec.title || "")) ||
        /Divide Yourself in Teams|teams of 2|in classroom discussion/i.test(sec.title || "")
      );

    const rawInternal = answers["assignment_internal_sections"];
    if (rawInternal) {
      const parsed = safeParseAnswerField<any[]>(rawInternal, []);
      if (Array.isArray(parsed) && parsed.length > 0 && !isCorrupted(parsed)) return parsed;
    }
    const rawOutline = answers["assignment_outline"];
    if (rawOutline) {
      const parsed = safeParseAnswerField<any[]>(rawOutline, []);
      if (Array.isArray(parsed) && parsed.length > 0 && !isCorrupted(parsed)) {
        return parsed.map((sec: any) => ({
          id: sec.id,
          title: sec.title,
          targetWordCount: sec.targetWordCount,
          currentWordCount: sec.currentWordCount ?? (sec.draftContent ? sec.draftContent.trim().split(/\s+/).filter(Boolean).length : 0),
          guidance: sec.guidance || "",
          draftContent: sec.draftContent || "",
          status: sec.draftContent?.trim() ? "completed" : sec.status || "pending",
          keyPoints: sec.keyPoints,
          linkedEvidenceIds: sec.linkedEvidenceIds,
          boundSourceIds: sec.boundSourceIds || [],
          academicFunction: sec.academicFunction,
          sectionType: sec.sectionType || (sec.id.includes("intro") ? "intro" : sec.id.includes("conclusion") ? "conclusion" : "body"),
        }));
      }
    }
    return [];
  }, [answers, question, briefText]);

  const submissionReport: RubricScoreReport | SubmissionCheckReport | null = answers["assignment_submission_report"]
    ? safeParseAnswerField<RubricScoreReport | SubmissionCheckReport | null>(answers["assignment_submission_report"], null)
    : null;

  const initialCitationAudit: CitationAuditResult | null = answers["assignment_citation_audit"]
    ? safeParseAnswerField<CitationAuditResult | null>(answers["assignment_citation_audit"], null)
    : null;

  const initialFlowAudit: FlowAuditResult | null = answers["assignment_flow_audit"]
    ? safeParseAnswerField<FlowAuditResult | null>(answers["assignment_flow_audit"], null)
    : null;

  const [citationAuditResult, setCitationAuditResult] = useState<CitationAuditResult | null>(initialCitationAudit);
  const [flowAuditResult, setFlowAuditResult] = useState<FlowAuditResult | null>(initialFlowAudit);
  const [isAuditingSubmission, setIsAuditingSubmission] = useState(false);

  useEffect(() => {
    if (initialCitationAudit) {
      setCitationAuditResult(initialCitationAudit);
    }
    if (initialFlowAudit) {
      setFlowAuditResult(initialFlowAudit);
    }
  }, [initialCitationAudit, initialFlowAudit]);

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
      if (!researchPlan) return;
      const updated: ResearchPlan = {
        ...researchPlan,
        ...delta,
      };
      await setResearchPlan(updated);
    },
    [researchPlan, setResearchPlan]
  );

  const setQuestion = useCallback(
    async (newQuestion: string) => {
      await saveAnswers({
        assignment_question: newQuestion,
        instructions: newQuestion,
        assignment_brief_text: newQuestion,
        research_topic: newQuestion,
      });
    },
    [saveAnswers]
  );

  const setSources = useCallback(
    async (newSources: DiscoveredSource[]) => {
      await saveAnswers({ assignment_sources: newSources });
    },
    [saveAnswers]
  );

  const setApprovedSourceIds = useCallback(
    async (ids: string[]) => {
      await saveAnswers({
        approved_source_ids: ids,
        approvedSourceIds: ids,
      });
    },
    [saveAnswers]
  );

  const toggleSourceStatus = useCallback(
    async (sourceId: string, status: "kept" | "removed") => {
      const updated = sources.map((s) => (s.id === sourceId ? { ...s, status } : s));
      const nextApproved =
        status === "kept"
          ? Array.from(new Set([...approvedSourceIds, sourceId]))
          : approvedSourceIds.filter((id) => id !== sourceId);

      await saveAnswers({
        assignment_sources: updated,
        approved_source_ids: nextApproved,
        approvedSourceIds: nextApproved,
      });
    },
    [sources, approvedSourceIds, saveAnswers]
  );

  const toggleSourceApproval = useCallback(
    async (sourceId: string) => {
      const isCurrentlyApproved = approvedSourceIds.includes(sourceId);
      const nextApproved = isCurrentlyApproved
        ? approvedSourceIds.filter((id) => id !== sourceId)
        : [...approvedSourceIds, sourceId];

      const nextSources = sources.map((s) => {
        if (s.id === sourceId) {
          return {
            ...s,
            status: isCurrentlyApproved ? ("unreviewed" as const) : ("kept" as const),
          };
        }
        return s;
      });

      await saveAnswers({
        approved_source_ids: nextApproved,
        approvedSourceIds: nextApproved,
        assignment_sources: nextSources,
      });
    },
    [approvedSourceIds, sources, saveAnswers]
  );

  const dismissSource = useCallback(
    async (sourceId: string, replacement?: DiscoveredSource) => {
      let nextSources: DiscoveredSource[];
      if (replacement) {
        nextSources = sources.map((s) => (s.id === sourceId ? replacement : s));
      } else {
        nextSources = sources.filter((s) => s.id !== sourceId);
      }
      const nextApproved = approvedSourceIds.filter((id) => id !== sourceId);

      await saveAnswers({
        assignment_sources: nextSources,
        approved_source_ids: nextApproved,
        approvedSourceIds: nextApproved,
      });
    },
    [sources, approvedSourceIds, saveAnswers]
  );

  const addUserUploadedSource = useCallback(
    async (doc: UploadedSourceDocument) => {
      const nextUploaded = [...userUploadedSources.filter((d) => d.id !== doc.id), doc];
      const nextApproved = Array.from(new Set([...approvedSourceIds, doc.id]));
      await saveAnswers({
        assignment_user_uploaded_sources: nextUploaded,
        userUploadedSources: nextUploaded,
        approved_source_ids: nextApproved,
        approvedSourceIds: nextApproved,
      });
    },
    [userUploadedSources, approvedSourceIds, saveAnswers]
  );

  const removeUserUploadedSource = useCallback(
    async (docId: string) => {
      const nextUploaded = userUploadedSources.filter((d) => d.id !== docId);
      const nextApproved = approvedSourceIds.filter((id) => id !== docId);
      await saveAnswers({
        assignment_user_uploaded_sources: nextUploaded,
        userUploadedSources: nextUploaded,
        approved_source_ids: nextApproved,
        approvedSourceIds: nextApproved,
      });
    },
    [userUploadedSources, approvedSourceIds, saveAnswers]
  );

  const setEvidenceItems = useCallback(
    async (newItems: EvidenceItem[]) => {
      await saveAnswers({ assignment_evidence_items: newItems });
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
        id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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

  const initializeDraftingPlan = useCallback((): AssignmentDraftingSection[] => {
    if (structure?.headings && structure.headings.length > 0) {
      const generated = structureToInternalSections(structure);
      saveAnswers({
        assignment_internal_sections: generated,
        assignment_outline: generated,
      });
      if (generated.length > 0) {
        setActiveSectionId((prev) => prev || generated[0].id);
      }
      return generated;
    }

    const topicToUse = question || project?.title || "Academic Essay";
    const generated = decomposeWordBudget({
      targetWordCount,
      wordBudget: {
        intro: sections?.intro?.targetWords ?? Math.round(targetWordCount * 0.10),
        body: sections?.body?.targetWords ?? Math.max(0, targetWordCount - (sections?.intro?.targetWords ?? Math.round(targetWordCount * 0.10)) - (sections?.conclusion?.targetWords ?? Math.round(targetWordCount * 0.15))),
        conclusion: sections?.conclusion?.targetWords ?? Math.round(targetWordCount * 0.15),
      },
      approvedSourceIds,
      assignmentTopic: topicToUse,
      academicLevel,
    });

    saveAnswers({
      assignment_internal_sections: generated,
      assignment_outline: generated,
    });

    if (generated.length > 0) {
      setActiveSectionId((prev) => prev || generated[0].id);
    }
    return generated;
  }, [structure, targetWordCount, sections, approvedSourceIds, question, project?.title, academicLevel, saveAnswers]);

  /**
   * The sections as last written, not as of the last render: a draft that
   * finishes while the student types (or "Draft all", section after section)
   * must build on every earlier change instead of overwriting it.
   */
  const latestSections = useCallback((): Array<AssignmentDraftingSection | OutlineSection> => {
    const raw = safeParseAnswerField<AssignmentDraftingSection[]>(projectRef.current?.answers?.["assignment_internal_sections"], []);
    if (Array.isArray(raw) && raw.length > 0) return raw;
    return internalSections.length > 0 ? internalSections : outline;
  }, [internalSections, outline]);

  const updateSectionContent = useCallback(
    async (sectionId: string, content: string) => {
      const words = content.trim() ? content.trim().split(/\s+/).filter(Boolean).length : 0;
      const baseSections = latestSections();
      const updated = baseSections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              draftContent: content,
              currentWordCount: words,
              status: (words > 0 ? "completed" : "pending") as AssignmentDraftingSection["status"],
            }
          : s
      );

      await saveAnswers({
        assignment_internal_sections: updated,
        assignment_outline: updated,
      });
    },
    [latestSections, saveAnswers]
  );

  const updateSectionTitle = useCallback(
    async (sectionId: string, newTitle: string) => {
      const baseSections = latestSections();
      const updated = baseSections.map((s) =>
        s.id === sectionId ? { ...s, title: newTitle } : s
      );

      await saveAnswers({
        assignment_internal_sections: updated,
        assignment_outline: updated,
      });
    },
    [latestSections, saveAnswers]
  );

  const tuneOutlineWithQuestion = useCallback(async (): Promise<AssignmentDraftingSection[]> => {
    const topicToUse = question || project?.title || "Academic Assignment";
    const existing = latestSections() as (AssignmentDraftingSection | InternalSectionPlan)[];
    const tuned = tuneSectionsToQuestion({
      existingSections: existing,
      assignmentTopic: topicToUse,
      approvedSources: sources.filter((s) => approvedSourceIds.includes(s.id)),
      targetWordCount,
      academicLevel,
    });

    await saveAnswers({
      assignment_internal_sections: tuned,
      assignment_outline: tuned,
    });
    return tuned;
  }, [question, project?.title, latestSections, sources, approvedSourceIds, targetWordCount, academicLevel, saveAnswers]);

  const rewriteOutline = useCallback(
    async (instruction?: string): Promise<{ ok: true; structure: AssignmentStructure } | { ok: false; error: string }> => {
      try {
        // Drafts written since the last save must reach the server first,
        // so the revision can keep them.
        const current = latestSections();
        await saveAnswers({ assignment_internal_sections: current, assignment_outline: current });
        const res = await authedJsonFetch(`/api/projects/${activeProjectId}/assignment/outline`, "POST", instruction ? { instruction } : {}, { skipLlmFallback: true });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.structure?.headings?.length) {
          return { ok: false, error: body?.error || `The outline could not be written (${res.status}).` };
        }
        const next = body.structure as AssignmentStructure;
        await setStructure(next);
        if (next.targetWordCount && next.targetWordCount !== targetWordCount) await saveAnswers({ targetWordCount: next.targetWordCount });
        return { ok: true, structure: next };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "The outline could not be written." };
      }
    },
    [activeProjectId, latestSections, saveAnswers, setStructure, targetWordCount]
  );

  const restoreOutline = useCallback(
    async (previous: AssignmentStructure) => {
      await setStructure(previous);
      if (previous.targetWordCount && previous.targetWordCount !== targetWordCount) await saveAnswers({ targetWordCount: previous.targetWordCount });
    },
    [saveAnswers, setStructure, targetWordCount]
  );

  const updateSectionDraft = useCallback(
    async (sectionId: string, content: string) => {
      await updateSectionContent(sectionId, content);
    },
    [updateSectionContent]
  );

  const setGeneratingSection = useCallback((sectionId: string, isGenerating: boolean) => {
    setGeneratingSectionIds((prev) => ({ ...prev, [sectionId]: isGenerating }));
  }, []);

  const recalculateWordCounts = useCallback(async () => {
    const baseSections = latestSections();
    const updated = baseSections.map((sec) => {
      const words = sec.draftContent?.trim() ? sec.draftContent.trim().split(/\s+/).filter(Boolean).length : 0;
      return {
        ...sec,
        currentWordCount: words,
        status: (words > 0 ? "completed" : "pending") as AssignmentDraftingSection["status"],
      };
    });
    await saveAnswers({
      assignment_internal_sections: updated,
      assignment_outline: updated,
    });
  }, [latestSections, saveAnswers]);

  const setSubmissionReport = useCallback(
    async (report: RubricScoreReport | SubmissionCheckReport) => {
      await saveAnswers({ assignment_submission_report: report });
    },
    [saveAnswers]
  );

  // Word count calculations
  const currentWordCount = useMemo(() => {
    const secs = internalSections.length > 0 ? internalSections : outline;
    return secs.reduce((sum, sec) => sum + (sec.currentWordCount || 0), 0);
  }, [internalSections, outline]);

  const remainingWordCount = Math.max(0, targetWordCount - currentWordCount);
  const wordCountPercentage = targetWordCount > 0 ? Math.min(100, Math.round((currentWordCount / targetWordCount) * 100)) : 0;

  // Auto-select first section if activeSectionId is null or not found
  useEffect(() => {
    if (internalSections.length > 0) {
      if (!activeSectionId || !internalSections.some((s) => s.id === activeSectionId)) {
        setActiveSectionId(internalSections[0].id);
      }
    }
  }, [internalSections, activeSectionId]);

  // Phase 3 auto-initialization: if entering Phase 3 with empty sections, decompose word budget
  useEffect(() => {
    if (currentPhase === "drafting" && !isLoading && internalSections.length === 0 && targetWordCount > 0) {
      initializeDraftingPlan();
    }
  }, [currentPhase, isLoading, internalSections.length, targetWordCount, initializeDraftingPlan]);

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
          stage: currentPhase,
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

        const replyMsg: TutorChatMessage = {
          id: `reply-${Date.now()}`,
          sender: "tutor",
          mode: modeToUse,
          text: data.reply || "I am thinking through your research problem. Let us review the next step.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          socraticQuestions: data.socraticQuestions,
          rubricEstimation: data.rubricEstimation,
          counterArguments: data.counterArguments,
          actionableSuggestion: data.actionableSuggestion,
          patch: data.patch,
        };
        setTutorMessages((prev) => [...prev, replyMsg]);
      } catch (err) {
        console.error("Failed to send message to AI Tutor:", err);
        const errMsg: TutorChatMessage = {
          id: `err-${Date.now()}`,
          sender: "tutor",
          mode: modeToUse,
          text: "I encountered an error connecting to Scholar Core. Please check your network or try again shortly.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setTutorMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsTutorReplying(false);
      }
    },
    [
      projectId,
      tutorMode,
      currentPhase,
      academicLevel,
      assignmentType,
      question,
      targetWordCount,
      currentWordCount,
      analysis,
      researchPlan,
      outline,
      evidenceItems,
      thinkingMap,
      updatePlan,
      updateAnalysis,
      setQuestion,
    ]
  );

  // Rubric Grade Estimator
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

  // Compute 5-phase status
  const phaseStatuses: Record<AssignmentPhaseId, "active" | "completed" | "upcoming"> = useMemo(() => {
    const hasExtract = Boolean(question && targetWordCount > 0 && citationStyle);
    const hasUnderstand = Boolean(structure?.isConfirmed || (hasExtract && analysis?.approvedByUser));
    const hasSources = sources.filter((s) => s.status === "kept").length >= 2;
    const hasDrafting = currentWordCount >= Math.min(200, targetWordCount * 0.3);
    const hasSubmission = Boolean(submissionReport);

    return {
      extract: currentPhase === "extract" ? "active" : hasExtract ? "completed" : "upcoming",
      understand: currentPhase === "understand" ? "active" : hasUnderstand ? "completed" : "upcoming",
      sources: currentPhase === "sources" ? "active" : hasSources ? "completed" : "upcoming",
      drafting: currentPhase === "drafting" ? "active" : hasDrafting ? "completed" : "upcoming",
      submission: currentPhase === "submission" ? "active" : hasSubmission ? "completed" : "upcoming",
    };
  }, [
    question,
    targetWordCount,
    citationStyle,
    structure,
    analysis,
    sources,
    currentWordCount,
    submissionReport,
    currentPhase,
  ]);

  // Compute status for all stages (including legacy aliases)
  const stageStatuses: Record<AssignmentStage, StageStatus> = useMemo(() => {
    const hasExtract = Boolean(question && targetWordCount > 0 && citationStyle);
    const hasUnderstand = Boolean(structure?.isConfirmed || (hasExtract && analysis?.approvedByUser));
    const hasAnalysis = Boolean(analysis && analysis.approvedByUser);
    const hasPlan = Boolean(researchPlan && researchPlan.approvedByUser);
    const hasSources = sources.filter((s) => s.status === "kept").length >= 2;
    const hasEvidence = evidenceItems.filter((e) => e.status === "approved").length >= 2;
    const hasThinking = Boolean(thinkingMap && (thinkingMap.selectedThesisId || thinkingMap.customThesis));
    const hasStructure = outline.length >= 3;
    const hasDraft = currentWordCount >= Math.min(200, targetWordCount * 0.3);
    const hasReport = Boolean(submissionReport);

    return {
      // 5 phases
      extract: hasExtract ? "completed" : currentPhase === "extract" ? "active" : "needs_review",
      understand: hasUnderstand && hasAnalysis ? "completed" : currentPhase === "understand" ? "active" : "needs_review",
      sources: hasSources ? "completed" : currentPhase === "sources" ? "active" : hasUnderstand ? "available" : "locked",
      drafting: hasDraft ? "completed" : currentPhase === "drafting" ? "active" : hasSources ? "available" : "locked",
      submission: hasReport ? "completed" : currentPhase === "submission" ? "active" : hasDraft ? "available" : "locked",

      // 8 legacy stages
      plan: hasPlan ? "completed" : currentPhase === "understand" ? "active" : hasUnderstand ? "available" : "locked",
      research: hasSources ? "completed" : currentPhase === "sources" ? "active" : hasPlan ? "available" : "locked",
      evidence: hasEvidence ? "completed" : currentPhase === "sources" ? "active" : hasSources ? "available" : "locked",
      think: hasThinking ? "completed" : currentPhase === "drafting" ? "active" : hasEvidence ? "available" : "locked",
      structure: hasStructure ? "completed" : currentPhase === "drafting" ? "active" : hasThinking ? "available" : "locked",
      draft: hasDraft ? "completed" : currentPhase === "drafting" ? "active" : hasStructure ? "available" : "locked",
      final: hasReport ? "completed" : currentPhase === "submission" ? "active" : hasDraft ? "available" : "locked",
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
    currentPhase,
  ]);

  // Unified 4-Phase Project State Model (Section 4.2)
  const projectState: AssignmentProjectState = useMemo(() => {
    return {
      projectId: activeProjectId,
      currentPhase,
      brief: {
        rawPrompt: question,
        instructions: question,
        assignmentTopic: question,
        targetWordCount,
        wordBudget: {
          intro: sections?.intro?.targetWords ?? Math.round(targetWordCount * 0.10),
          conclusion: sections?.conclusion?.targetWords ?? Math.round(targetWordCount * 0.15),
          body: sections?.body?.targetWords ?? Math.max(0, targetWordCount - (sections?.intro?.targetWords ?? Math.round(targetWordCount * 0.10)) - (sections?.conclusion?.targetWords ?? Math.round(targetWordCount * 0.15))),
        },
        academicLevel,
        assignmentType,
        citationStyle,
        sections,
        sectionBudgets,
        writingStyle,
        writingTone,
        rubricCriteria: rubricCriteriaList,
        analysis,
        briefLedger: analysis?.briefLedger,
      },
      sources: {
        curated: sources,
        userUploaded: userUploadedSources,
        approvedSourceIds,
        evidenceItems,
      },
      drafting: {
        internalSections: internalSections.length > 0 ? internalSections : outline.map((sec) => ({
          id: sec.id,
          title: sec.title,
          targetWordCount: sec.targetWordCount,
          currentWordCount: sec.currentWordCount,
          guidance: sec.guidance,
          draftContent: sec.draftContent || "",
          status: sec.status,
          keyPoints: sec.keyPoints,
          linkedEvidenceIds: sec.linkedEvidenceIds,
        })),
        activeSectionId: activeSectionId || internalSections[0]?.id || outline[0]?.id || null,
        fullDocumentMarkdown: (internalSections.length > 0 ? internalSections : outline)
          .map((s) => `## ${s.title}\n\n${s.draftContent || ""}`)
          .join("\n\n"),
        overallWordCount: currentWordCount,
        canonicalDocument: document,
        thinkingMap,
      },
      submission: {
        rubricScoreReport: submissionReport,
        citationAudit: citationAuditResult,
        flowAudit: flowAuditResult,
        isReadyForSubmission: Boolean(
          submissionReport &&
          ((submissionReport as any).readinessPercentage !== undefined
            ? (submissionReport as any).readinessPercentage >= 70
            : (submissionReport as any).readyForSubmission) &&
          (!citationAuditResult || citationAuditResult.isReconciled)
        ),
      },
      updatedAt: new Date().toISOString(),
    };
  }, [
    activeProjectId,
    currentPhase,
    question,
    targetWordCount,
    academicLevel,
    assignmentType,
    citationStyle,
    sections,
    sectionBudgets,
    writingStyle,
    writingTone,
    rubricCriteriaList,
    analysis,
    sources,
    userUploadedSources,
    approvedSourceIds,
    evidenceItems,
    outline,
    internalSections,
    activeSectionId,
    currentWordCount,
    document,
    thinkingMap,
    submissionReport,
    citationAuditResult,
    flowAuditResult,
  ]);

  // Phase 4: Submission Quality Audit Runner
  const runSubmissionAudit = useCallback(async () => {
    setIsAuditingSubmission(true);
    try {
      const activeSecs = internalSections.length > 0 ? internalSections : outline.map((sec) => ({
        id: sec.id,
        title: sec.title,
        targetWordCount: sec.targetWordCount,
        currentWordCount: sec.currentWordCount,
        guidance: sec.guidance,
        draftContent: sec.draftContent || "",
        status: sec.status,
        keyPoints: sec.keyPoints,
        linkedEvidenceIds: sec.linkedEvidenceIds,
      }));

      const fullMarkdown = activeSecs
        .map((s) => `## ${s.title}\n\n${s.draftContent || ""}`)
        .join("\n\n");

      // 1. Citation Reconciliation Audit
      const citAudit = auditCitations(
        fullMarkdown,
        sources,
        userUploadedSources,
        approvedSourceIds
      );
      setCitationAuditResult(citAudit);

      // 1b. Citation Coverage
      const approvedSources = sources.filter((s) => s.status === "kept" || (approvedSourceIds && approvedSourceIds.includes(s.id)));
      const citationCoverage = getCitationCoverage(activeSecs as any, approvedSources);

      // 2. Rubric Compliance Evaluation
      const rubricReport = evaluateRubricCompliance(
        fullMarkdown,
        projectState.brief,
        citAudit,
        citationCoverage
      );

      // 3. Flow & Transitions Audit
      const flowAudit = auditFlowAndTransitions(fullMarkdown);
      setFlowAuditResult(flowAudit);

      await saveAnswers({
        assignment_submission_report: rubricReport,
        assignment_citation_audit: citAudit,
        assignment_flow_audit: flowAudit,
      });

      return { citationAudit: citAudit, rubricReport, flowAudit };
    } finally {
      setIsAuditingSubmission(false);
    }
  }, [internalSections, outline, sources, userUploadedSources, approvedSourceIds, projectState.brief, saveAnswers]);

  // Phase 4 auto-initialization: entering Phase 4 with a draft but no
  // submissionReport runs the audit. An empty paper is never graded.
  useEffect(() => {
    if (currentPhase === "submission" && !isLoading && currentWordCount > 0 && !submissionReport && !isAuditingSubmission) {
      runSubmissionAudit();
    }
  }, [currentPhase, isLoading, currentWordCount, submissionReport, isAuditingSubmission, runSubmissionAudit]);

  return (
    <AssignmentContext.Provider
      value={{
        projectId: activeProjectId,
        ensurePersisted,
        project,
        document,
        rubric,
        outputType,

        // 4-Phase Architecture
        currentPhase,
        setPhase,
        phaseStatuses,
        advancePhase,

        // Backward-compatible Stage Aliases
        stage: currentStage,
        currentStage,
        setStage,
        stageStatuses,
        advanceStage,

        // Project State Model
        projectState,

        isLoading,
        error,
        academicLevel,
        assignmentType,
        targetWordCount,
        citationStyle,
        sections,
        setSections,
        writingStyle,
        setWritingStyle,
        writingTone,
        setWritingTone,
        structure,
        setStructure,
        sectionBudgets,
        addCustomSection,
        updateSectionBudget,
        removeCustomSection,
        resetSectionBudgets,
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
        approvedSourceIds,
        setApprovedSourceIds,
        toggleSourceApproval,
        dismissSource,
        userUploadedSources,
        addUserUploadedSource,
        removeUserUploadedSource,
        evidenceItems,
        setEvidenceItems,
        toggleEvidenceStatus,
        addEvidenceItem,
        thinkingMap,
        setThinkingMap,
        outline,
        setOutline,
        updateSectionDraft,
        internalSections,
        activeSectionId,
        setActiveSectionId,
        updateSectionContent,
        updateSectionTitle,
        tuneOutlineWithQuestion,
        saveStatus,
        rewriteOutline,
        restoreOutline,
        setGeneratingSection,
        generatingSectionIds,
        initializeDraftingPlan,
        recalculateWordCounts,
        currentWordCount,
        remainingWordCount,
        wordCountPercentage,
        submissionReport,
        setSubmissionReport,
        runSubmissionAudit,
        isAuditingSubmission,
        citationAuditResult,
        flowAuditResult,
        tutorMode,
        setTutorMode,
        tutorMessages,
        sendTutorMessage,
        isTutorReplying,
        isEstimatingRubric,
        lastRubricEstimation,
        estimateRubricGrade,
        applyTutorSuggestionToDraft,
        executionMode,
        setExecutionMode: async (newMode: CourseworkExecutionMode) => {
          setExecutionModeState(newMode);
          try {
            localStorage.setItem("scholar_coursework_mode", newMode);
          } catch {
            // Ignore
          }
          await saveAnswers({
            execution_mode: newMode,
            orchestration_mode: newMode,
          });
        },
        saveAnswers,
        updateProjectAnswers: saveAnswers,
      }}
    >
      {children}
    </AssignmentContext.Provider>
  );
}

export default AssignmentContext;
