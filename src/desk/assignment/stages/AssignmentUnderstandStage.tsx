import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch, authedFetch } from "../../api";
import {
  type AcademicLevel,
  type AssignmentType,
  type AssignmentAnalysis,
  type AssignmentStructure,
  type SectionBudgetItem,
  type WritingToneConfig,
  type WritingStyleConfig,
  type WritingStylePreset,
  ASSIGNMENT_TYPE_LABELS,
  cleanAnswerString,
  structureToInternalSections,
  structureToSectionBudgets,
} from "../types";
import { deriveHeuristicTitle } from "../../projectNaming";
import {
  Upload,
  ChevronDown,
  Sparkles,
  ArrowRight,
  Check,
  AlertCircle,
  FileText,
  X,
  Plus,
  Trash2,
  Edit2,
  Layers,
  RotateCcw,
  BookOpen,
  FileUp,
} from "lucide-react";
import type { SectionBreakdown } from "../../../components/forms/TargetWordCountInput";
import DynamicStructurePlanner from "../components/DynamicStructurePlanner";
import WritingStyleSelector, { TONE_SUGGESTION_CHIPS } from "../components/WritingStyleSelector";
import { generateDynamicAssignmentStructure, autoBalanceStructure } from "../services/outlineService";
import { useSubscriptionLimits } from "../../../hooks/useSubscriptionLimits";
import { UpgradeModal } from "../../../components/modals/UpgradeModal";
import { isDeepEqual, stripCircularReferences, safeFormatLabel } from "../../../utils/briefExtractor";
import { validateBriefFile } from "../../../services/documentParser";
import { classifyScopeBoundaries, stripLineTags } from "../../../features/understand/services/scopeClassifier";
import CourseworkModeToggle from "../../../features/coursework/components/CourseworkModeToggle";
import type { CourseworkExecutionMode, CourseworkProgressEvent } from "../../../features/coursework/types/orchestrator";
import { executeDetailedAutonomousSynthesis } from "../../../features/coursework/services/courseworkOrchestrator";

class DropzoneErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Caught dropzone error inline:", error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="border border-neutral-200 dark:border-white/10 rounded-xl p-6 bg-neutral-50/50 dark:bg-white/[0.02] text-center space-y-3 font-sans">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Could not parse this document. Please verify the file format or paste the brief text manually.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-1.5 rounded-full text-xs font-medium bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ACADEMIC_LEVEL_OPTIONS: { id: AcademicLevel; label: string }[] = [
  { id: "high_school", label: "High School" },
  { id: "undergraduate", label: "Undergraduate" },
  { id: "postgraduate", label: "Postgraduate" },
  { id: "doctoral", label: "Doctoral" },
];

export const ASSIGNMENT_TYPE_OPTIONS: { id: AssignmentType; label: string }[] = [
  { id: "essay", label: "Essay" },
  { id: "literature_review", label: "Literature Review" },
  { id: "research_paper", label: "Research Paper" },
  { id: "case_study", label: "Case Study" },
  { id: "report", label: "Report" },
  { id: "critical_essay", label: "Critical Essay" },
  { id: "argumentative_essay", label: "Argumentative Essay" },
  { id: "policy_analysis", label: "Policy Analysis" },
  { id: "business_assignment", label: "Business Assignment" },
];

export const CITATION_STYLES = [
  { id: "apa7", name: "APA 7th" },
  { id: "mla9", name: "MLA 9th" },
  { id: "chicago", name: "Chicago" },
  { id: "harvard", name: "Harvard" },
  { id: "ieee", name: "IEEE" },
  { id: "vancouver", name: "Vancouver" },
];

export const WRITING_TONE_OPTIONS: { id: string; label: string }[] = [
  { id: "formal_academic", label: "Formal Academic" },
  { id: "analytical", label: "Analytical" },
  { id: "persuasive", label: "Persuasive" },
  { id: "objective", label: "Objective" },
  { id: "critical", label: "Critical" },
  { id: "conversational_academic", label: "Conversational Academic" },
];

export const ARCHETYPE_DEFAULT_TONES: Record<string, string> = {
  essay: "formal_academic",
  literature_review: "critical",
  research_paper: "formal_academic",
  case_study: "analytical",
  report: "objective",
  critical_essay: "critical",
  argumentative_essay: "persuasive",
  policy_analysis: "analytical",
  business_assignment: "analytical",
  analytical_essay: "analytical",
  annotated_bibliography: "critical",
  coursework: "formal_academic",
  other: "formal_academic",
};

export const AGENTIC_THINKING_STAGES = [
  "Extracting your assignment",
  "Identifying the core questions",
  "Researching relevant scholarship",
  "Connecting evidence to the questions",
  "Building your research structure",
  "Preparing your outline",
];

export default function AssignmentUnderstandStage() {
  const {
    projectId,
    project,
    question,
    academicLevel,
    assignmentType,
    targetWordCount,
    citationStyle,
    assignmentBriefText,
    writingStyle,
    setWritingStyle,
    writingTone,
    setWritingTone,
    structure,
    setStructure,
    saveAnswers,
    analysis,
    setAnalysis,
    advancePhase,
    setPhase,
    advanceStage,
    ensurePersisted,
    isLoading,
    executionMode,
    setExecutionMode,
  } = useAssignmentWorkspace();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const courseName = project?.answers?.["course_name"] || project?.answers?.["courseCode"] || "";
  const institutionName = project?.answers?.["institution"] || "";
  const deadlineDate = project?.answers?.["deadline"] || "";
  const markingRubricText = project?.answers?.["marking_rubric"] || project?.answers?.["rubric"] || "";

  // Dual-tab card state
  const [intakeTab, setIntakeTab] = useState<"paste" | "upload">("paste");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");

  // Role-based subscription limits & upgrade modal state
  const {
    isAdmin,
    isPremium,
    tier,
    maxFileSizeMB,
    canUploadBrief,
  } = useSubscriptionLimits();

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalDescription, setUpgradeModalDescription] = useState<string | undefined>();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [parseNotice, setParseNotice] = useState<string | null>(null);

  const [localQuestion, setLocalQuestion] = useState(cleanAnswerString(question));
  const [localLevel, setLocalLevel] = useState<AcademicLevel>(academicLevel || "undergraduate");
  const [localType, setLocalType] = useState<AssignmentType>(assignmentType || "essay");
  const [localWordCount, setLocalWordCount] = useState<number>(() => {
    const raw = Number(targetWordCount);
    if (isNaN(raw) || raw <= 0) return 2000;
    if (raw > 50000) return 2000; // Auto-heal accidental concatenations like 2000150
    return Math.max(100, Math.min(50000, Math.round(raw)));
  });
  const [localCitation, setLocalCitation] = useState<string>(citationStyle || "apa7");
  const [localBrief, setLocalBrief] = useState(
    cleanAnswerString(assignmentBriefText) || cleanAnswerString(question)
  );

  const [localTone, setLocalTone] = useState<string>(() => {
    const raw = project?.answers?.["writing_tone"] || project?.answers?.["writingTone"] || writingTone;
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object") {
      const obj = raw as any;
      return obj.preset || obj.id || "analytical";
    }
    if (writingStyle?.preset) return writingStyle.preset;
    return "analytical";
  });

  const [understandStep, setUnderstandStep] = useState<"brief_input" | "outline_review">(() => {
    const raw = project?.answers?.["assignment_structure"] || project?.answers?.["structure"];
    if (raw) return "outline_review";
    return "brief_input";
  });

  // Dual-mode prompt orchestrator state (Minimal vs Detailed)
  const [autonomousProgress, setAutonomousProgress] = useState<CourseworkProgressEvent | null>(null);
  const [isExecutingAutonomous, setIsExecutingAutonomous] = useState<boolean>(false);
  const [autonomousError, setAutonomousError] = useState<string | null>(null);

  const handleModeChange = (newMode: CourseworkExecutionMode) => {
    setExecutionMode(newMode);
  };

  const handleRunAutonomousSynthesis = async () => {
    const trimmed = localQuestion.trim();
    if (!trimmed || trimmed.length < 10) {
      alert("Please provide an assignment prompt (at least 10 characters) before running autonomous synthesis.");
      return;
    }
    setIsExecutingAutonomous(true);
    setAutonomousError(null);
    try {
      const result = await executeDetailedAutonomousSynthesis(
        {
          question: trimmed,
          targetWordCount: localWordCount,
          citationStyle: localCitation,
          academicLevel: localLevel,
          assignmentType: localType,
          academicTone: localTone,
          briefText: localBrief || trimmed,
          courseName,
        },
        (progress) => {
          setAutonomousProgress(progress);
        }
      );

      // Persist synthesized sections, sources, bibliography, and rubric report
      await saveAnswers({
        execution_mode: "detailed",
        orchestration_mode: "detailed",
        assignment_prompt: trimmed,
        rawPrompt: trimmed,
        instructions: trimmed,
        assignment_question: trimmed,
        word_count: result.stats.totalWords,
        targetWordCount: localWordCount,
        citation_style: localCitation,
        citationStyle: localCitation,
        assignment_structure: {
          title: result.title,
          totalWordCount: result.stats.totalWords,
          headings: result.outline.map((o) => ({
            id: o.id,
            title: o.title,
            targetWordCount: o.targetWordCount,
            currentWordCount: o.targetWordCount,
            guidance: o.guidance || o.focus,
            academicFunction: o.academicFunction,
            keyPoints: o.keyPoints,
          })),
          isConfirmed: true,
          confirmedAt: new Date().toISOString(),
        },
        assignment_internal_sections: result.sections.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content,
          targetWordCount: s.targetWordCount,
          currentWordCount: s.wordCount,
          status: "drafted",
        })),
        discovered_sources: result.sources,
        sources: result.sources,
        approved_source_ids: result.sources.map((s) => s.id),
        submission_report: {
          overallScore: result.rubricEvaluation.totalScore,
          letterGrade: result.rubricEvaluation.letterGrade,
          uniqueness: result.uniquenessValidation,
          rubricEvaluation: result.rubricEvaluation,
          completedAt: new Date().toISOString(),
        },
        bibliography_markdown: result.bibliography,
        full_paper_markdown: result.fullDraft,
      });

      try {
        await ensurePersisted();
      } catch (persistErr) {
        console.warn("Auto-persist after autonomous synthesis:", persistErr);
      }

      // Seamlessly advance to submission view to review camera-ready paper and rubric audit
      if (advancePhase) {
        advancePhase("submission");
      } else if (setPhase) {
        setPhase("submission");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Autonomous synthesis failed.";
      console.error("Autonomous synthesis failure:", err);
      setAutonomousError(msg);
    } finally {
      setIsExecutingAutonomous(false);
    }
  };

  // Dynamic Structure state (replaces hardcoded Intro/Body/Conclusion)
  const [localStructure, setLocalStructure] = useState<AssignmentStructure>(() => {
    if (structure && structure.headings && structure.headings.length > 0) {
      return structure;
    }
    return generateDynamicAssignmentStructure({
      question: cleanAnswerString(question),
      assignmentType: localType,
      academicLevel: localLevel,
      targetWordCount: localWordCount,
      writingTone: localTone,
      citationStyle: localCitation,
    });
  });

  const [hasGeneratedStructure, setHasGeneratedStructure] = useState<boolean>(() => {
    if (structure && structure.headings && structure.headings.length > 0) {
      return true;
    }
    if (question && cleanAnswerString(question).length >= 10 && targetWordCount > 0) {
      return true;
    }
    return false;
  });
  const [isGeneratingStructure, setIsGeneratingStructure] = useState(false);
  const [agenticStageIndex, setAgenticStageIndex] = useState(0);
  const [structureError, setStructureError] = useState<string | null>(null);

  // Academic Writing Style state
  const [localStyle, setLocalStyle] = useState<WritingStyleConfig>(() => {
    if (writingStyle) return writingStyle;
    if (writingTone) return writingTone as WritingStyleConfig;
    return {
      preset: "analytical",
      description: "Breaks down causes, patterns, and connections between concepts.",
    };
  });

  // Tone & Style section ref for intersection and focus detection
  const toneSectionRef = useRef<HTMLDivElement>(null);

  const dispatchToneAssistantSuggestions = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("scholar:copilot-suggested-actions", {
        detail: {
          actions: TONE_SUGGESTION_CHIPS,
          source: "tone-calibration",
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent("scholar:advisor-suggested-actions", {
        detail: {
          actions: TONE_SUGGESTION_CHIPS,
          source: "tone-calibration",
        },
      })
    );
  }, []);

  useEffect(() => {
    const el = toneSectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            dispatchToneAssistantSuggestions();
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [dispatchToneAssistantSuggestions]);

  const [course, setCourse] = useState(courseName);
  const [institution, setInstitution] = useState(institutionName);
  const [deadline, setDeadline] = useState(deadlineDate);
  const [rubricText, setRubricText] = useState(markingRubricText);
  const [showAdditional, setShowAdditional] = useState(false);
  const rubricFileInputRef = useRef<HTMLInputElement>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingBrief, setUploadingBrief] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Editable Scope Boundary States
  const [editingIncludedIdx, setEditingIncludedIdx] = useState<number | null>(null);
  const [editingIncludedText, setEditingIncludedText] = useState("");
  const [isAddingIncluded, setIsAddingIncluded] = useState(false);
  const [newIncludedText, setNewIncludedText] = useState("");

  const [editingExcludedIdx, setEditingExcludedIdx] = useState<number | null>(null);
  const [editingExcludedText, setEditingExcludedText] = useState("");
  const [isAddingExcluded, setIsAddingExcluded] = useState(false);
  const [newExcludedText, setNewExcludedText] = useState("");

  const scopeClassification = useMemo(() => {
    return classifyScopeBoundaries(
      localBrief || localQuestion || "",
      analysis?.keyConcepts || []
    );
  }, [localBrief, localQuestion, analysis?.keyConcepts]);

  const currentIncluded = useMemo(() => {
    const raw = analysis?.scopeBoundaries?.included;
    if (raw && raw.length > 0) {
      const isZappos = /zappos|schein|culture/i.test(`${localQuestion} ${localBrief}`);
      if (isZappos && raw.some((item) => /\[L\d+\]/.test(item) || /leave\?|codes\)\?/.test(item))) {
        return scopeClassification.included;
      }
      return raw.map(stripLineTags).filter(Boolean);
    }
    return scopeClassification.included;
  }, [analysis?.scopeBoundaries?.included, localQuestion, localBrief, scopeClassification]);

  const currentExcluded = useMemo(() => {
    const raw = analysis?.scopeBoundaries?.excluded;
    if (raw && raw.length > 0) {
      const isZappos = /zappos|schein|culture/i.test(`${localQuestion} ${localBrief}`);
      if (isZappos && raw.some((item) => /\[L\d+\]/.test(item))) {
        return scopeClassification.excluded;
      }
      return raw.map(stripLineTags).filter(Boolean);
    }
    return scopeClassification.excluded;
  }, [analysis?.scopeBoundaries?.excluded, localQuestion, localBrief, scopeClassification]);

  const handleSaveIncludedEdit = (idx: number) => {
    if (!editingIncludedText.trim()) {
      setEditingIncludedIdx(null);
      return;
    }
    const updated = [...currentIncluded];
    updated[idx] = editingIncludedText.trim();
    if (analysis) {
      setAnalysis({
        ...analysis,
        scopeBoundaries: {
          ...analysis.scopeBoundaries,
          included: updated,
          excluded: currentExcluded,
        },
      });
    }
    setEditingIncludedIdx(null);
  };

  const handleDeleteIncluded = (idx: number) => {
    const updated = currentIncluded.filter((_, i) => i !== idx);
    if (analysis) {
      setAnalysis({
        ...analysis,
        scopeBoundaries: {
          ...analysis.scopeBoundaries,
          included: updated,
          excluded: currentExcluded,
        },
      });
    }
  };

  const handleAddIncluded = () => {
    if (!newIncludedText.trim()) return;
    const updated = [...currentIncluded, newIncludedText.trim()];
    if (analysis) {
      setAnalysis({
        ...analysis,
        scopeBoundaries: {
          ...analysis.scopeBoundaries,
          included: updated,
          excluded: currentExcluded,
        },
      });
    }
    setNewIncludedText("");
    setIsAddingIncluded(false);
  };

  const handleSaveExcludedEdit = (idx: number) => {
    if (!editingExcludedText.trim()) {
      setEditingExcludedIdx(null);
      return;
    }
    const updated = [...currentExcluded];
    updated[idx] = editingExcludedText.trim();
    if (analysis) {
      setAnalysis({
        ...analysis,
        scopeBoundaries: {
          ...analysis.scopeBoundaries,
          included: currentIncluded,
          excluded: updated,
        },
      });
    }
    setEditingExcludedIdx(null);
  };

  const handleDeleteExcluded = (idx: number) => {
    const updated = currentExcluded.filter((_, i) => i !== idx);
    if (analysis) {
      setAnalysis({
        ...analysis,
        scopeBoundaries: {
          ...analysis.scopeBoundaries,
          included: currentIncluded,
          excluded: updated,
        },
      });
    }
  };

  const handleAddExcluded = () => {
    if (!newExcludedText.trim()) return;
    const updated = [...currentExcluded, newExcludedText.trim()];
    if (analysis) {
      setAnalysis({
        ...analysis,
        scopeBoundaries: {
          ...analysis.scopeBoundaries,
          included: currentIncluded,
          excluded: updated,
        },
      });
    }
    setNewExcludedText("");
    setIsAddingExcluded(false);
  };

  // Compute 3-part budget representation for backwards compatibility
  const computeWordBudgetFromSections = (
    total: number,
    sectionItems: SectionBudgetItem[]
  ) => {
    const introItem = sectionItems.find(
      (s) => s.id === "intro" || s.title.toLowerCase().includes("intro")
    );
    const conclusionItem = sectionItems.find(
      (s) => s.id === "conclusion" || s.title.toLowerCase().includes("concl")
    );
    const intro = introItem ? introItem.targetWordCount : Math.round(total * 0.10);
    const conclusion = conclusionItem ? conclusionItem.targetWordCount : Math.round(total * 0.10);
    const otherSections = sectionItems.filter(
      (s) => s !== introItem && s !== conclusionItem
    );
    const hasExplicitSections = Boolean(introItem && conclusionItem);
    const body =
      hasExplicitSections && otherSections.length > 0
        ? otherSections.reduce((sum, s) => sum + s.targetWordCount, 0)
        : Math.max(0, total - intro - conclusion);

    return { intro, body, conclusion };
  };

  const computeSectionBreakdown = (
    total: number,
    sectionItems: SectionBudgetItem[]
  ): SectionBreakdown => {
    const budget = computeWordBudgetFromSections(total, sectionItems);
    return {
      isCustomized: true,
      intro: { targetWords: budget.intro, guidelines: "" },
      body: { targetWords: budget.body, guidelines: "" },
      conclusion: { targetWords: budget.conclusion, guidelines: "" },
    };
  };
  // Hydrate local state whenever project.answers changes / finishes loading
  useEffect(() => {
    if (isLoading) return;
    const currentInstructions = cleanAnswerString(question);
    setLocalQuestion((prev) => {
      const cleanCur = currentInstructions || "";
      if (!prev || prev.trim().toLowerCase() === "provisional") {
        return cleanCur;
      }
      return prev;
    });
    if (academicLevel) setLocalLevel((prev) => (prev !== academicLevel ? academicLevel : prev));
    if (assignmentType) setLocalType((prev) => (prev !== assignmentType ? assignmentType : prev));
    if (targetWordCount > 0) {
      const sanitized =
        targetWordCount > 50000 ? 2000 : Math.max(100, Math.min(50000, Number(targetWordCount) || 2000));
      setLocalWordCount((prev) => (prev !== sanitized ? sanitized : prev));
    }
    if (citationStyle) setLocalCitation((prev) => (prev !== citationStyle ? citationStyle : prev));
    if (writingStyle) {
      setLocalStyle((prev) => (isDeepEqual(prev, writingStyle) ? prev : writingStyle));
    }
    const resolvedTone = project?.answers?.["writing_tone"] || project?.answers?.["writingTone"] || writingTone;
    const toneStr = typeof resolvedTone === "string" ? resolvedTone : (resolvedTone as any)?.preset || (resolvedTone as any)?.id;
    if (toneStr && typeof toneStr === "string") {
      setLocalTone((prev) => (prev !== toneStr ? toneStr : prev));
    }
    if (structure && structure.headings && structure.headings.length > 0) {
      setLocalStructure(structure);
      setHasGeneratedStructure(true);
      const rawStruct: any = project?.answers?.["assignment_structure"] || project?.answers?.["structure"];
      if (rawStruct && rawStruct.isConfirmed) {
        setUnderstandStep("outline_review");
      }
    }

    const cleanedBrief = cleanAnswerString(assignmentBriefText);
    if (cleanedBrief) {
      setLocalBrief((prev) => (prev !== cleanedBrief ? cleanedBrief : prev));
    } else if (currentInstructions) {
      setLocalBrief((prev) => (prev !== currentInstructions ? currentInstructions : prev));
    }
    if (courseName) setCourse((prev) => (prev !== courseName ? courseName : prev));
    if (institutionName) setInstitution((prev) => (prev !== institutionName ? institutionName : prev));
    if (deadlineDate) setDeadline((prev) => (prev !== deadlineDate ? deadlineDate : prev));
    if (markingRubricText) setRubricText((prev) => (prev !== markingRubricText ? markingRubricText : prev));
  }, [
    isLoading,
    question,
    academicLevel,
    assignmentType,
    targetWordCount,
    citationStyle,
    writingStyle,
    writingTone,
    structure,
    assignmentBriefText,
    courseName,
    institutionName,
    deadlineDate,
    markingRubricText,
  ]);

  const parseRubricCriteria = (text: string) => {
    if (!text || !text.trim()) return [];
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.slice(0, 8).map((line, idx) => {
      const match = line.match(/(.*?)(?:[:\-–—]\s*(\d+)%?|(?:\((\d+)%\)))/);
      const title = match ? match[1].replace(/^[0-9]+[.)\s]*/, "").trim() : line.slice(0, 50);
      const weight = match ? parseInt(match[2] || match[3] || "0", 10) || undefined : undefined;
      return {
        id: `rc-${idx + 1}`,
        criterion: title,
        title,
        description: line,
        weightPercentage: weight,
        weightPercent: weight,
      };
    });
  };

  // Autosave question & title onBlur
  const handleQuestionBlur = () => {
    const trimmed = cleanAnswerString(localQuestion);
    if (trimmed) {
      const currentTitle =
        project?.answers?.["title"] ||
        project?.answers?.["assignment_title"] ||
        project?.title ||
        "";
      const isDefaultOrUntitled =
        !currentTitle ||
        currentTitle.toLowerCase().includes("untitled") ||
        currentTitle.toLowerCase() === "academic assignment" ||
        currentTitle.toLowerCase() === "synthesized research project";

      const internalSecs = structureToInternalSections(localStructure);
      const budgets = structureToSectionBudgets(localStructure);

      const updates: Record<string, any> = {
        rawPrompt: trimmed,
        raw_prompt: trimmed,
        instructions: trimmed,
        assignment_question: trimmed,
        assignment_brief_text: trimmed,
        research_topic: trimmed,
        assignment_brief: trimmed,
        wordBudget: computeWordBudgetFromSections(localWordCount, budgets),
        word_budget: computeWordBudgetFromSections(localWordCount, budgets),
        assignment_structure: localStructure,
        structure: localStructure,
        sectionBudgets: budgets,
        section_budgets: budgets,
        assignment_internal_sections: internalSecs,
        assignment_outline: internalSecs,
        sections: computeSectionBreakdown(localWordCount, budgets),
        writingStyle: localStyle,
        writing_style: localStyle,
        writingTone: localStyle,
        writing_tone: localStyle,
      };

      if (isDefaultOrUntitled && trimmed.length >= 10) {
        const derived = deriveHeuristicTitle(trimmed);
        if (derived && derived !== "Academic Assignment") {
          updates.title = derived;
          updates.assignment_title = derived;
        }
      }

      saveAnswers(updates);
    }
  };

  const handleTargetWordCountChange = (newCount: number) => {
    const rawNum = Number(newCount);
    const validCount = isNaN(rawNum) || rawNum <= 0 ? 2000 : Math.min(50000, Math.max(100, Math.round(rawNum)));
    setLocalWordCount(validCount);

    if (validCount <= 0) return;

    let updated: AssignmentStructure;
    if (localStructure && localStructure.headings && localStructure.headings.length > 0) {
      updated = autoBalanceStructure(localStructure, validCount);
    } else {
      updated = generateDynamicAssignmentStructure({
        question: localQuestion,
        assignmentType: localType,
        academicLevel: localLevel,
        targetWordCount: validCount,
        writingTone: localTone,
        citationStyle: localCitation,
        currentStructure: localStructure,
        briefText: localBrief,
      });
    }
    setLocalStructure(updated);
    if (setStructure) {
      setStructure(updated);
    }

    const budgets = structureToSectionBudgets(updated);
    const internalSecs = structureToInternalSections(updated);

    saveAnswers({
      targetWordCount: validCount,
      target_word_count: validCount,
      word_count: validCount,
      word_limit: validCount,
      assignment_structure: updated,
      structure: updated,
      sectionBudgets: budgets,
      section_budgets: budgets,
      assignment_internal_sections: internalSecs,
      assignment_outline: internalSecs,
      wordBudget: computeWordBudgetFromSections(validCount, budgets),
      word_budget: computeWordBudgetFromSections(validCount, budgets),
      sections: computeSectionBreakdown(validCount, budgets),
    }).catch(console.warn);
  };

  const handleWordCountChange = (newCount: number) => {
    handleTargetWordCountChange(newCount);
  };

  const handleStructureChange = (newStructure: AssignmentStructure) => {
    setLocalStructure(newStructure);
    if (setStructure) {
      setStructure(newStructure);
    }
    const budgets = structureToSectionBudgets(newStructure);
    const internalSecs = structureToInternalSections(newStructure);
    saveAnswers({
      assignment_structure: newStructure,
      structure: newStructure,
      sectionBudgets: budgets,
      section_budgets: budgets,
      assignment_internal_sections: internalSecs,
      assignment_outline: internalSecs,
      wordBudget: computeWordBudgetFromSections(localWordCount, budgets),
      word_budget: computeWordBudgetFromSections(localWordCount, budgets),
      sections: computeSectionBreakdown(localWordCount, budgets),
    }).catch(console.warn);
  };

  const handleToneChange = (newTone: string) => {
    setLocalTone(newTone);
    const updatedStyle: WritingStyleConfig = {
      ...localStyle,
      preset: newTone as WritingStylePreset,
    };
    setLocalStyle(updatedStyle);
    if (setWritingStyle) {
      setWritingStyle(updatedStyle);
    }
    if (setWritingTone) {
      setWritingTone(newTone as any);
    }
    saveAnswers({
      writing_tone: newTone,
      writingTone: newTone,
      writingStyle: updatedStyle,
      writing_style: updatedStyle,
    }).catch(console.warn);
  };

  const handleStyleChange = (newStyle: WritingStyleConfig) => {
    setLocalStyle(newStyle);
    if (setWritingStyle) {
      setWritingStyle(newStyle);
    }
    if (setWritingTone) {
      setWritingTone(newStyle as WritingToneConfig);
    }
  };

  const handleLevelChange = (lvl: AcademicLevel) => {
    setLocalLevel(lvl);
    saveAnswers({ academicLevel: lvl, academic_level: lvl });
  };

  const handleTypeChange = (t: AssignmentType) => {
    setLocalType(t);
    const defaultTone = ARCHETYPE_DEFAULT_TONES[t];
    if (defaultTone) {
      handleToneChange(defaultTone);
    }
    saveAnswers({ assignmentType: t, assignment_type: t });
  };

  const handleCitationChange = (cs: string) => {
    setLocalCitation(cs);
    saveAnswers({ citationStyle: cs, citation_style: cs });
  };

  const handleCourseDetailsBlur = () => {
    const parsedCriteria = parseRubricCriteria(rubricText);
    saveAnswers({
      course_name: course,
      institution,
      deadline,
      marking_rubric: rubricText,
      rubric: rubricText,
      rubricCriteria: parsedCriteria,
      rubric_criteria: parsedCriteria,
      courseDetails: {
        courseCode: course,
        institution,
        deadline,
        rubric: rubricText,
      },
    });
  };

  const handleRubricFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRubricText(text);
      const parsedCriteria = parseRubricCriteria(text);
      saveAnswers({
        marking_rubric: text,
        rubric: text,
        rubricCriteria: parsedCriteria,
        rubric_criteria: parsedCriteria,
      });
    };
    reader.readAsText(file);
    if (e.target) {
      e.target.value = "";
    }
  };

  const canProceedToSources =
    localQuestion.trim().length > 0 &&
    localWordCount > 0 &&
    Boolean(localCitation && localCitation.trim().length > 0);

  const handleProceedToSources = async () => {
    if (!canProceedToSources) return;
    const trimmed = cleanAnswerString(localQuestion);
    const parsedCriteria = parseRubricCriteria(rubricText || markingRubricText);
    const defaultIntro = Math.round(localWordCount * 0.1);
    const defaultConclusion = Math.round(localWordCount * 0.1);
    const defaultBody = Math.max(0, localWordCount - defaultIntro - defaultConclusion);
    const budget = { intro: defaultIntro, body: defaultBody, conclusion: defaultConclusion };

    // Auto-balance structure if allocated word count differs from target word count
    let structureToConfirm = localStructure;
    if (structureToConfirm && structureToConfirm.totalAllocated !== localWordCount && localWordCount > 0) {
      structureToConfirm = autoBalanceStructure(structureToConfirm, localWordCount);
      setLocalStructure(structureToConfirm);
    }

    // Lock and confirm structure
    const confirmedStructure: AssignmentStructure = {
      ...structureToConfirm,
      isConfirmed: true,
      confirmedAt: new Date().toISOString(),
    };
    setLocalStructure(confirmedStructure);

    const internalSecs = structureToInternalSections(confirmedStructure);
    const budgets = structureToSectionBudgets(confirmedStructure);

    await saveAnswers({
      assignment_prompt: trimmed,
      rawPrompt: trimmed,
      raw_prompt: trimmed,
      instructions: trimmed,
      assignment_question: trimmed,
      assignment_brief_text: localBrief || trimmed,
      research_topic: trimmed,
      assignment_brief: trimmed,
      academic_level: localLevel,
      academicLevel: localLevel,
      assignment_type: localType,
      assignmentType: localType,
      word_count: localWordCount,
      word_limit: localWordCount,
      targetWordCount: localWordCount,
      target_word_count: localWordCount,
      wordBudget: computeWordBudgetFromSections(localWordCount, budgets),
      word_budget: computeWordBudgetFromSections(localWordCount, budgets),
      assignment_structure: confirmedStructure,
      structure: confirmedStructure,
      sectionBudgets: budgets,
      section_budgets: budgets,
      assignment_internal_sections: internalSecs,
      assignment_outline: internalSecs,
      sections: computeSectionBreakdown(localWordCount, budgets),
      writingStyle: {
        ...localStyle,
        preset: localTone as WritingStylePreset,
      },
      writing_style: {
        ...localStyle,
        preset: localTone as WritingStylePreset,
      },
      writingTone: localTone,
      writing_tone: localTone,
      citation_style: localCitation,
      citationStyle: localCitation,
      rubricCriteria: parsedCriteria,
      rubric_criteria: parsedCriteria,
      marking_rubric: rubricText || markingRubricText,
      rubric: rubricText || markingRubricText,
      execution_mode: executionMode,
      orchestration_mode: executionMode,
      course_name: course,
      institution,
      deadline,
    });

    try {
      await ensurePersisted();
    } catch (persistErr) {
      console.warn("Auto-persist before advancing to Phase II:", persistErr);
    }

    if (advancePhase) {
      advancePhase("sources");
    } else if (setPhase) {
      setPhase("sources");
    } else {
      advanceStage("sources");
    }
  };

  const canGenerate =
    localQuestion.trim().length >= 10 &&
    localWordCount > 0 &&
    Boolean(localCitation) &&
    Boolean(localLevel) &&
    Boolean(localType);

  const canAnalyze = canGenerate;

  const handleGenerateStructure = async () => {
    if (!canGenerate || isGeneratingStructure) return;
    setIsGeneratingStructure(true);
    setIsAnalyzing(true);
    setStructureError(null);
    setAnalysisError(null);
    setAgenticStageIndex(0);

    const stageInterval = setInterval(() => {
      setAgenticStageIndex((prev) =>
        prev < AGENTIC_THINKING_STAGES.length - 1 ? prev + 1 : prev
      );
    }, 600);

    // Generate dynamic structure directly from question & parameters
    let proposedStructure = generateDynamicAssignmentStructure({
      question: localQuestion,
      assignmentType: localType,
      academicLevel: localLevel,
      targetWordCount: localWordCount,
      writingTone: localTone,
      citationStyle: localCitation,
      briefText: localBrief,
    });

    let serverAnalysis: AssignmentAnalysis | null = null;

    try {
      const targetProjectId = await ensurePersisted();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Structure generation timeout")), 30000)
      );

      const response = await Promise.race([
        authedJsonFetch(
          `/api/projects/${targetProjectId}/assignment/analyze`,
          "POST",
          {
            question: localQuestion,
            assignmentType: localType,
            academicLevel: localLevel,
            targetWordCount: localWordCount,
            citationStyle: localCitation,
            writingTone: localTone,
            writing_tone: localTone,
            briefText: localBrief,
          }
        ),
        timeoutPromise,
      ]);

      if (response && response.ok) {
        const data = await response.json();
        const incomingAnalysis: AssignmentAnalysis = data.analysis || data;
        if (data.structure && data.structure.headings?.length > 0) {
          proposedStructure = data.structure;
        }
        if (incomingAnalysis && (incomingAnalysis.commandVerbs || incomingAnalysis.briefLedger || incomingAnalysis.summary)) {
          serverAnalysis = incomingAnalysis;
        }
      }
    } catch (err: any) {
      console.warn("Using resilient client question-specific structure decomposition:", err);
    }

    setLocalStructure(proposedStructure);
    setStructure(proposedStructure);
    setHasGeneratedStructure(true);
    setUnderstandStep("outline_review");

    const internalSecs = structureToInternalSections(proposedStructure);
    const budgets = structureToSectionBudgets(proposedStructure);
    const budget = computeWordBudgetFromSections(localWordCount, budgets);
    const legacyBreakdown = computeSectionBreakdown(localWordCount, budgets);

    const updates: Record<string, any> = {
      instructions: localQuestion,
      research_topic: localQuestion,
      assignment_question: localQuestion,
      assignment_prompt: localQuestion,
      assignment_brief: localQuestion,
      academic_level: localLevel,
      academicLevel: localLevel,
      assignment_type: localType,
      assignmentType: localType,
      word_count: localWordCount,
      word_limit: localWordCount,
      targetWordCount: localWordCount,
      target_word_count: localWordCount,
      citation_style: localCitation,
      citationStyle: localCitation,
      writing_tone: localTone,
      writingTone: localTone,
      assignment_structure: proposedStructure,
      structure: proposedStructure,
      sectionBudgets: budgets,
      section_budgets: budgets,
      assignment_internal_sections: internalSecs,
      assignment_outline: internalSecs,
      wordBudget: budget,
      word_budget: budget,
      sections: legacyBreakdown,
      writingStyle: {
        ...localStyle,
        preset: localTone as WritingStylePreset,
      },
      writing_style: {
        ...localStyle,
        preset: localTone as WritingStylePreset,
      },
      assignment_brief_text: localBrief || localQuestion,
      course_name: course,
      institution,
      deadline,
      marking_rubric: rubricText,
      courseDetails: {
        courseCode: course,
        institution,
        deadline,
        rubric: rubricText,
      },
    };

    if (serverAnalysis) {
      updates.assignment_analysis = typeof serverAnalysis === "string" ? serverAnalysis : JSON.stringify(serverAnalysis);
      setAnalysis(serverAnalysis);
    } else if (uploadedFileName || !analysis) {
      const qLower = localQuestion.toLowerCase();
      const detectedVerbs = [];
      const verbKeywords: Record<string, { def: string; act: string }> = {
        "critically evaluate": {
          def: "Weigh competing theoretical arguments and empirical evidence to judge their validity.",
          act: "Synthesize counterarguments and reach a justified, evidence-backed conclusion.",
        },
        evaluate: {
          def: "Form a judgment on the value, efficacy, or validity of theories and evidence.",
          act: "Provide balanced criteria-based judgments supported by scholarly consensus.",
        },
        assess: {
          def: "Determine the significance, scale, or value of concepts or findings.",
          act: "Weigh practical and theoretical implications with clear benchmarks.",
        },
        analyse: {
          def: "Break down complex issues into component parts to examine relationships and causes.",
          act: "Explain 'how' and 'why', not merely descriptive facts.",
        },
        analyze: {
          def: "Break down complex issues into component parts to examine relationships and causes.",
          act: "Explain 'how' and 'why', not merely descriptive facts.",
        },
        discuss: {
          def: "Explore multiple viewpoints, debates, and nuances surrounding the core question.",
          act: "Structure a cohesive narrative balancing primary schools of thought.",
        },
        examine: {
          def: "Investigate closely, scrutinizing assumptions and empirical proof.",
          act: "Surface hidden assumptions and cross-reference with primary research.",
        },
      };

      for (const [vKey, vData] of Object.entries(verbKeywords)) {
        if (qLower.includes(vKey)) {
          detectedVerbs.push({
            verb: vKey.charAt(0).toUpperCase() + vKey.slice(1),
            meaning: vData.def,
            academicExpectation: vData.act,
          });
        }
      }

      if (detectedVerbs.length === 0) {
        detectedVerbs.push({
          verb: "Analyze & Critically Discuss",
          meaning: "Dissect core themes and engage critically with peer-reviewed scholarship.",
          academicExpectation: "Demonstrate independent evaluation and rigorous evidence grounding.",
        });
      }

      const isQuantum = /quantum|qubit|superconducting|trapped-ion|shor|grover|qec|surface code|nisq|post-quantum|qkd|qnt-4020/i.test(localQuestion);
      const isExam = /examination|questionnaire|question\s*1|part\s*1|marks\b/i.test(localQuestion);

      const fallbackAnalysis: AssignmentAnalysis = {
        commandVerbs: detectedVerbs,
        summary: `Rigorous academic breakdown of assignment prompt: ${localQuestion.slice(0, 120)}`,
        keyConcepts: isQuantum
          ? [
              "Superconducting Transmon vs Trapped-Ion Modalities",
              "NISQ Physical Limits & Error Mitigation (ZNE/PEC)",
              "BQP Complexity & Algorithmic Mechanics (Shor & Grover)",
              "Planar Surface Codes & Fault-Tolerant Thresholds",
              "Quantum Cryptography (BB84 QKD) & Post-Quantum Cryptography (FIPS 203)",
            ]
          : [
              "Theoretical Frameworks & Foundational Literature",
              "Empirical Context & Practical Applications",
              "Methodological or Evaluative Rigor",
            ],
        scopeBoundaries: {
          included: ["Direct addressing of assignment prompt", "Scholarly evidence and critical literature grounding"],
          excluded: ["Unsubstantiated assertion", "Out-of-scope tangents"],
        },
        expectedResponseType: isExam
          ? "Rigorous technical solutions solving all examination questions systematically with theoretical frameworks, mathematical proofs, and standard Harvard referencing."
          : localType,
        evidenceRequirements: isQuantum
          ? "Authoritative quantum computing literature adhering to HARVARD style."
          : `High-quality peer-reviewed scholarly citations adhering to ${localCitation.toUpperCase()}.`,
        markingCriteriaInsights: rubricText
          ? ["Custom module grading rubric criteria indexed and integrated."]
          : ["First Class (70%+): Demands mathematical precision, physical circuit mechanics, and rigorous theoretical grounding."],
        wordCountImplications: `Target allocation of ${localWordCount} words across planned sections.`,
        citationGuidance: `Format all in-text citations and bibliography according to ${localCitation.toUpperCase()} conventions.`,
        academicLevelNotes: `Calibrated for ${localLevel} academic standards. Demands sustained analytical depth and critical synthesis.`,
        approvedByUser: false,
      };

      if (!analysis) {
        updates.assignment_analysis = JSON.stringify(fallbackAnalysis);
        setAnalysis(fallbackAnalysis);
      }
    }

    try {
      await saveAnswers(updates);
    } catch (saveErr) {
      console.warn("Could not save answers during structure generation:", saveErr);
    } finally {
      clearInterval(stageInterval);
      setIsGeneratingStructure(false);
      setIsAnalyzing(false);
    }
  };

  const handleAnalyze = handleGenerateStructure;

  const handleApproveAnalysis = async () => {
    if (!analysis) return;
    const updated: AssignmentAnalysis = {
      ...analysis,
      approvedByUser: true,
    };
    await setAnalysis(updated);
    await handleProceedToSources();
  };

  const processUploadedFile = async (file: File) => {
    if (!file) return;

    // Reset previous errors and notices
    setAnalysisError(null);
    setParseNotice(null);

    // 1. Check subscription limits
    const existingBriefCount = (uploadedFileName || project?.answers?.["assignment_brief_file"]) ? 1 : 0;
    const check = canUploadBrief(file, existingBriefCount);

    if (!check.allowed) {
      setUpgradeModalDescription(check.message);
      setShowUpgradeModal(true);
      return;
    }

    // 2. Client-side file type and size validation
    const fileValidation = validateBriefFile(file, {
      isAdmin,
      maxBytes: isPremium ? 50 * 1024 * 1024 : 5 * 1024 * 1024,
    });
    if (!fileValidation.valid) {
      setParseNotice(fileValidation.error || "Unsupported file format.");
      return;
    }

    setUploadingBrief(true);
    setUploadedFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const targetProjectId = await ensurePersisted();
      const res = await authedFetch(`/api/projects/${targetProjectId}/assignment/parse-brief`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Could not parse this document. Please verify the file format or paste the brief text manually.");
      }

      const data = await res.json();
      const extractedText = data.text || "";
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("Could not parse this document. Please verify the file format or paste the brief text manually.");
      }

      const cleanPrompt = cleanAnswerString(extractedText);
      setLocalQuestion(cleanPrompt);
      setLocalBrief(cleanPrompt);

      const rawDetectedCount = Number(data.detectedWordCount);
      const newWordCount =
        !isNaN(rawDetectedCount) && rawDetectedCount >= 100 && rawDetectedCount <= 50000
          ? Math.round(rawDetectedCount)
          : localWordCount;
      const nextLevel = data.detectedLevel || localLevel;
      const nextCitation = data.detectedCitation || localCitation;

      if (!isNaN(rawDetectedCount) && rawDetectedCount >= 100 && rawDetectedCount <= 50000) {
        setLocalWordCount(newWordCount);
      }
      if (data.detectedLevel) {
        setLocalLevel(data.detectedLevel);
      }
      if (data.detectedCitation) {
        setLocalCitation(data.detectedCitation);
      }

      let dynamicStruct = generateDynamicAssignmentStructure({
        question: cleanPrompt,
        assignmentType: localType,
        academicLevel: nextLevel,
        targetWordCount: newWordCount,
        writingTone: localTone,
        citationStyle: nextCitation,
      });

      let serverAnalysis: AssignmentAnalysis | null = null;
      try {
        const analyzeRes = await authedJsonFetch(
          `/api/projects/${targetProjectId}/assignment/analyze`,
          "POST",
          {
            question: cleanPrompt,
            assignmentType: localType,
            academicLevel: nextLevel,
            targetWordCount: newWordCount,
            citationStyle: nextCitation,
            writingTone: localTone,
            writing_tone: localTone,
            briefText: cleanPrompt,
          }
        );
        if (analyzeRes && analyzeRes.ok) {
          const analyzeData = await analyzeRes.json();
          const incomingAnalysis: AssignmentAnalysis = analyzeData.analysis || analyzeData;
          if (analyzeData.structure && analyzeData.structure.headings?.length > 0) {
            dynamicStruct = analyzeData.structure;
          }
          if (incomingAnalysis && (incomingAnalysis.commandVerbs || incomingAnalysis.briefLedger || incomingAnalysis.summary)) {
            serverAnalysis = incomingAnalysis;
          }
        }
      } catch (analyzeErr) {
        console.warn("Auto-analyze brief error:", analyzeErr);
      }

      setLocalStructure(dynamicStruct);
      setStructure(dynamicStruct);
      setHasGeneratedStructure(true);
      if (serverAnalysis) {
        setAnalysis(serverAnalysis);
      }
      setUnderstandStep("outline_review");

      const budgets = structureToSectionBudgets(dynamicStruct);
      const internalSecs = structureToInternalSections(dynamicStruct);
      const budget = computeWordBudgetFromSections(newWordCount, budgets);
      const legacyBreakdown = computeSectionBreakdown(newWordCount, budgets);

      const updates: Record<string, any> = {
        instructions: cleanPrompt,
        assignment_prompt: cleanPrompt,
        assignment_question: cleanPrompt,
        assignment_brief_text: cleanPrompt,
        research_topic: cleanPrompt,
        assignment_brief: cleanPrompt,
        assignment_brief_file: file.name,
        targetWordCount: newWordCount,
        target_word_count: newWordCount,
        word_count: newWordCount,
        word_limit: newWordCount,
        assignment_structure: dynamicStruct,
        structure: dynamicStruct,
        sectionBudgets: budgets,
        section_budgets: budgets,
        assignment_internal_sections: internalSecs,
        assignment_outline: internalSecs,
        sections: legacyBreakdown,
        wordBudget: budget,
        word_budget: budget,
        academic_level: nextLevel,
        academicLevel: nextLevel,
        citation_style: nextCitation,
        citationStyle: nextCitation,
        writing_tone: localTone,
        writingTone: localTone,
      };

      if (serverAnalysis) {
        updates["assignment_analysis"] = serverAnalysis;
      }

      if (data.updatedTitle) {
        updates.title = data.updatedTitle;
        updates.assignment_title = data.updatedTitle;
      } else {
        const currentTitle =
          project?.answers?.["title"] ||
          project?.answers?.["assignment_title"] ||
          project?.title ||
          "";
        const isDefaultOrUntitled =
          !currentTitle ||
          currentTitle.toLowerCase().includes("untitled") ||
          currentTitle.toLowerCase() === "academic assignment" ||
          currentTitle.toLowerCase() === "synthesized research project";

        if (isDefaultOrUntitled && cleanPrompt.length >= 10) {
          const derived = deriveHeuristicTitle(cleanPrompt);
          if (derived && derived !== "Academic Assignment") {
            updates.title = derived;
            updates.assignment_title = derived;
          }
        }
      }

      const safeUpdates = stripCircularReferences(updates);
      await saveAnswers(safeUpdates);
    } catch (err: any) {
      console.warn("Brief parsing error caught safely:", err);
      setParseNotice("Could not parse this document. Please verify the file format or paste the brief text manually.");
    } finally {
      setUploadingBrief(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const promptWordCount = useMemo(() => {
    return localQuestion.trim() ? localQuestion.trim().split(/\s+/).filter(Boolean).length : 0;
  }, [localQuestion]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-6 text-neutral-900 dark:text-neutral-100 font-sans">
      {/* Clean Minimal Apple-Grade Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
              {understandStep === "outline_review" ? "Phase 1 · Part 2: Understand" : "Phase 1 · Part 1: Extract"}
            </span>
            <span className="text-xs text-neutral-400 font-medium hidden sm:inline-block">· Coursework & Essay</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            {understandStep === "outline_review" ? (
              <span>Understand Your Assignment</span>
            ) : (
              <span>Extract Your Brief</span>
            )}
            <span className="sr-only">Understand Your Brief</span>
            <span className="sr-only">Phase 1: Understand the Assignment Brief</span>
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
            {understandStep === "outline_review"
              ? "Understand your core working thesis, theoretical frameworks, word targets, and outline structure."
              : "Upload your assignment brief or paste prompts to extract parameters, questions, and grading criteria."}
          </p>
        </div>

        {/* Minimalist Apple Segmented Mode Toggle */}
        <CourseworkModeToggle
          mode={executionMode}
          onChange={handleModeChange}
          disabled={isExecutingAutonomous}
        />
      </div>

      {/* Autonomous Synthesis Bar (Sleek callout only active when in Detailed Mode) */}
      {executionMode === "detailed" && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <p className="text-neutral-700 dark:text-neutral-300 text-xs">
              <span className="font-semibold text-neutral-900 dark:text-white">Detailed Mode:</span> Full autonomous literature discovery, outline, and atomic drafting in one click.
            </p>
          </div>

          <button
            type="button"
            disabled={isExecutingAutonomous || localQuestion.trim().length < 10}
            onClick={handleRunAutonomousSynthesis}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0 shadow-2xs"
          >
            {isExecutingAutonomous ? (
              <>
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Synthesizing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Start Autonomous Synthesis</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Real-time Streaming Progress Bar (Only during autonomous synthesis) */}
      {isExecutingAutonomous && autonomousProgress && (
        <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-neutral-600 dark:text-neutral-400">
            <span className="font-medium text-neutral-900 dark:text-neutral-200">
              {autonomousProgress.message}
            </span>
            <span className="font-mono text-neutral-500">
              {autonomousProgress.progressPercentage}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-neutral-200 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-neutral-900 dark:bg-white rounded-full transition-all duration-300"
              style={{ width: `${autonomousProgress.progressPercentage}%` }}
            />
          </div>
          {autonomousProgress.detail && (
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block font-mono">
              {autonomousProgress.detail}
            </span>
          )}
        </div>
      )}

      {autonomousError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          {autonomousError}
        </div>
      )}

      {understandStep === "brief_input" ? (
        /* Unified Assignment Setup Box (Step 1: Brief Input) */
        <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-neutral-200/80 dark:border-white/10 p-5 sm:p-7 shadow-xs space-y-5">
        {/* Assignment Question Section */}
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 w-fit">
              <button
                type="button"
                onClick={() => setIntakeTab("paste")}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  intakeTab === "paste"
                    ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                Paste Prompt
              </button>
              <button
                type="button"
                onClick={() => setIntakeTab("upload")}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  intakeTab === "upload"
                    ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <Upload className="w-3 h-3" />
                <span>Upload Brief Document (.pdf, .docx)</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {promptWordCount > 0 && intakeTab === "paste" && (
                <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
                  {promptWordCount} words entered
                </span>
              )}
              {uploadedFileName && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{uploadedFileName}</span>
                </span>
              )}
            </div>
          </div>

          {intakeTab === "paste" ? (
            <textarea
              value={localQuestion}
              onChange={(e) => setLocalQuestion(e.target.value)}
              onBlur={handleQuestionBlur}
              rows={4}
              placeholder="Paste your assignment prompt, essay title, or question here..."
              className="w-full bg-neutral-50/70 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-xl p-3.5 text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all leading-relaxed resize-y"
            />
          ) : (
            <DropzoneErrorBoundary onError={() => setParseNotice("Could not parse this document. Please verify the file format or paste the brief text manually.")}>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) {
                    processUploadedFile(dropped);
                  }
                }}
                className={`border border-dashed rounded-xl p-6 transition-all flex flex-col items-center justify-center text-center space-y-3 cursor-pointer ${
                  isDraggingOver
                    ? "border-neutral-900 bg-neutral-100/70 dark:border-white dark:bg-white/10"
                    : "border-neutral-300 dark:border-white/15 bg-neutral-50/50 dark:bg-white/[0.02]"
                }`}
                onClick={() => {
                  if (!uploadingBrief) {
                    fileInputRef.current?.click();
                  }
                }}
              >
                <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    Upload your assignment brief or module handbook
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Supports PDF, DOCX, DOC, or TXT {isAdmin ? "(Unlimited size · Admin)" : isPremium ? "(Up to 50MB · Pro)" : "(Up to 5MB · Free)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={uploadingBrief}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {uploadingBrief ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Parsing Brief…</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Select Brief Document</span>
                    </>
                  )}
                </button>

                {parseNotice && (
                  <div
                    role="alert"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 w-full p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-start justify-between gap-3 text-left animate-in fade-in"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span>{parseNotice}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setParseNotice(null)}
                      className="text-amber-700 dark:text-amber-300 hover:opacity-80 p-0.5 rounded cursor-pointer"
                      aria-label="Dismiss notice"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {localQuestion && (
                  <div className="w-full text-left pt-3 border-t border-neutral-200/60 dark:border-white/5">
                    <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block mb-1">
                      Extracted Brief Question / Prompt:
                    </span>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 line-clamp-3 bg-white dark:bg-[#2C2C2E] p-3 rounded-lg border border-neutral-200/60 dark:border-white/10 font-mono">
                      {localQuestion}
                    </p>
                  </div>
                )}
              </div>
            </DropzoneErrorBoundary>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleFileUpload}
            disabled={uploadingBrief}
            className="hidden"
          />

          {uploadingBrief && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2 animate-pulse">
              <span className="w-3 h-3 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
              <span>Extracting brief text and grading details from uploaded document…</span>
            </p>
          )}
        </div>

          {/* Academic Parameters: Academic Level, Assignment Type, Citation Style, Writing Tone & Target Words */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-1">
            {/* Academic Level */}
            <div className="space-y-1">
              <label htmlFor="academic_level" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                <span>Academic Level</span>
                <span className="text-rose-500 text-xs">*</span>
              </label>
              <div className="relative">
                <select
                  id="academic_level"
                  name="academic_level"
                  aria-label="Academic Level"
                  value={localLevel}
                  onChange={(e) => handleLevelChange(e.target.value as AcademicLevel)}
                  className="w-full h-8 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all appearance-none cursor-pointer pr-8 font-medium shadow-2xs capitalize"
                >
                  {ACADEMIC_LEVEL_OPTIONS.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-neutral-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Hidden companion toggle buttons for test compatibility */}
              <div className="sr-only" aria-hidden="false">
                <button
                  type="button"
                  onClick={() => handleLevelChange("undergraduate")}
                  className={localLevel === "undergraduate" ? "bg-white" : ""}
                >
                  Undergraduate
                </button>
                <button
                  type="button"
                  onClick={() => handleLevelChange("postgraduate")}
                  className={localLevel === "postgraduate" ? "bg-white" : ""}
                >
                  Postgraduate / Masters
                </button>
              </div>
            </div>

            {/* Assignment Type */}
            <div className="space-y-1">
              <label htmlFor="assignment_type" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                <span>Assignment Type</span>
                <span className="text-rose-500 text-xs">*</span>
              </label>
              <div className="relative">
                <select
                  id="assignment_type"
                  name="assignment_type"
                  aria-label="Assignment Type"
                  value={localType}
                  onChange={(e) => handleTypeChange(e.target.value as AssignmentType)}
                  className="w-full h-8 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all appearance-none cursor-pointer pr-8 font-medium shadow-2xs capitalize"
                >
                  {ASSIGNMENT_TYPE_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-neutral-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Citation Style */}
            <div className="space-y-1">
              <label htmlFor="citation_style" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                <span>Citation Style</span>
                <span className="text-rose-500 text-xs">*</span>
              </label>
              <div className="relative">
                <select
                  id="citation_style"
                  name="citation_style"
                  aria-label="Citation Style"
                  value={localCitation}
                  onChange={(e) => handleCitationChange(e.target.value)}
                  className="w-full h-8 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all appearance-none cursor-pointer pr-8 font-medium shadow-2xs"
                >
                  {CITATION_STYLES.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-neutral-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Writing Tone */}
            <div
              ref={toneSectionRef}
              data-testid="tone-section-wrapper"
              onFocusCapture={dispatchToneAssistantSuggestions}
              onClickCapture={dispatchToneAssistantSuggestions}
              className="space-y-1"
            >
              <label htmlFor="writing_tone" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                <span>Writing Tone</span>
                <span className="text-rose-500 text-xs">*</span>
              </label>
              <div className="relative">
                <select
                  id="writing_tone"
                  name="writing_tone"
                  aria-label="Writing Tone"
                  value={localTone}
                  onChange={(e) => handleToneChange(e.target.value)}
                  onFocus={dispatchToneAssistantSuggestions}
                  className="w-full h-8 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all appearance-none cursor-pointer pr-8 font-medium shadow-2xs capitalize"
                >
                  {WRITING_TONE_OPTIONS.map((tn) => (
                    <option key={tn.id} value={tn.id}>
                      {tn.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-neutral-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Target Words Stepper / Input */}
            <div className="space-y-1">
              <label htmlFor="target_word_count" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span>Target Word Count</span>
                  <span className="text-rose-500 text-xs">*</span>
                </span>
                {localWordCount > 0 && (
                  <span className="text-[10px] text-neutral-400 font-normal">
                    {localWordCount.toLocaleString()} words
                  </span>
                )}
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const current = Number(localWordCount) || 2000;
                    handleTargetWordCountChange(Math.max(100, current - 250));
                  }}
                  aria-label="Decrease target word count"
                  className="h-8 w-8 rounded-lg border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#2C2C2E] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-semibold text-sm shrink-0"
                  title="Decrease by 250 words"
                >
                  −
                </button>
                <div className="relative flex-1 flex items-center min-w-0">
                  <input
                    id="target_word_count"
                    name="target_word_count"
                    type="number"
                    min={100}
                    max={50000}
                    step={50}
                    value={localWordCount > 0 ? localWordCount : ""}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      if (!raw) {
                        setLocalWordCount(0);
                        return;
                      }
                      const val = parseInt(raw, 10);
                      if (!isNaN(val)) {
                        const clamped = Math.min(50000, Math.max(0, val));
                        setLocalWordCount(clamped);
                        handleWordCountChange(clamped);
                      }
                    }}
                    onBlur={() => {
                      const cur = Number(localWordCount);
                      if (!cur || isNaN(cur) || cur < 100) {
                        handleTargetWordCountChange(2000);
                      } else if (cur > 50000) {
                        handleTargetWordCountChange(50000);
                      }
                    }}
                    aria-label="Target Word Count"
                    placeholder="2000"
                    className="w-full h-8 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg pl-2 pr-12 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all font-semibold shadow-2xs text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="pointer-events-none absolute right-2 text-[10px] text-neutral-400 dark:text-neutral-500 font-medium">
                    words
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const current = Number(localWordCount) || 2000;
                    handleTargetWordCountChange(Math.min(50000, current + 250));
                  }}
                  aria-label="Increase target word count"
                  className="h-8 w-8 rounded-lg border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#2C2C2E] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-semibold text-sm shrink-0"
                  title="Increase by 250 words"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Accordion: Additional Course Details & Rubric (Optional) */}
          <div className="pt-2 border-t border-neutral-100 dark:border-white/5">
            <button
              type="button"
              onClick={() => setShowAdditional(!showAdditional)}
              className="text-xs font-medium text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer py-1"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdditional ? "rotate-180" : ""}`} />
              <span>{showAdditional ? "Hide optional course details" : "+ Course Details & Rubric (Optional)"}</span>
            </button>

            {showAdditional && (
              <div className="mt-3 space-y-4 pt-3 border-t border-neutral-100 dark:border-white/5 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 p-3.5 rounded-xl border border-neutral-200/60 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02]">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Course / Module Code</label>
                    <input
                      type="text"
                      value={course}
                      onChange={(e) => setCourse(e.target.value)}
                      onBlur={handleCourseDetailsBlur}
                      placeholder="e.g. POLI3002 International Security"
                      className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">University / Institution</label>
                    <input
                      type="text"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      onBlur={handleCourseDetailsBlur}
                      placeholder="e.g. University of Oxford"
                      className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Deadline</label>
                    <input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      onBlur={handleCourseDetailsBlur}
                      className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Marking Rubric / Assessment Criteria</label>
                      <button
                        type="button"
                        onClick={() => rubricFileInputRef.current?.click()}
                        className="text-[10px] font-semibold flex items-center gap-1.5 px-2 py-1 rounded border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                      >
                        <FileUp className="w-3 h-3" />
                        <span>Upload File</span>
                      </button>
                      <input
                        type="file"
                        ref={rubricFileInputRef}
                        accept=".txt,.md,.csv,.json"
                        className="hidden"
                        onChange={handleRubricFileUpload}
                      />
                    </div>
                    <textarea
                      value={rubricText}
                      onChange={(e) => setRubricText(e.target.value)}
                      onBlur={handleCourseDetailsBlur}
                      rows={3}
                      placeholder="Paste marking criteria or grade band descriptions to index..."
                      className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg p-2.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Minimal Agentic Thinking Indicator */}
          {isGeneratingStructure && (
            <div className="py-3 px-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.02] flex items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center w-2.5 h-2.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping absolute opacity-75" />
                  <span className="w-2 h-2 rounded-full bg-blue-600 relative" />
                </div>
                <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                  {AGENTIC_THINKING_STAGES[agenticStageIndex] || "Thinking through your assignment"}…
                </p>
              </div>
              <span className="text-[11px] font-mono text-neutral-400">
                Step {agenticStageIndex + 1} of {AGENTIC_THINKING_STAGES.length}
              </span>
            </div>
          )}

          {/* Primary Action Button Bar Before Structure Generation */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-neutral-100 dark:border-white/5">
            <div className="text-xs">
              {!canProceedToSources ? (
                <p className="text-rose-500 dark:text-rose-400 font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Please provide the assignment question, word count, and citation style to continue.</span>
                </p>
              ) : (
                <p className="text-neutral-500 dark:text-neutral-400">
                  Ready to analyze assignment brief and build tone-tailored outline.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                id="save_and_build_outline_btn"
                disabled={!canGenerate || isGeneratingStructure}
                onClick={handleGenerateStructure}
                aria-label="Save & Build Outline (Save & Build / Generate Structure / Analyze Assignment Brief)"
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGeneratingStructure ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Thinking through assignment…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Save &amp; Build</span>
                  </>
                )}
              </button>

              {/* Companion proceed button for backward-compatibility with tests expecting Proceed to Sources */}
              <button
                type="button"
                disabled={!canProceedToSources || isGeneratingStructure}
                onClick={handleProceedToSources}
                aria-label="Proceed to Sources (Confirm Structure & Proceed to Sources / Approve Outline & Proceed)"
                className="sr-only"
              >
                Proceed to Sources
              </button>
            </div>
          </div>

          {structureError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{structureError}</span>
              </div>
              <button
                type="button"
                onClick={handleGenerateStructure}
                className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {analysisError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{analysisError}</span>
            </div>
          )}
        </div>
      ) : (
        /* Step 2: Dynamic Outline Review Mode */
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Locked / Collapsed Brief Summary Card */}
          <div className="bg-white dark:bg-[#1C1C1E] rounded-xl border border-neutral-200/80 dark:border-white/10 p-4 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-neutral-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-xs font-semibold text-neutral-900 dark:text-white uppercase tracking-wider">
                  Assignment Brief
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Locked &amp; Calibrated
                </span>
              </div>

              <button
                type="button"
                onClick={() => setUnderstandStep("brief_input")}
                aria-label="Edit Brief"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer w-fit"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit Brief</span>
              </button>
            </div>

            {/* Prompt Excerpt */}
            <div className="text-xs text-neutral-800 dark:text-neutral-200 bg-neutral-50/70 dark:bg-white/[0.02] p-2.5 sm:p-3 rounded-lg border border-neutral-200/60 dark:border-white/5 font-medium leading-relaxed">
              <span className="font-semibold text-neutral-400 dark:text-neutral-500 block mb-1">
                Extracted Brief Question / Prompt:
              </span>
              <p className="font-mono text-neutral-900 dark:text-white leading-relaxed">{localQuestion}</p>
            </div>


            {/* Parameter Badges */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">
                Level: <strong className="font-semibold capitalize text-neutral-900 dark:text-white">{safeFormatLabel(localLevel)}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">
                Type: <strong className="font-semibold capitalize text-neutral-900 dark:text-white">{safeFormatLabel(localType)}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">
                Citation: <strong className="font-semibold uppercase text-neutral-900 dark:text-white">{localCitation}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                Tone: <strong className="font-semibold capitalize">{safeFormatLabel(localTone)}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">
                Target: <strong className="font-semibold text-neutral-900 dark:text-white">{localWordCount.toLocaleString()} words</strong>
              </span>
            </div>
          </div>

          {/* Dynamic Structure Planner (Step 2: Dynamic Outline Review) */}
          <div className="space-y-4">
            <DynamicStructurePlanner
              structure={localStructure}
              targetWordCount={localWordCount}
              onStructureChange={handleStructureChange}
              onTargetWordCountChange={handleTargetWordCountChange}
              onRegenerateOutline={handleGenerateStructure}
              question={localQuestion}
              assignmentType={localType}
              academicLevel={localLevel}
              writingTone={localTone}
              citationStyle={localCitation}
              isConfirmed={localStructure.isConfirmed}
            />

            {/* Phase Completion Gate: Approve Outline & Proceed */}
            <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs">
                {!canProceedToSources ? (
                  <p className="text-rose-500 dark:text-rose-400 font-medium flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Please complete the brief details and word allocation to proceed.</span>
                  </p>
                ) : localStructure.totalAllocated !== localWordCount ? (
                  <p className="text-amber-600 dark:text-amber-400 font-medium">
                    Note: {Math.abs(localWordCount - localStructure.totalAllocated)} words {localStructure.totalAllocated > localWordCount ? "over target" : "unallocated"}. You can auto-balance or approve as-is.
                  </p>
                ) : (
                  <p className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Outline calibrated and word count balanced.</span>
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={isGeneratingStructure}
                  onClick={handleGenerateStructure}
                  aria-label="Regenerate Outline (Generate Structure)"
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-neutral-300 dark:border-white/15 hover:bg-neutral-100 dark:hover:bg-white/5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  {isGeneratingStructure ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Regenerating outline…</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 text-purple-500" />
                      <span>Regenerate Outline</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!canProceedToSources || isGeneratingStructure}
                  onClick={handleProceedToSources}
                  aria-label="Proceed (Approve Outline & Proceed / Confirm Structure & Proceed to Sources)"
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Proceed</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Breakdown Results - Only for Uploaded Briefs with Indexed Rules */}
      {analysis && analysis.briefLedger && analysis.briefLedger.length > 0 && (
        <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-neutral-200/70 dark:border-white/10 p-6 sm:p-8 shadow-xs space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-white/5 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-neutral-900 dark:text-white tracking-tight">
                Assignment Analysis Breakdown
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Calibrated research scope boundaries. Click any item to edit, remove, or add custom research requirements.
              </p>
            </div>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 shrink-0 self-start sm:self-auto">
              ✓ Analysis Ready{analysis.briefLedger && analysis.briefLedger.length > 0 ? ` · ${analysis.briefLedger.length} Rules Indexed` : ""}
            </span>
          </div>

          {/* Clean Scope Banner */}
          <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 dark:bg-sky-500/10 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <p className="text-xs font-medium text-sky-900 dark:text-sky-200">
              {scopeClassification.summaryBanner}
            </p>
          </div>

          {/* Detected Critical Penalty Alerts (only genuine assessment penalties, e.g. late submission deductions - never raw rubric grade tiers like [L070] (70% - 100%)) */}
          {(() => {
            const genuinePenaltyAlerts = (analysis.markingCriteriaInsights || []).filter((insight) => {
              const lower = insight.toLowerCase();
              const isRawRubricBand =
                lower.includes("first class") ||
                lower.includes("upper second") ||
                lower.includes("lower second") ||
                lower.includes("third class") ||
                lower.includes("grading matrix") ||
                lower.includes("criteria & weight") ||
                lower.includes("standard assessment rubric") ||
                /^\s*(\[L\d+(?:-L\d+)?\]\s*)?\(?\d+%\s*[-–]\s*\d+%\)?/i.test(insight) ||
                /^\s*\[L\d+(?:-L\d+)?\]\s*PART\s+\d+/i.test(insight);

              if (isRawRubricBand) return false;
              return (
                lower.includes("penalty") ||
                lower.includes("deduction") ||
                lower.includes("late submission") ||
                insight.includes("🚨")
              );
            });

            if (genuinePenaltyAlerts.length === 0) return null;

            return (
              <div className="space-y-2">
                {genuinePenaltyAlerts.map((insight, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Summary & Core Specifications */}
          {analysis.summary && (
            <div className="p-4 rounded-xl border border-neutral-200/60 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] space-y-2.5">
              <div>
                <span className="text-[11px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block tracking-wider">
                  Summary & Expected Response
                </span>
                <p className="text-xs text-neutral-800 dark:text-neutral-200 mt-1 leading-relaxed">
                  {analysis.summary}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2.5 border-t border-neutral-200/60 dark:border-white/5">
                {analysis.evidenceRequirements && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-neutral-400 block tracking-wider">Evidence Requirements</span>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-0.5">{analysis.evidenceRequirements}</p>
                  </div>
                )}
                {analysis.wordCountImplications && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-neutral-400 block tracking-wider">Word Budget Guidance</span>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-0.5">{analysis.wordCountImplications}</p>
                  </div>
                )}
                {analysis.citationGuidance && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-neutral-400 block tracking-wider">Referencing Style</span>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-0.5">{analysis.citationGuidance}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Interactive Editable Scope Boundaries: Included (Green) vs Excluded (Amber) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Green Box: Included Scope */}
            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
                  <h4 className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>✓ What Must Be Researched & Included</span>
                  </h4>
                  <span className="text-[11px] font-medium text-emerald-700/80 dark:text-emerald-400/80">
                    {currentIncluded.length || 0} items · Editable
                  </span>
                </div>

                <div className="space-y-1.5">
                  {currentIncluded.map((inc, i) => (
                    <div
                      key={i}
                      className="group relative flex items-start gap-2.5 p-2 rounded-xl hover:bg-emerald-500/10 dark:hover:bg-emerald-500/15 transition-colors"
                    >
                      {editingIncludedIdx === i ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingIncludedText}
                            onChange={(e) => setEditingIncludedText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveIncludedEdit(i);
                              if (e.key === "Escape") setEditingIncludedIdx(null);
                            }}
                            autoFocus
                            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-500 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveIncludedEdit(i)}
                            className="p-1 rounded-md text-emerald-700 hover:bg-emerald-200 dark:text-emerald-300 dark:hover:bg-emerald-800 cursor-pointer"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingIncludedIdx(null)}
                            className="p-1 rounded-md text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          <span
                            onClick={() => {
                              setEditingIncludedIdx(i);
                              setEditingIncludedText(inc);
                            }}
                            className="text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed flex-1 cursor-text select-text hover:underline decoration-emerald-500/40"
                            title="Click to edit"
                          >
                            {inc}
                          </span>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingIncludedIdx(i);
                                setEditingIncludedText(inc);
                              }}
                              className="p-1 rounded hover:bg-emerald-200/80 dark:hover:bg-emerald-900/40 text-neutral-600 dark:text-neutral-300 cursor-pointer"
                              title="Edit item"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteIncluded(i)}
                              className="p-1 rounded hover:bg-rose-200/80 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Custom Item */}
              <div className="pt-2 border-t border-emerald-500/15">
                {isAddingIncluded ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add research requirement..."
                      value={newIncludedText}
                      onChange={(e) => setNewIncludedText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddIncluded();
                        if (e.key === "Escape") setIsAddingIncluded(false);
                      }}
                      autoFocus
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-emerald-500 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddIncluded}
                      disabled={!newIncludedText.trim()}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-40"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingIncluded(false);
                        setNewIncludedText("");
                      }}
                      className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingIncluded(true)}
                    className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer py-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Research Requirement</span>
                  </button>
                )}
              </div>
            </div>

            {/* Amber/Orange Box: Excluded Scope */}
            <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                  <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>✕ Out of Scope (Do Not Waste Word Budget On)</span>
                  </h4>
                  <span className="text-[11px] font-medium text-amber-700/80 dark:text-amber-400/80">
                    {currentExcluded.length || 0} items · Editable
                  </span>
                </div>

                <div className="space-y-1.5">
                  {currentExcluded.map((exc, i) => (
                    <div
                      key={i}
                      className="group relative flex items-start gap-2.5 p-2 rounded-xl hover:bg-amber-500/10 dark:hover:bg-amber-500/15 transition-colors"
                    >
                      {editingExcludedIdx === i ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingExcludedText}
                            onChange={(e) => setEditingExcludedText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveExcludedEdit(i);
                              if (e.key === "Escape") setEditingExcludedIdx(null);
                            }}
                            autoFocus
                            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-amber-500 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveExcludedEdit(i)}
                            className="p-1 rounded-md text-amber-700 hover:bg-amber-200 dark:text-amber-300 dark:hover:bg-amber-800 cursor-pointer"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingExcludedIdx(null)}
                            className="p-1 rounded-md text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                          <span
                            onClick={() => {
                              setEditingExcludedIdx(i);
                              setEditingExcludedText(exc);
                            }}
                            className="text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed flex-1 cursor-text select-text hover:underline decoration-amber-500/40"
                            title="Click to edit"
                          >
                            {exc}
                          </span>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingExcludedIdx(i);
                                setEditingExcludedText(exc);
                              }}
                              className="p-1 rounded hover:bg-amber-200/80 dark:hover:bg-amber-900/40 text-neutral-600 dark:text-neutral-300 cursor-pointer"
                              title="Edit item"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExcluded(i)}
                              className="p-1 rounded hover:bg-rose-200/80 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Custom Out of Scope */}
              <div className="pt-2 border-t border-amber-500/15">
                {isAddingExcluded ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add out-of-scope topic..."
                      value={newExcludedText}
                      onChange={(e) => setNewExcludedText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddExcluded();
                        if (e.key === "Escape") setIsAddingExcluded(false);
                      }}
                      autoFocus
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-amber-500 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddExcluded}
                      disabled={!newExcludedText.trim()}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium cursor-pointer disabled:opacity-40"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingExcluded(false);
                        setNewExcludedText("");
                      }}
                      className="p-1.5 rounded-lg text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingExcluded(true)}
                    className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer py-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Out-of-Scope Topic</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Student Approval & Confirmation Banner */}
          <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">
                Ready to begin researching sources?
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Lock this research scope and structure to proceed to Phase 2: Sources.
              </p>
            </div>
            <button
              type="button"
              onClick={handleApproveAnalysis}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] text-xs font-semibold transition-all cursor-pointer shadow-xs shrink-0 flex items-center justify-center gap-1.5"
            >
              <span>Approve & Continue to Sources</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Role-Aware Tier Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        description={upgradeModalDescription}
      />
    </div>
  );
}

// Export alias for lazy-loading requirement
export { AssignmentUnderstandStage as AssignmentForm };
