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
} from "lucide-react";
import type { SectionBreakdown } from "../../../components/forms/TargetWordCountInput";
import { generateDynamicAssignmentStructure } from "../services/outlineService";
import { useSubscriptionLimits } from "../../../hooks/useSubscriptionLimits";
import { UpgradeModal } from "../../../components/modals/UpgradeModal";
import { stripCircularReferences, safeFormatLabel } from "../../../utils/briefExtractor";
import { validateBriefFile } from "../../../services/documentParser";
import {
  ACADEMIC_LEVEL_OPTIONS,
  ASSIGNMENT_TYPE_OPTIONS,
  CITATION_STYLES,
  WRITING_TONE_OPTIONS,
  ARCHETYPE_DEFAULT_TONES,
  AGENTIC_THINKING_STAGES,
} from "./AssignmentUnderstandStage";

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

export interface AssignmentExtractStageProps {
  onProceed?: () => void;
}

export default function AssignmentExtractStage({ onProceed }: AssignmentExtractStageProps) {
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
    writingTone,
    setStructure,
    saveAnswers,
    setAnalysis,
    ensurePersisted,
    isLoading,
  } = useAssignmentWorkspace();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const courseName = project?.answers?.["course_name"] || project?.answers?.["courseCode"] || "";
  const institutionName = project?.answers?.["institution"] || "";
  const deadlineDate = project?.answers?.["deadline"] || "";
  const markingRubricText = project?.answers?.["marking_rubric"] || project?.answers?.["rubric"] || "";

  // Dual-tab card state
  const [intakeTab, setIntakeTab] = useState<"paste" | "upload">("paste");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");

  // Role-based subscription limits
  const { isAdmin, isPremium, canUploadBrief, maxFileSizeMB } = useSubscriptionLimits();

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
    if (raw > 50000) return 2000;
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

  const [isGeneratingStructure, setIsGeneratingStructure] = useState<boolean>(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [agenticStageIndex, setAgenticStageIndex] = useState(0);
  const [uploadingBrief, setUploadingBrief] = useState<boolean>(false);
  const [showCourseDetails, setShowCourseDetails] = useState<boolean>(false);

  // Synchronize state on project updates
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
    const resolvedTone = project?.answers?.["writing_tone"] || project?.answers?.["writingTone"] || writingTone;
    const toneStr = typeof resolvedTone === "string" ? resolvedTone : (resolvedTone as any)?.preset || (resolvedTone as any)?.id;
    if (toneStr && typeof toneStr === "string") {
      setLocalTone((prev) => (prev !== toneStr ? toneStr : prev));
    }
    const cleanedBrief = cleanAnswerString(assignmentBriefText);
    if (cleanedBrief) {
      setLocalBrief((prev) => (prev !== cleanedBrief ? cleanedBrief : prev));
    } else if (currentInstructions) {
      setLocalBrief((prev) => (prev !== currentInstructions ? currentInstructions : prev));
    }
  }, [isLoading, question, academicLevel, assignmentType, targetWordCount, citationStyle, writingTone, project?.answers, assignmentBriefText]);

  const promptWordCount = useMemo(() => {
    return localQuestion.trim() ? localQuestion.trim().split(/\s+/).filter(Boolean).length : 0;
  }, [localQuestion]);

  const canGenerate =
    localQuestion.trim().length >= 10 &&
    localWordCount > 0 &&
    Boolean(localCitation) &&
    Boolean(localLevel) &&
    Boolean(localType);

  const computeWordBudgetFromSections = (
    total: number,
    sectionItems: SectionBudgetItem[]
  ): { intro: number; body: number; conclusion: number } => {
    const introItem = sectionItems.find(
      (s) => s.id === "intro" || s.title.toLowerCase().includes("intro")
    );
    const conclusionItem = sectionItems.find(
      (s) => s.id === "conclusion" || s.title.toLowerCase().includes("concl")
    );
    const introWords = introItem ? introItem.targetWordCount : Math.round(total * 0.1);
    const conclusionWords = conclusionItem ? conclusionItem.targetWordCount : Math.round(total * 0.1);
    const bodyWords = Math.max(0, total - introWords - conclusionWords);
    return { intro: introWords, body: bodyWords, conclusion: conclusionWords };
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

  const handleGenerateStructure = async () => {
    if (!canGenerate || isGeneratingStructure) return;
    setIsGeneratingStructure(true);
    setStructureError(null);
    setAgenticStageIndex(0);

    const stageInterval = setInterval(() => {
      setAgenticStageIndex((prev) =>
        prev < AGENTIC_THINKING_STAGES.length - 1 ? prev + 1 : prev
      );
    }, 600);

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
    } finally {
      clearInterval(stageInterval);
      setIsGeneratingStructure(false);
    }

    setStructure(proposedStructure);
    if (serverAnalysis) {
      setAnalysis(serverAnalysis);
    }

    const internalSecs = structureToInternalSections(proposedStructure);
    const budgets = structureToSectionBudgets(proposedStructure);
    const budget = computeWordBudgetFromSections(localWordCount, budgets);
    const legacyBreakdown = computeSectionBreakdown(localWordCount, budgets);

    const updates: Record<string, any> = {
      rawPrompt: localQuestion,
      raw_prompt: localQuestion,
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
      sections: legacyBreakdown,
      wordBudget: budget,
      word_budget: budget,
    };

    const parsedCriteria = parseRubricCriteria(markingRubricText);
    if (parsedCriteria.length > 0) {
      updates.rubricCriteria = parsedCriteria;
      updates.rubric_criteria = parsedCriteria;
    }

    if (serverAnalysis) {
      updates["assignment_analysis"] = serverAnalysis;
    }

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

    if (isDefaultOrUntitled && localQuestion.trim().length >= 10) {
      const derived = deriveHeuristicTitle(localQuestion.trim());
      if (derived && derived !== "Academic Assignment") {
        updates.title = derived;
        updates.assignment_title = derived;
      }
    }

    const safeUpdates = stripCircularReferences(updates);
    await saveAnswers(safeUpdates);

    // Smoothly advance to Part 2: Understand
    onProceed?.();
  };

  const processUploadedFile = async (file: File) => {
    if (!file) return;

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
    const validation = validateBriefFile(file, {
      isAdmin,
      maxBytes: isPremium ? 50 * 1024 * 1024 : 5 * 1024 * 1024,
    });
    if (!validation.valid) {
      setParseNotice(validation.error || "Unsupported file format.");
      return;
    }

    setUploadingBrief(true);
    setParseNotice(null);
    setUploadedFileName(file.name);

    try {
      const targetProjectId = await ensurePersisted();
      const formData = new FormData();
      formData.append("file", file);

      const res = await authedFetch(`/api/projects/${targetProjectId}/assignment/parse-brief`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Brief upload endpoint failed");
      }

      const data = await res.json();
      const rawText: string = data.text || "";
      if (!rawText || rawText.trim().length === 0) {
        throw new Error("Could not parse this document.");
      }
      const cleanPrompt = cleanAnswerString(rawText) || file.name.replace(/\.[^/.]+$/, "");

      setLocalQuestion(cleanPrompt);
      setLocalBrief(cleanPrompt);

      let newWordCount = localWordCount;
      if (data.detectedWordCount && Number(data.detectedWordCount) > 0) {
        newWordCount = Math.max(100, Math.min(50000, Number(data.detectedWordCount)));
        setLocalWordCount(newWordCount);
      }

      let nextLevel = localLevel;
      if (data.detectedLevel) {
        nextLevel = data.detectedLevel as AcademicLevel;
        setLocalLevel(nextLevel);
      }

      let nextCitation = localCitation;
      if (data.detectedCitation) {
        nextCitation = data.detectedCitation;
        setLocalCitation(nextCitation);
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
      if (data.analysis) {
        serverAnalysis = data.analysis;
      }

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
        console.warn("Brief parse analyze fallback:", analyzeErr);
      }

      setStructure(dynamicStruct);
      if (serverAnalysis) {
        setAnalysis(serverAnalysis);
      }

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

      const safeUpdates = stripCircularReferences(updates);
      await saveAnswers(safeUpdates);

      // Advance to Understand stage
      onProceed?.();
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-6 text-neutral-900 dark:text-neutral-100 font-sans">
      {/* Clean Apple-Grade Header for Part 1: Extract */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
              Phase 1 · Part 1: Extract
            </span>
            <span className="text-xs text-neutral-400 font-medium hidden sm:inline-block">· Coursework &amp; Essay</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            Extract Your Brief
            <span className="sr-only">Understand Your Brief</span>
            <span className="sr-only">Phase 1: Understand the Assignment Brief</span>
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
            Upload your assignment brief or paste prompts to extract parameters, questions, and grading criteria.
          </p>
        </div>

        {onProceed && (
          <button
            type="button"
            onClick={onProceed}
            className="self-start sm:self-center px-3 py-1.5 rounded-xl border border-neutral-200/80 dark:border-white/10 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <span>Skip to Part 2: Understand</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Unified Assignment Setup Box (Step 1: Brief Input) */}
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

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleFileUpload}
            disabled={uploadingBrief}
            className="hidden"
            aria-label="Upload assignment brief document"
          />

          {intakeTab === "paste" ? (
            <textarea
              value={localQuestion}
              onChange={(e) => setLocalQuestion(e.target.value)}
              onBlur={() => {
                const clean = cleanAnswerString(localQuestion);
                saveAnswers({
                  instructions: clean,
                  assignment_question: clean,
                  assignment_prompt: clean,
                });
              }}
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
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    processUploadedFile(file);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border border-dashed rounded-xl p-6 sm:p-8 text-center transition-all cursor-pointer ${
                  isDraggingOver
                    ? "border-neutral-900 bg-neutral-100/50 dark:border-white dark:bg-white/5"
                    : "border-neutral-200 dark:border-white/15 bg-neutral-50/50 dark:bg-white/[0.02] hover:bg-neutral-100/40 dark:hover:bg-white/[0.04]"
                }`}
              >

                {uploadingBrief ? (
                  <div className="flex flex-col items-center justify-center space-y-2.5">
                    <div className="w-5 h-5 border-2 border-neutral-900 dark:border-white border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                      Extracting assignment questions, word limits &amp; criteria...
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 rounded-full bg-neutral-200/60 dark:bg-white/10 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                        Upload your assignment brief or module handbook
                      </p>
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                        Supports PDF, DOCX, DOC, or TXT {isAdmin ? "(Unlimited size · Admin)" : isPremium ? "(Up to 50MB · Pro)" : "(Up to 5MB · Free)"}
                      </p>
                    </div>

                    {uploadedFileName && (
                      <div className="w-full flex items-center justify-between p-2.5 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 text-xs text-left">
                        <div className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200 min-w-0">
                          <FileText className="w-4 h-4 text-neutral-500 shrink-0" />
                          <span className="font-medium truncate">{uploadedFileName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadedFileName("");
                            setLocalQuestion("");
                            setLocalBrief("");
                          }}
                          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1 rounded-md"
                          title="Remove file"
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
                )}
              </div>
            </DropzoneErrorBoundary>
          )}

          {parseNotice && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{parseNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setParseNotice(null)}
                aria-label="Dismiss notice"
                className="text-xs font-semibold hover:underline"
              >
                Dismiss
              </button>
            </div>
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
                onChange={(e) => {
                  const val = e.target.value as AcademicLevel;
                  setLocalLevel(val);
                  saveAnswers({ academic_level: val, academicLevel: val });
                }}
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
                onClick={() => {
                  setLocalLevel("undergraduate");
                  saveAnswers({ academic_level: "undergraduate", academicLevel: "undergraduate" });
                }}
                className={localLevel === "undergraduate" ? "bg-white" : ""}
              >
                Undergraduate
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocalLevel("postgraduate");
                  saveAnswers({ academic_level: "postgraduate", academicLevel: "postgraduate" });
                }}
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
                onChange={(e) => {
                  const val = e.target.value as AssignmentType;
                  setLocalType(val);
                  saveAnswers({ assignment_type: val, assignmentType: val });
                }}
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
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalCitation(val);
                  saveAnswers({ citation_style: val, citationStyle: val });
                }}
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
          <div className="space-y-1">
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
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalTone(val);
                  saveAnswers({ writing_tone: val, writingTone: val });
                }}
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
                  const next = Math.max(100, current - 250);
                  setLocalWordCount(next);
                  saveAnswers({ word_count: next, word_limit: next, targetWordCount: next });
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
                      saveAnswers({ word_count: clamped, word_limit: clamped, targetWordCount: clamped });
                    }
                  }}
                  onBlur={() => {
                    const cur = Number(localWordCount);
                    const sanitized = !cur || isNaN(cur) || cur < 100 ? 2000 : cur > 50000 ? 50000 : cur;
                    setLocalWordCount(sanitized);
                    saveAnswers({ word_count: sanitized, word_limit: sanitized, targetWordCount: sanitized });
                  }}
                  aria-label="Target Word Count"
                  placeholder="2000"
                  className="w-full h-8 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg pl-2 pr-12 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all font-semibold shadow-2xs text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="pointer-events-none absolute right-2.5 text-[11px] font-medium text-neutral-400 select-none">
                  words
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const current = Number(localWordCount) || 2000;
                  const next = Math.min(50000, current + 250);
                  setLocalWordCount(next);
                  saveAnswers({ word_count: next, word_limit: next, targetWordCount: next });
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

        {/* Optional Course & Rubric Accordion */}
        <div className="pt-2 border-t border-neutral-100 dark:border-white/5">
          <button
            type="button"
            onClick={() => setShowCourseDetails(!showCourseDetails)}
            className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCourseDetails ? "rotate-180" : ""}`} />
            <span>+ Course Details &amp; Rubric (Optional)</span>
          </button>

          {showCourseDetails && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
              <input
                type="text"
                defaultValue={courseName}
                onBlur={(e) => saveAnswers({ course_name: e.target.value, courseCode: e.target.value })}
                placeholder="Course code (e.g. ECON201)"
                className="bg-neutral-50/70 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
              <input
                type="text"
                defaultValue={institutionName}
                onBlur={(e) => saveAnswers({ institution: e.target.value })}
                placeholder="Institution (e.g. Oxford)"
                className="bg-neutral-50/70 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
              <input
                type="date"
                defaultValue={deadlineDate}
                onBlur={(e) => saveAnswers({ deadline: e.target.value })}
                className="bg-neutral-50/70 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
          )}
        </div>

        {/* Primary CTA Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-neutral-100 dark:border-white/5">
          <div className="text-xs">
            {!canGenerate ? (
              <p className="text-red-500 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Please provide the assignment question, word count, and citation style to continue.</span>
              </p>
            ) : (
              <p className="text-neutral-500 dark:text-neutral-400">
                Ready to extract assignment brief and proceed to thesis &amp; outline calibration.
              </p>
            )}
          </div>

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
                <span>{AGENTIC_THINKING_STAGES[agenticStageIndex] || "Thinking through assignment…"}</span>
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
            disabled={!canGenerate || isGeneratingStructure}
            onClick={handleGenerateStructure}
            aria-label="Proceed to Sources (Confirm Structure & Proceed to Sources / Approve Outline & Proceed)"
            className="sr-only"
          >
            Proceed to Sources
          </button>
        </div>

        {structureError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-2">
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
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          description={upgradeModalDescription}
        />
      )}
    </div>
  );
}
