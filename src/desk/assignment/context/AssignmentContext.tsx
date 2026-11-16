import { clampWordLimit, WORD_LIMIT_DEFAULT } from "../../../domain/assignment/wordLimit";
import { DEFAULT_CITATION_STYLE } from "../../../domain/assignment/answerKeys";
import { tonePresetOf } from "../types";
import { generateDynamicAssignmentStructure } from "../services/dynamicStructure";
import { countProseWords } from "../../../shared/proseBlocks";
import { canonicalizeAssignmentUpdate,normalizeAssignmentAnswers } from "../../../domain/assignment/answerKeys";
import { selectApprovedSources } from "../../../domain/assignment/approvedSources";
import { createContext,useContext,useState,useCallback,useEffect,ReactNode,useMemo,useRef } from "react";
import { purgeLegacyTemplateText } from "../../../domain/assignment/legacyPurge";
import type { CanonicalDocument,OutputTypeSpec,ProjectView,RubricReport } from "../../types";
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
AssignmentPhaseId,AcademicLevel,
AssignmentType,
AssignmentAnalysis,
ResearchPlan,
DiscoveredSource,
EvidenceItem,
ThinkingMap,
OutlineSection,
SubmissionCheckReport,SectionBreakdown,
AssignmentProjectState,
UploadedSourceDocument,
AssignmentBriefRubricCriterion,
CitationAuditResult,
RubricScoreReport,
SectionBudgetItem,
WritingToneConfig,WritingStyleConfig,AssignmentStructure,
FlowAuditResult
} from "../types";
import {
ASSIGNMENT_PHASES,cleanAnswerString,
extractStandardizedInstructions,
normalizeProjectAnswers,
normalizeAssignmentPhase,
AssignmentDraftingSection,
structureToInternalSections,
structureToSectionBudgets
} from "../types";
import { auditCitations,evaluateRubricCompliance,auditFlowAndTransitions } from "../services/submissionAuditService";
import { getCitationCoverage } from "../services/citationAnchoringService";
import { stripCircularReferences } from "../../../utils/briefExtractor";
import type { CourseworkExecutionMode } from "../../../features/coursework/types/orchestrator";
import { safeParseAnswerField } from "../../../shared/projectStateSchema";
import { useCourseworkAgent,type CourseworkAgent } from "./useCourseworkAgent";
import { buildAssignmentProjectState,computePhaseStatuses } from "./assignmentState";
import { readInternalSections,readRubricCriteria,readStructure,readSectionBudgets,readApprovedSourceIds,readWritingStyle } from "./answerReaders";

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

  // Unified 4-Phase Project State Model (Section 4.2)
  projectState: AssignmentProjectState;

  isLoading: boolean;
  error: string | null;
  // Stage flow (always the five-stage detailed flow)
  // Minimal vs Detailed Execution Mode (OT-10 Parity)
  /** Always "detailed": the five-stage flow is the only one. */
  executionMode: CourseworkExecutionMode;

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
  /** The coursework agent: each stage's AI step, its status and results. */
  agent: CourseworkAgent;
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


  // Save Answers Helper
  saveAnswers: (updates: Record<string, unknown>) => Promise<void>;
  updateProjectAnswers: (updates: Record<string, unknown>) => Promise<void>;
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
  initialStage: AssignmentPhaseId | null;
  onStageChangeCallback: (phase: AssignmentPhaseId, options?: { replace?: boolean }) => void;
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
  /** Keys changed since the last successful write: only these are sent (the server merges). */
  const dirtyKeysRef = useRef<Set<string>>(new Set());
  const [document, setDocument] = useState<CanonicalDocument | null>(null);
  const [rubric, setRubric] = useState<RubricReport | null>(null);
  const [outputType, setOutputType] = useState<OutputTypeSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const justPersistedIdRef = useRef<string | null>(null);
  const draftingInitTriedRef = useRef(false);
  const submissionAuditTriedRef = useRef(false);
  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPersisted = (e: Event) => {
      const custom = e as CustomEvent<{ draftId: string; realId: string; project: ProjectView }>;
      if (custom.detail && custom.detail.draftId === activeProjectId) {
        justPersistedIdRef.current = custom.detail.realId;
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
    // The new id already has its project in state: do not reload it (a reload
    // shows the loading skeleton and unmounts a stage mid-upload).
    justPersistedIdRef.current = realProject.projectId;
    setActiveProjectId(realProject.projectId);
    setProject(realProject);
    return realProject.projectId;
  }, [activeProjectId]);

  const [activeStage, setActiveStage] = useState<AssignmentPhaseId>(initialStage ?? "understand");

  useEffect(() => {
    if (initialStage) {
      setActiveStage(initialStage);
    }
  }, [initialStage]);

  // Active phase normalized from initial stage / phase
  const currentPhase: AssignmentPhaseId = useMemo(() => {
    return normalizeAssignmentPhase(activeStage);
  }, [activeStage]);



  // Phase 3 Drafting Engine state
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [generatingSectionIds, setGeneratingSectionIds] = useState<Record<string, boolean>>({});

  // The workspace has one flow: Extract → Understand → Sources → Drafting → Submission.
  const executionMode: CourseworkExecutionMode = "detailed";

  // Load project data with phase auto-migration
  const load = useCallback(async () => {
    if (justPersistedIdRef.current && justPersistedIdRef.current === activeProjectId && projectRef.current?.projectId === activeProjectId) {
      // Just committed from a draft: the project is already loaded and the stage keeps its state.
      justPersistedIdRef.current = null;
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const loaded = await getProject(activeProjectId);
      // Legacy template text from older saves is removed on every load, and settings
      // stored under old alias names are read from their one canonical key.
      const proj = { ...loaded, answers: normalizeAssignmentAnswers(purgeLegacyTemplateText(loaded.answers)) } as typeof loaded;
      const [rub, doc] = proj.hasDocument
        ? await Promise.all([getRubric(activeProjectId), getDocument(activeProjectId)])
        : [null, null];
      setProject(proj);
      setDocument(doc);
      setRubric(rub);
      setOutputType(await getOutputTypeSpec(proj.outputTypeId).catch(() => null));

      if (initialStage === null) {
        const persisted =
          proj.answers?.["assignment_current_phase"];
        const targetPhase: AssignmentPhaseId = normalizeAssignmentPhase(persisted);
        setActiveStage(targetPhase);
        onStageChangeCallback(targetPhase, { replace: true });
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
    async (updates: Record<string, unknown>) => {
      if (!project) return;
      // One stored name per setting (answerKeys.ts): older call sites may still
      // pass an alias ("instructions", "targetWordCount", ...); it lands on the canonical key.
      const standardized: Record<string, unknown> = canonicalizeAssignmentUpdate(updates);
      if (standardized.assignment_brief !== undefined) standardized.assignment_brief = cleanAnswerString(standardized.assignment_brief);
      if (standardized.word_limit !== undefined) standardized.word_limit = Number(standardized.word_limit);
      if (standardized.writing_style !== undefined && standardized.writing_tone === undefined) {
        standardized.writing_tone = tonePresetOf(standardized.writing_style) || "analytical";
      }
      if (standardized.writing_tone !== undefined) {
        standardized.writing_tone = tonePresetOf(standardized.writing_tone) || "analytical";
        if (standardized.writing_style === undefined) standardized.writing_style = { preset: standardized.writing_tone, label: standardized.writing_tone };
      }
      if (standardized.title !== undefined) {
        const titleVal = String(standardized.title ?? "").trim();
        if (titleVal) standardized.title = titleVal;
        else delete standardized.title;
      }

      const baseAnswers = projectRef.current?.answers || project?.answers || {};
      // ProjectView types answers as strings, but Coursework keeps JSON values
      // (sources, sections, structure) in them too: cast once, here.
      const mergedAnswers = { ...baseAnswers, ...standardized } as ProjectView["answers"];
      const safeAnswers = stripCircularReferences(mergedAnswers);
      const newTitle = typeof standardized.title === "string" ? standardized.title : undefined;
      if (projectRef.current) {
        projectRef.current = {
          ...projectRef.current,
          answers: safeAnswers,
          title: newTitle || projectRef.current.title,
        };
      }
      setProject((prev) => {
        if (!prev) return null;
        return { ...prev, answers: safeAnswers, title: newTitle || prev.title };
      });

      // One write in flight at a time. The first starts at once; changes made
      // while it runs are sent together, with their latest values, right after.
      // Only the changed keys are sent: the server merges them into the record, so
      // a value another request saved meanwhile is not overwritten with a stale copy.
      for (const k of Object.keys(standardized)) dirtyKeysRef.current.add(k);
      saveDirtyRef.current = true;
      if (!saveRunningRef.current) {
        saveRunningRef.current = true;
        setSaveStatus("saving");
        saveChainRef.current = (async () => {
          let failed = false;
          try {
            while (saveDirtyRef.current) {
              saveDirtyRef.current = false;
              const keys = Array.from(dirtyKeysRef.current);
              dirtyKeysRef.current.clear();
              const latest = (projectRef.current?.answers ?? safeAnswers) as Record<string, unknown>;
              // A key cleared in the editor (undefined) is sent as null so the clear is saved too.
              const patch = Object.fromEntries(keys.map((k) => [k, latest[k] === undefined ? null : latest[k]]));
              if (Object.keys(patch).length === 0) continue;
              try {
                await saveIntakeAnswers(activeProjectId, patch);
                failed = false;
              } catch (err) {
                failed = true;
                // Not lost: these keys go out again with the next save.
                for (const k of keys) dirtyKeysRef.current.add(k);
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
      });
      if (typeof onStageChangeCallback === "function") {
        onStageChangeCallback(phase, options);
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


  // Extract core properties from project answers
  const answers = project?.answers || {};
  const academicLevel: AcademicLevel =
    (answers["academic_level"] as AcademicLevel) ||
    "undergraduate";
  const assignmentType: AssignmentType =
    (answers["assignment_type"] as AssignmentType) ||
    "essay";
  // A stored target is clamped into range, never reset (a long dissertation keeps 50,000).
  const rawTarget = answers["word_limit"];
  const targetWordCount = rawTarget !== undefined && rawTarget !== null && rawTarget !== "" ? clampWordLimit(rawTarget) : WORD_LIMIT_DEFAULT;

  const rawCitation = answers["citation_style"];
  const citationStyle = cleanAnswerString(rawCitation) || DEFAULT_CITATION_STYLE;

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
    answers["writing_style"] ||
    answers["writing_tone"];
  const rawStyleKey =
    typeof rawStyle === "object" ? JSON.stringify(rawStyle) : String(rawStyle ?? "");
  const writingStyle: WritingStyleConfig = useMemo(() => readWritingStyle({ rawStyle }), [rawStyleKey]);

  const setWritingStyle = useCallback(
    async (style: WritingStyleConfig) => {
      await saveAnswers({
        writing_style: style,
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
    cleanAnswerString(answers["assignment_brief"]) ||
    cleanAnswerString(answers["briefText"]) ||
    cleanAnswerString(answers["brief"]) ||
    question;
  const assignmentBriefText = briefText;

  const structure: AssignmentStructure = useMemo(() => readStructure({ academicLevel, answers, assignmentType, briefText, question, targetWordCount }), [answers, question, assignmentType, academicLevel, targetWordCount, briefText]);

  const setStructure = useCallback(
    async (newStructure: AssignmentStructure) => {
      const internalSecs = structureToInternalSections(newStructure);
      const budgets = structureToSectionBudgets(newStructure);
      await saveAnswers({
        assignment_structure: newStructure,
        section_budgets: budgets,
        assignment_internal_sections: internalSecs,
      });
    },
    [saveAnswers]
  );

  const rawBudgets = answers["section_budgets"];
  const rawBudgetsKey =
    typeof rawBudgets === "object" ? JSON.stringify(rawBudgets) : String(rawBudgets ?? "");
  const sectionBudgets: SectionBudgetItem[] = useMemo(() => readSectionBudgets({ rawBudgets, structure, targetWordCount }), [rawBudgetsKey, rawBudgets, structure, targetWordCount]);

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
        section_budgets: updated,
      });
    },
    [sectionBudgets, saveAnswers]
  );

  const removeCustomSection = useCallback(
    async (id: string) => {
      const updated = sectionBudgets.filter((sec) => sec.id !== id);
      await saveAnswers({
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

  const approvedSourceIds: string[] = useMemo(() => readApprovedSourceIds({ answers, sources, userUploadedSources }), [answers, sources, userUploadedSources, question, citationStyle]);

  const rubricCriteriaList: AssignmentBriefRubricCriterion[] = useMemo(() => readRubricCriteria({ answers }), [answers]);

  const evidenceItems: EvidenceItem[] = useMemo(() => {
    const raw = answers["assignment_evidence_items"];
    if (!raw) return [];
    return safeParseAnswerField<EvidenceItem[]>(raw, []);
  }, [answers]);

  const thinkingMap: ThinkingMap | null = answers["assignment_thinking_map"]
    ? safeParseAnswerField<ThinkingMap | null>(answers["assignment_thinking_map"], null)
    : null;

  const outline: OutlineSection[] = useMemo(() => {
    const raw = answers["assignment_internal_sections"];
    if (!raw) return [];
    return safeParseAnswerField<OutlineSection[]>(raw, []);
  }, [answers]);

  const internalSections: AssignmentDraftingSection[] = useMemo(() => readInternalSections({ answers, briefText, question }), [answers, question, briefText]);

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
      });
      if (generated.length > 0) {
        setActiveSectionId((prev) => prev || generated[0].id);
      }
      return generated;
    }

    // No outline yet: build it from the brief (one section per question), never
    // from a generic theme template.
    const generated = structureToInternalSections(
      generateDynamicAssignmentStructure({ question, briefText, assignmentType, academicLevel, targetWordCount })
    );

    saveAnswers({
      assignment_internal_sections: generated,
    });

    if (generated.length > 0) {
      setActiveSectionId((prev) => prev || generated[0].id);
    }
    return generated;
  }, [structure, targetWordCount, question, briefText, assignmentType, academicLevel, saveAnswers]);

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
      const words = countProseWords(content);
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
      });
    },
    [latestSections, saveAnswers]
  );

  /**
   * Rebuild the drafting sections from the brief (one per question, marks-weighted
   * budgets), keeping the text of every section that is still there.
   */
  const tuneOutlineWithQuestion = useCallback(async (): Promise<AssignmentDraftingSection[]> => {
    const existing = new Map(latestSections().map((sec) => [sec.id, sec]));
    const rebuilt = structureToInternalSections(
      generateDynamicAssignmentStructure({ question, briefText, assignmentType, academicLevel, targetWordCount })
    ).map((sec) => {
      const prev = existing.get(sec.id);
      return prev?.draftContent ? { ...sec, draftContent: prev.draftContent, status: prev.status } : sec;
    });
    await saveAnswers({ assignment_internal_sections: rebuilt });
    return rebuilt;
  }, [question, briefText, assignmentType, academicLevel, targetWordCount, latestSections, saveAnswers]);

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

  const agent = useCourseworkAgent({
    projectId: activeProjectId,
    answers,
    question,
    citationStyle,
    sources,
    approvedSourceIds,
    structure,
    latestSections: () => latestSections() as AssignmentDraftingSection[],
    flushSaves: async () => {
      await saveChainRef.current;
    },
    reload: async () => {
      const loadedFresh = await getProject(activeProjectId);
      const fresh = { ...loadedFresh, answers: purgeLegacyTemplateText(loadedFresh.answers) } as typeof loadedFresh;
      projectRef.current = fresh;
      setProject(fresh);
      return (fresh.answers ?? {}) as Record<string, unknown>;
    },
    saveAnswers,
  });

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
      const words = countProseWords(sec.draftContent || "");
      return {
        ...sec,
        currentWordCount: words,
        status: (words > 0 ? "completed" : "pending") as AssignmentDraftingSection["status"],
      };
    });
    await saveAnswers({
      assignment_internal_sections: updated,
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
    if (currentPhase !== "drafting") {
      draftingInitTriedRef.current = false;
      return;
    }
    // Once per visit: an empty plan must not retrigger itself through the save it causes.
    if (!isLoading && internalSections.length === 0 && targetWordCount > 0 && !draftingInitTriedRef.current) {
      draftingInitTriedRef.current = true;
      initializeDraftingPlan();
    }
  }, [currentPhase, isLoading, internalSections.length, targetWordCount, initializeDraftingPlan]);




  // Compute 5-phase status
  const phaseStatuses: Record<AssignmentPhaseId, "active" | "completed" | "upcoming"> = useMemo(() => {
    return computePhaseStatuses({ question, targetWordCount, citationStyle, structure, analysis, sources, approvedSourceIds, currentWordCount, submissionReport, currentPhase });
  }, [
    question,
    targetWordCount,
    citationStyle,
    structure,
    analysis,
    sources,
    approvedSourceIds,
    currentWordCount,
    submissionReport,
    currentPhase,
  ]);


  // Unified 4-Phase Project State Model (Section 4.2)
  const projectState: AssignmentProjectState = useMemo(() => {
    return buildAssignmentProjectState({ activeProjectId, currentPhase, question, targetWordCount, sections, academicLevel, assignmentType, citationStyle, sectionBudgets, writingStyle, writingTone, rubricCriteriaList, analysis, sources, userUploadedSources, approvedSourceIds, evidenceItems, internalSections, outline, activeSectionId, currentWordCount, document, thinkingMap, submissionReport, citationAuditResult, flowAuditResult });
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
      const approvedSources = selectApprovedSources(sources, approvedSourceIds);
      const citationCoverage = getCitationCoverage(activeSecs, approvedSources);

      // 2. Rubric Compliance Evaluation
      const rubricReport = evaluateRubricCompliance(
        fullMarkdown,
        projectState.brief,
        citAudit,
        citationCoverage,
        activeSecs.map((sec: { title?: string; draftContent?: string }) => ({ title: sec.title || "", draftContent: sec.draftContent || "" }))
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
    if (currentPhase !== "submission") {
      submissionAuditTriedRef.current = false;
      return;
    }
    // Once per visit: a failing audit must not restart itself in a loop.
    if (!isLoading && currentWordCount > 0 && !submissionReport && !isAuditingSubmission && !submissionAuditTriedRef.current) {
      submissionAuditTriedRef.current = true;
      runSubmissionAudit().catch((e) => console.error("Submission audit failed:", e));
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
        agent,
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
        executionMode,
        saveAnswers,
        updateProjectAnswers: saveAnswers,
      }}
    >
      {children}
    </AssignmentContext.Provider>
  );
}

export default AssignmentContext;

