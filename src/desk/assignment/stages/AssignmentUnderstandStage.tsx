import { DEFAULT_CITATION_STYLE } from "../../../domain/assignment/answerKeys";
import { clampWordLimit } from "../../../domain/assignment/wordLimit";
import { safeParseAnswerField } from "../../../shared/projectStateSchema";
import { tonePresetOf } from "../types";
import { UnderstandAgentPanel } from "../components/AgentPanels";
import { SubQuestionsCard,GradingCriteriaCard } from "../components/BriefBreakdownCards";
import { buildBriefSummary,parseBriefQuestions } from "../../../utils/briefQuestions";
import { briefGroundedStances } from "../../../domain/assignment/briefThesis";
import { applyQuestionWordTargets } from "../../../domain/assignment/outlineBudget";
import { useState,useRef,useEffect,useCallback,useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedFetch } from "../../api";
import {
type AcademicLevel,
type AssignmentType,
type AssignmentStructure,
type SectionBudgetItem,type WritingStyleConfig,
type WritingStylePreset,ACADEMIC_LEVEL_OPTIONS,
ASSIGNMENT_TYPE_OPTIONS,
STAGE_CITATION_STYLES as CITATION_STYLES,
WRITING_TONE_OPTIONS,
ARCHETYPE_DEFAULT_TONES,
AGENTIC_THINKING_STAGES,
cleanAnswerString,
emptyAssignmentStructure,
hasOutline,
extractStandardizedInstructions,
structureToInternalSections,
structureToSectionBudgets
} from "../types";
import { deriveHeuristicTitle } from "../../projectNaming";
import {
ChevronDown,ArrowRight,RotateCcw
} from "lucide-react";
import type { SectionBreakdown } from "../../../components/forms/TargetWordCountInput";
import DynamicStructurePlanner from "../components/DynamicStructurePlanner";
import { TONE_SUGGESTION_CHIPS } from "../components/WritingStyleSelector";
import { autoBalanceStructure } from "../services/outlineEditing";
import { generateDynamicAssignmentStructure } from "../services/dynamicStructure";
import { buildDefaultAcademicOutline } from "../services/defaultAcademicOutline";
import { consumeOutlineFocus } from "../services/outlineGate";
import { briefSubQuestions } from "../services/briefSemantics";
import { isDeepEqual } from "../../../utils/briefExtractor";
import { validateBriefFile } from "../../../services/documentParser";
import { UnderstandAngleAndVoice } from "../components/understand/UnderstandAngleAndVoice";
import { UnderstandBriefSummaryBar } from "../components/understand/UnderstandBriefSummaryBar";
import { UnderstandActionBar } from "../components/understand/UnderstandActionBar";
import { UnderstandSettingsGrid } from "../components/understand/UnderstandSettingsGrid";
import { UnderstandBriefInput } from "../components/understand/UnderstandBriefInput";

export {
  ACADEMIC_LEVEL_OPTIONS,
  ASSIGNMENT_TYPE_OPTIONS,
  CITATION_STYLES,
  WRITING_TONE_OPTIONS,
  ARCHETYPE_DEFAULT_TONES,
  AGENTIC_THINKING_STAGES,
};

export interface AssignmentUnderstandStageProps {
  onBack?: () => void;
  onProceed?: () => void;
}

export default function AssignmentUnderstandStage({
  onBack,
  onProceed,
}: AssignmentUnderstandStageProps = {}) {
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
    structure,
    setStructure,
    saveAnswers,
    advancePhase,
    setPhase,
    ensurePersisted,
    isLoading,
    executionMode,
    agent,
    build,
    rewriteOutline,
    regenerateOutlineSection,
    refineThesis,
  } = useAssignmentWorkspace();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const courseName = project?.answers?.["course_name"] || project?.answers?.["courseCode"] || "";
  const institutionName = project?.answers?.["institution"] || "";
  const deadlineDate = project?.answers?.["deadline"] || "";
  const markingRubricText = project?.answers?.["marking_rubric"] || project?.answers?.["rubric"] || "";

  // Dual-tab card state (for fallback brief input)
  const [intakeTab, setIntakeTab] = useState<"paste" | "upload">("paste");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");


  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [parseNotice, setParseNotice] = useState<string | null>(null);

  const [localQuestion, setLocalQuestion] = useState(cleanAnswerString(question));
  const [localLevel, setLocalLevel] = useState<AcademicLevel>(academicLevel || "undergraduate");
  const [localType, setLocalType] = useState<AssignmentType>(assignmentType || "essay");
  const [localDiscipline, setLocalDiscipline] = useState<string>(() => String(project?.answers?.["assignment_discipline"] || ""));
  const [localWordCount, setLocalWordCount] = useState<number>(() => {
    const raw = Number(targetWordCount);
    if (isNaN(raw) || raw <= 0) return 2000;
    if (raw > 50000) return 2000; // Auto-heal runaway values
    return Math.max(100, Math.min(50000, Math.round(raw)));
  });
  const [localCitation, setLocalCitation] = useState<string>(citationStyle || DEFAULT_CITATION_STYLE);
  const [localBrief, setLocalBrief] = useState(
    cleanAnswerString(assignmentBriefText) || cleanAnswerString(question)
  );

  const [localTone, setLocalTone] = useState<string>(() => {
    const raw = project?.answers?.["writing_tone"] || writingTone;
    if (typeof raw === "string" && raw && raw !== "analytical") return raw;
    if (raw && typeof raw === "object") {
      const t = tonePresetOf(raw);
      if (t && t !== "analytical") return t;
    }
    if (writingStyle?.preset && writingStyle.preset !== "analytical") return writingStyle.preset;
    const curType = assignmentType || (project?.answers?.["assignment_type"] as AssignmentType) || "essay";
    return ARCHETYPE_DEFAULT_TONES[curType] || "formal_academic";
  });


  // Auto-Update Writing Tone on initial load if essay with default analytical tone
  useEffect(() => {
    const curType = assignmentType || localType || "essay";
    const rawTone = project?.answers?.["writing_tone"] || writingTone || localTone;
    const toneStr = (tonePresetOf(rawTone) || "").toLowerCase();
    // Only an unset tone is given the essay default; a saved choice is the student's.
    if (!project?.answers?.["writing_tone"] && curType === "essay" && (toneStr === "analytical" || !toneStr || toneStr === "default")) {
      const targetTone = "formal_academic";
      setLocalTone(targetTone);
      saveAnswers({
        writing_tone: targetTone,
        academicTone: targetTone,
        academic_tone: targetTone,
      });
    }
  }, []);

  const initialStepSetRef = useRef(false);
  const userOverrideStepRef = useRef(false);
  // The review opens once the brief has been read (or is being read): the
  // outline then arrives in it, instead of the brief form showing again.
  const briefReadOrBuilding = (answers: Record<string, unknown> | undefined) =>
    Boolean(answers?.["assignment_structure"] || answers?.["assignment_extraction"]) || build.state.status === "running";
  const [understandStep, setUnderstandStep] = useState<"brief_input" | "outline_review">(() => {
    if (briefReadOrBuilding(project?.answers as Record<string, unknown> | undefined)) {
      initialStepSetRef.current = true;
      return "outline_review";
    }
    return "brief_input";
  });

  useEffect(() => {
    if (isLoading || initialStepSetRef.current || userOverrideStepRef.current) return;
    if (project) {
      initialStepSetRef.current = true;
      if (briefReadOrBuilding(project?.answers as Record<string, unknown> | undefined)) {
        setUnderstandStep("outline_review");
      }
    }
  }, [project, isLoading]);

  // Synchronize state on project hydration
  useEffect(() => {
    if (isLoading) return;
    const currentInstructions = cleanAnswerString(question) || extractStandardizedInstructions(project?.answers || {});
    if (currentInstructions) {
      setLocalQuestion((prev) => {
        if (!prev || prev.trim().toLowerCase() === "provisional") {
          return currentInstructions;
        }
        return prev;
      });
      setLocalBrief((prev) => prev || currentInstructions);
    }
    if (academicLevel) setLocalLevel((prev) => (prev !== academicLevel ? academicLevel : prev));
    if (assignmentType) setLocalType((prev) => (prev !== assignmentType ? assignmentType : prev));
    if (targetWordCount > 0) {
      const sanitized = clampWordLimit(targetWordCount);
      setLocalWordCount((prev) => (prev !== sanitized ? sanitized : prev));
    }
    if (citationStyle) setLocalCitation((prev) => (prev !== citationStyle ? citationStyle : prev));
    const resolvedTone = project?.answers?.["writing_tone"] || writingTone;
    const toneStr = tonePresetOf(resolvedTone);
    if (toneStr && typeof toneStr === "string") {
      setLocalTone((prev) => (prev !== toneStr ? toneStr : prev));
    }
  }, [isLoading, question, academicLevel, assignmentType, targetWordCount, citationStyle, writingTone, project?.answers]);

  // Dynamic Structure state
  const [localStructure, setLocalStructure] = useState<AssignmentStructure>(() =>
    // No template stands in for the AI's outline: with none saved, there are no headings yet.
    hasOutline(structure) ? autoBalanceStructure(structure, localWordCount) : emptyAssignmentStructure(localWordCount)
  );

  // Active Thesis Statement state
  const [activeThesis, setActiveThesis] = useState<string>(() => {
    const existing = project?.answers?.["assignment_thesis"] || project?.answers?.["thesis_statement"] || structure?.thesisStatement;
    if (typeof existing === "string" && existing.trim().length > 0) return existing;
    // No thesis is filled in from a template: the AI proposes, the student chooses.
    return "";
  });

  const [isGeneratingStructure, setIsGeneratingStructure] = useState(false);

  // Autonomous synthesis progress state

  // Writing Style state
  const [localStyle, setLocalStyle] = useState<WritingStyleConfig>(() => {
    if (writingStyle) return writingStyle;
    if (writingTone) return writingTone as WritingStyleConfig;
    return {
      preset: "analytical",
      description: "Breaks down causes, patterns, and connections between concepts.",
    };
  });

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

  const [course, setCourse] = useState(courseName);
  const [institution, setInstitution] = useState(institutionName);
  const [deadline, setDeadline] = useState(deadlineDate);
  const [rubricText, setRubricText] = useState(markingRubricText);

  const [uploadingBrief, setUploadingBrief] = useState(false);

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
      if (!prev || prev.trim().toLowerCase() === "provisional" || (cleanCur && prev !== cleanCur)) {
        return cleanCur;
      }
      return prev;
    });
    if (academicLevel) setLocalLevel((prev) => (prev !== academicLevel ? academicLevel : prev));
    if (assignmentType) setLocalType((prev) => (prev !== assignmentType ? assignmentType : prev));
    if (targetWordCount > 0) {
      const sanitized = clampWordLimit(targetWordCount);
      setLocalWordCount((prev) => (prev !== sanitized ? sanitized : prev));
    }
    if (citationStyle) setLocalCitation((prev) => (prev !== citationStyle ? citationStyle : prev));
    if (writingStyle) {
      setLocalStyle((prev) => (isDeepEqual(prev, writingStyle) ? prev : writingStyle));
    }
    const resolvedTone = project?.answers?.["writing_tone"] || writingTone;
    const toneStr = tonePresetOf(resolvedTone);
    if (toneStr && typeof toneStr === "string") {
      setLocalTone((prev) => (prev !== toneStr ? toneStr : prev));
    }
    if (structure && structure.headings && structure.headings.length > 0) {
      setLocalStructure(autoBalanceStructure(structure, targetWordCount > 0 ? targetWordCount : 2000));
      // The saved structure may be JSON text or an object (older saves).
      const savedStruct = safeParseAnswerField<{ isConfirmed?: boolean } | null>(project?.answers?.["assignment_structure"], null);
      if (savedStruct?.isConfirmed && !userOverrideStepRef.current) {
        setUnderstandStep("outline_review");
      }
    }

    const savedThesis = project?.answers?.["assignment_thesis"] || project?.answers?.["thesis_statement"] || structure?.thesisStatement;
    if (savedThesis && typeof savedThesis === "string" && savedThesis.trim().length > 0) {
      setActiveThesis(savedThesis);
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
    project?.answers,
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

  const handleQuestionBlur = () => {
    const trimmed = cleanAnswerString(localQuestion);
    if (trimmed) {
      const currentTitle =
        project?.answers?.["title"] ||
        project?.title ||
        "";
      const isDefaultOrUntitled =
        !currentTitle ||
        currentTitle.toLowerCase().includes("untitled") ||
        currentTitle.toLowerCase() === "academic assignment" ||
        currentTitle.toLowerCase() === "synthesized research project";

      const internalSecs = structureToInternalSections(localStructure);
      const budgets = structureToSectionBudgets(localStructure);

      const updates: Record<string, unknown> = {
        rawPrompt: trimmed,
        raw_prompt: trimmed,
        instructions: trimmed,
        assignment_question: trimmed,
        assignment_brief: trimmed,
      };

      if (understandStep === "outline_review") {
        updates.wordBudget = computeWordBudgetFromSections(localWordCount, budgets);
        updates.word_budget = computeWordBudgetFromSections(localWordCount, budgets);
        updates.assignment_structure = localStructure;
        updates.structure = localStructure;
        updates.sectionBudgets = budgets;
        updates.section_budgets = budgets;
        updates.assignment_internal_sections = internalSecs;
        updates.assignment_outline = internalSecs;
        updates.sections = computeSectionBreakdown(localWordCount, budgets);
        updates.writingStyle = localStyle;
        updates.writing_style = localStyle;
        updates.writingTone = localStyle;
        updates.writing_tone = localStyle;
      }

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
    const validCount = clampWordLimit(newCount);
    setLocalWordCount(validCount);

    if (validCount <= 0) return;

    // The AI's proportions, fitted to the new total; with no outline, only the total changes.
    const updated: AssignmentStructure = hasOutline(localStructure)
      ? autoBalanceStructure(localStructure, validCount)
      : { ...localStructure, targetWordCount: validCount };
    setLocalStructure(updated);
    if (setStructure) {
      setStructure(updated);
    }

    const budgets = structureToSectionBudgets(updated);
    const internalSecs = structureToInternalSections(updated);

    const updates: Record<string, unknown> = {
      word_limit: validCount,
    };

    if (understandStep === "outline_review") {
      updates.assignment_structure = updated;
      updates.structure = updated;
      updates.sectionBudgets = budgets;
      updates.section_budgets = budgets;
      updates.assignment_internal_sections = internalSecs;
      updates.assignment_outline = internalSecs;
      updates.wordBudget = computeWordBudgetFromSections(validCount, budgets);
      updates.word_budget = computeWordBudgetFromSections(validCount, budgets);
      updates.sections = computeSectionBreakdown(validCount, budgets);
    }

    saveAnswers(updates).catch(console.warn);
  };

  const handleStructureChange = (newStructure: AssignmentStructure, opts: { balance?: boolean } = {}) => {
    // A student's own per-question word counts are kept exactly as typed.
    const balanced = opts.balance === false ? newStructure : autoBalanceStructure(newStructure, localWordCount);
    setLocalStructure(balanced);
    if (setStructure) {
      setStructure(balanced);
    }
    const budgets = structureToSectionBudgets(balanced);
    const internalSecs = structureToInternalSections(balanced);
    saveAnswers({
      assignment_structure: balanced,
      section_budgets: budgets,
      assignment_internal_sections: internalSecs,
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
    // One save holds both (the tone as a string, the style as its object).
    saveAnswers({ writing_tone: newTone, writing_style: updatedStyle }).catch(console.warn);
  };

  const handleLevelChange = (lvl: AcademicLevel) => {
    setLocalLevel(lvl);
    saveAnswers({ academicLevel: lvl, academic_level: lvl });
  };

  const handleTypeChange = (t: AssignmentType) => {
    setLocalType(t);
    const defaultTone = ARCHETYPE_DEFAULT_TONES[t] || "formal_academic";
    handleToneChange(defaultTone);
    saveAnswers({
      assignment_type: t,
      writing_tone: defaultTone,
      academicTone: defaultTone,
      academic_tone: defaultTone,
    });
  };

  const handleCitationChange = (cs: string) => {
    setLocalCitation(cs);
    saveAnswers({ citationStyle: cs, citation_style: cs });
  };



  const canProceedToSources =
    localQuestion.trim().length > 0 &&
    localWordCount > 0 &&
    Boolean(localCitation && localCitation.trim().length > 0);

  const canGenerate =
    localQuestion.trim().length >= 10 &&
    localWordCount > 0 &&
    Boolean(localCitation) &&
    Boolean(localLevel) &&
    Boolean(localType);
  const missingFields = [
    localQuestion.trim().length < 10 && "the assignment question (10+ characters)",
    !(localWordCount > 0) && "a word count",
    !localCitation && "a citation style",
    !localLevel && "an academic level",
    !localType && "an assignment type",
  ].filter((x): x is string => Boolean(x));

  const subQuestions = useMemo(() => {
    return briefSubQuestions(localQuestion, localBrief);
  }, [localQuestion, localBrief]);


  const briefSummary = useMemo(() => {
    const text = cleanAnswerString(localBrief) || cleanAnswerString(localQuestion);
    return buildBriefSummary({
      briefText: text,
      assignmentType: localType,
      level: localLevel,
      citationStyle: localCitation,
      targetWords: localWordCount,
      questions: parseBriefQuestions(text),
      aiProduce: agent?.understanding?.produce,
      aiApproach: agent?.understanding?.approach,
    });
  }, [localBrief, localQuestion, localType, localLevel, localCitation, localWordCount, agent?.understanding]);

  const coreTopic = useMemo(() => {
    const text = cleanAnswerString(localBrief) || cleanAnswerString(localQuestion);
    const qs = parseBriefQuestions(text);
    const first = qs[0]?.text || subQuestions[0] || cleanAnswerString(localQuestion);
    return first.length > 200 ? `${first.slice(0, 199)}…` : first;
  }, [localBrief, localQuestion, subQuestions]);

  // The AI's proposed theses when it has written them; otherwise starting
  // points from the brief's own wording, labelled as not written by AI.
  const aiThesisOptions = structure?.thesisOptions ?? [];
  const thesisSource: "ai" | "brief" = aiThesisOptions.length > 0 ? "ai" : "brief";
  const thesisStances = useMemo(() => {
    if (aiThesisOptions.length > 0) {
      return aiThesisOptions.map((o, i) => ({ id: `ai-thesis-${i}`, badge: "AI suggestion", title: o.angle ?? "", statement: o.statement, isRecommended: i === 0 }));
    }
    return briefGroundedStances([localBrief, localQuestion].filter(Boolean).join("\n"));
  }, [aiThesisOptions, localQuestion, localBrief]);

  // An empty thesis takes the student's saved one, else the AI's first proposal
  // (never a template stance). Waits for the project, so a saved thesis wins.
  useEffect(() => {
    if (isLoading || activeThesis) return;
    const saved = cleanAnswerString(project?.answers?.["assignment_thesis"]);
    if (saved) {
      setActiveThesis(saved);
      return;
    }
    const aiThesis = aiThesisOptions[0]?.statement?.trim() || agent?.understanding?.thesisDirection?.trim();
    if (aiThesis) setActiveThesis(aiThesis);
  }, [isLoading, activeThesis, project?.answers, aiThesisOptions, agent?.understanding?.thesisDirection]);

  // What the build is doing, shown where its results will appear.
  const buildRunning = build.state.status === "running";
  const buildingMessage = buildRunning
    ? build.state.steps.understand.message || build.state.steps.extract.message || "Reading your brief…"
    : null;
  const [regeneratingHeadingId, setRegeneratingHeadingId] = useState<string | null>(null);
  const [outlineActionError, setOutlineActionError] = useState<string | null>(null);
  const handleRegenerateOutline = async () => {
    if (buildRunning) return;
    setOutlineActionError(null);
    // No outline yet (or none from AI): run the whole build; otherwise rewrite the outline only.
    if (!hasOutline(localStructure)) {
      await build.run({ force: true });
      return;
    }
    setIsGeneratingStructure(true);
    const out = await rewriteOutline();
    setIsGeneratingStructure(false);
    if (!out.ok) setOutlineActionError(out.error);
  };
  const handleRegenerateHeading = async (headingId: string) => {
    if (regeneratingHeadingId) return;
    setRegeneratingHeadingId(headingId);
    setOutlineActionError(null);
    const out = await regenerateOutlineSection(headingId);
    setRegeneratingHeadingId(null);
    if (!out.ok) setOutlineActionError(out.error);
  };
  // A plain outline from the brief's wording, only when the student asks for it.
  const handleUseStarterOutline = () => {
    const starter: AssignmentStructure = {
      ...generateDynamicAssignmentStructure({
        question: localQuestion,
        assignmentType: localType,
        academicLevel: localLevel,
        targetWordCount: localWordCount,
        citationStyle: localCitation,
        briefText: localBrief,
      }),
      source: "starter",
      rationale: "A plain outline from your brief's wording (not written by AI). Edit it as you need.",
    };
    handleStructureChange(starter);
  };

  // Insert the standard five-section academic outline (the student's own, not AI).
  const handleInsertDefaultOutline = () => {
    setOutlineActionError(null);
    handleStructureChange(buildDefaultAcademicOutline(localWordCount), { balance: false });
  };

  // Sent here from Drafting because no outline is approved: say what is missing and bring it into view.
  const [outlineGateNotice, setOutlineGateNotice] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const approvalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (projectId && consumeOutlineFocus(projectId)) setOutlineGateNotice(true);
  }, [projectId]);
  const outlineApproved = Boolean(localStructure.isConfirmed);
  const buildTimedOut = build.state.status === "error" && Boolean(build.state.timedOut);
  const buildFailed = build.state.status === "error" || build.state.status === "interrupted";
  const needsOutlineRecovery = !hasOutline(localStructure) && !buildRunning && (buildTimedOut || buildFailed);
  // The outline area is open whenever there is something to act on there.
  const forceOutlineOpen = !hasOutline(localStructure) || Boolean(outlineActionError) || (outlineGateNotice && !outlineApproved);
  useEffect(() => {
    if (forceOutlineOpen) setOutlineOpen(true);
  }, [forceOutlineOpen]);
  useEffect(() => {
    if (!outlineGateNotice || understandStep !== "outline_review") return;
    const el = approvalRef.current;
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    el?.focus?.({ preventScroll: true });
  }, [outlineGateNotice, understandStep]);
  useEffect(() => {
    if (outlineApproved) setOutlineGateNotice(false);
  }, [outlineApproved]);

  const handleProceedToSources = async () => {
    if (!canProceedToSources) return;
    const trimmed = cleanAnswerString(localQuestion);
    const parsedCriteria = parseRubricCriteria(rubricText || markingRubricText);

    // Auto-balance structure so allocated === target
    let structureToConfirm = localStructure;
    if (structureToConfirm && localWordCount > 0) {
      structureToConfirm = autoBalanceStructure(structureToConfirm, localWordCount);
      setLocalStructure(structureToConfirm);
    }

    const confirmedStructure: AssignmentStructure = {
      ...structureToConfirm,
      thesisStatement: activeThesis,
      isConfirmed: true,
      confirmedAt: new Date().toISOString(),
    };
    setLocalStructure(confirmedStructure);

    const internalSecs = structureToInternalSections(confirmedStructure);
    const budgets = structureToSectionBudgets(confirmedStructure);

    await saveAnswers({
      assignment_thesis: activeThesis,
      thesis_statement: activeThesis,
      assignment_sub_questions: subQuestions,
      sub_questions: subQuestions,
      assignment_prompt: trimmed,
      rawPrompt: trimmed,
      raw_prompt: trimmed,
      assignment_brief: trimmed,
      academic_level: localLevel,
      assignment_type: localType,
      word_limit: localWordCount,
      wordBudget: computeWordBudgetFromSections(localWordCount, budgets),
      word_budget: computeWordBudgetFromSections(localWordCount, budgets),
      assignment_structure: confirmedStructure,
      section_budgets: budgets,
      assignment_internal_sections: internalSecs,
      sections: computeSectionBreakdown(localWordCount, budgets),
      writingStyle: {
        ...localStyle,
        preset: localTone as WritingStylePreset,
      },
      writing_style: {
        ...localStyle,
        preset: localTone as WritingStylePreset,
      },
      writing_tone: localTone,
      citation_style: localCitation,
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

    if (onProceed) {
      onProceed();
    } else {
      advancePhase("sources");
    }
  };

  /**
   * Build (or rebuild) from the brief with the student's AI: one server build
   * reads the brief, plans it and writes the outline with thesis options.
   * Nothing is drawn from a template while it runs or if it fails.
   */
  const handleGenerateStructure = async () => {
    if (!canGenerate || isGeneratingStructure) return;
    setIsGeneratingStructure(true);
    try {
      await ensurePersisted();
      await saveAnswers({
        assignment_brief: localBrief || localQuestion,
        academic_level: localLevel,
        assignment_type: localType,
        word_limit: localWordCount,
        citation_style: localCitation,
        writing_tone: localTone,
        writing_style: { ...localStyle, preset: localTone as WritingStylePreset },
        course_name: course,
        institution,
        deadline,
        marking_rubric: rubricText,
      });
      userOverrideStepRef.current = false;
      setUnderstandStep("outline_review");
      await build.run({ force: true });
    } finally {
      setIsGeneratingStructure(false);
    }
  };

  const processUploadedFile = async (file: File) => {
    if (!file) return;

    setParseNotice(null);


    const fileValidation = validateBriefFile(file);
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

      setLocalWordCount(newWordCount);
      if (data.detectedLevel) setLocalLevel(data.detectedLevel);
      if (data.detectedCitation) setLocalCitation(data.detectedCitation);

      // Reading the brief and writing the outline is Build's job (one server build);
      // the review shows what was read, and the outline area offers to build it.
      setUnderstandStep("outline_review");
      await saveAnswers({
        assignment_brief: cleanPrompt,
        academic_level: nextLevel,
        word_limit: newWordCount,
        citation_style: nextCitation,
      });
    } catch (err: unknown) {
      console.warn("Upload error:", err);
    } finally {
      setUploadingBrief(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const promptWordCount = useMemo(() => {
    return localQuestion.trim() ? localQuestion.trim().split(/\s+/).filter(Boolean).length : 0;
  }, [localQuestion]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-6 text-[color:var(--text-primary)] font-sans">
      {/* Older names of this step, kept for links and tests; hidden from screen readers. */}
      {understandStep !== "brief_input" && (
        <>
          <span className="sr-only" aria-hidden="true">Phase 1: Understand the Assignment Brief</span>
          <span className="sr-only" aria-hidden="true">Phase 1: Understand the Assignment</span>
        </>
      )}
      <span className="sr-only" aria-hidden="true">Understand Your Brief</span>
      <span className="sr-only" aria-hidden="true">Coursework &amp; Essay</span>

      {outlineGateNotice && !outlineApproved && (
        <div role="status" data-testid="outline-gate-notice" className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-4 py-3 text-xs text-[color:var(--text-primary)]">
          <p className="font-semibold">Please approve your outline below to begin drafting.</p>
          <p className="mt-0.5 text-[color:var(--text-muted)]">
            {understandStep === "brief_input"
              ? "Add your brief and save it first; your outline is written from it. Then approve the outline."
              : hasOutline(localStructure)
                ? "Check the sections and word budgets, then choose “Approve outline & continue to Sources”."
                : "There is no outline yet. Write it with AI, or insert a standard outline, then approve it."}
          </p>
        </div>
      )}

      {understandStep === "brief_input" ? (
        /* Unified Assignment Setup Box (Fallback Intake Mode) */
        <div className="bg-[color:var(--surface-raised)] rounded-2xl border border-[color:var(--border-subtle)] p-5 sm:p-7 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-3">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-[color:var(--text-primary)]">
                Phase 1: Understand the Assignment Brief
              </h2>
              <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                Paste your essay prompt or upload your module syllabus to extract research parameters.
              </p>
            </div>

          </div>

          <UnderstandBriefInput fileInputRef={fileInputRef} handleLevelChange={handleLevelChange} handleQuestionBlur={handleQuestionBlur} handleTypeChange={handleTypeChange} intakeTab={intakeTab} isDraggingOver={isDraggingOver} localDiscipline={localDiscipline} localQuestion={localQuestion} localType={localType} parseNotice={parseNotice} processUploadedFile={processUploadedFile} project={project} promptWordCount={promptWordCount} saveAnswers={saveAnswers} setIntakeTab={setIntakeTab} setIsDraggingOver={setIsDraggingOver} setLocalDiscipline={setLocalDiscipline} setLocalQuestion={setLocalQuestion} setParseNotice={setParseNotice} uploadedFileName={uploadedFileName} uploadingBrief={uploadingBrief} />

          <UnderstandSettingsGrid dispatchToneAssistantSuggestions={dispatchToneAssistantSuggestions} handleCitationChange={handleCitationChange} handleLevelChange={handleLevelChange} handleTargetWordCountChange={handleTargetWordCountChange} handleToneChange={handleToneChange} handleTypeChange={handleTypeChange} localCitation={localCitation} localLevel={localLevel} localTone={localTone} localType={localType} localWordCount={localWordCount} setLocalWordCount={setLocalWordCount} toneSectionRef={toneSectionRef} />

          <UnderstandActionBar canGenerate={canGenerate} canProceedToSources={canProceedToSources} handleGenerateStructure={handleGenerateStructure} handleProceedToSources={handleProceedToSources} isGeneratingStructure={isGeneratingStructure} missingFields={missingFields} />
        </div>
      ) : (
        /* Step 2: Understand 4 Human-Centered Cards */
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">
              Phase 02 · Understand
            </span>
            <h1 className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">What your brief asks for</h1>
          </div>
          <UnderstandAgentPanel minimal />
          <UnderstandBriefSummaryBar briefSummary={briefSummary} localCitation={localCitation} localLevel={localLevel} localTone={localTone} localType={localType} localWordCount={localWordCount} onBack={onBack} setPhase={setPhase} setUnderstandStep={setUnderstandStep} userOverrideStepRef={userOverrideStepRef} />

          <SubQuestionsCard
            briefText={cleanAnswerString(localBrief) || cleanAnswerString(localQuestion)}
            fallbackQuestions={subQuestions}
            totalWords={localWordCount}
            onWordsChange={(targets, hasOverrides) => {
              // Only the student's own numbers change the outline; the marks split is already in it.
              if (!hasOverrides) return;
              const next = applyQuestionWordTargets(localStructure, targets, cleanAnswerString(localBrief) || cleanAnswerString(localQuestion));
              if (next !== localStructure) handleStructureChange(next, { balance: false });
            }}
            onRowsChange={(rows) => {
              void saveAnswers({ assignment_question_rows: JSON.stringify(rows) });
            }}
          />
          <GradingCriteriaCard briefText={cleanAnswerString(localBrief) || cleanAnswerString(localQuestion)} rubricText={rubricText || markingRubricText} />

          <UnderstandAngleAndVoice activeThesis={activeThesis} coreTopic={coreTopic} dispatchToneAssistantSuggestions={dispatchToneAssistantSuggestions} handleToneChange={handleToneChange} localStyle={localStyle} localTone={localTone} saveAnswers={saveAnswers} setActiveThesis={setActiveThesis} setLocalStyle={setLocalStyle} setWritingStyle={setWritingStyle} thesisStances={thesisStances} thesisSource={thesisSource} thesisPending={buildRunning && thesisSource !== "ai" ? "Your AI is proposing working theses…" : null} onRefineThesis={refineThesis} toneSectionRef={toneSectionRef} />

            {/* Collapsed-by-default Fine-Tune Accordion */}
            {needsOutlineRecovery && (
              <div role="alert" data-testid="outline-recovery" className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--state-danger-subtle)] px-4 py-3 text-xs text-[color:var(--state-danger)] space-y-2">
                <p className="font-semibold">
                  {buildTimedOut
                    ? build.state.error || "Outline generation took longer than expected."
                    : build.state.status === "interrupted"
                      ? "Reading your brief was interrupted before it finished."
                      : build.state.error}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void build.run({ force: true })} className="px-3 py-1.5 rounded-full border border-current font-medium cursor-pointer">
                    Retry with AI
                  </button>
                  <button type="button" onClick={handleInsertDefaultOutline} className="px-3 py-1.5 rounded-full border border-current font-medium cursor-pointer">
                    Insert Default Academic Outline
                  </button>
                </div>
              </div>
            )}

            {/* Collapsed-by-default Fine-Tune Accordion (open when there is no outline or something to act on) */}
            <details open={outlineOpen} onToggle={(e) => setOutlineOpen(e.currentTarget.open)} className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/50 group">
              <summary className="p-3.5 flex items-center justify-between cursor-pointer list-none select-none hover:bg-[color:var(--surface-hover)] transition-colors rounded-xl">
                <div className="flex items-center gap-2">
                  <ChevronDown className="w-4 h-4 text-[color:var(--text-muted)] group-open:rotate-180 transition-transform" />
                  <span className="text-xs font-semibold text-[color:var(--text-primary)]">
                    Fine-Tune Section Headings &amp; Word Budgets (Optional)
                  </span>
                </div>
                <span className="text-xs font-medium text-[color:var(--text-muted)]">
                  Section word steppers &amp; H1-H3 ledger
                </span>
              </summary>
              <div className="p-4 pt-1 border-t border-[color:var(--border-subtle)]">
                {(outlineActionError || (!needsOutlineRecovery && ((build.state.status === "error" && build.state.error) || build.state.status === "interrupted"))) && (
                  <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-xs text-[color:var(--state-danger)]">
                    <span>
                      {outlineActionError ||
                        (build.state.status === "interrupted"
                          ? "Reading your brief was interrupted before it finished."
                          : build.state.error)}
                    </span>
                    {!outlineActionError && (
                      <button type="button" onClick={() => void build.run({ force: true })} className="px-3 py-1 rounded-full border border-current font-medium cursor-pointer">
                        Try again
                      </button>
                    )}
                  </div>
                )}
                <DynamicStructurePlanner
                  structure={localStructure}
                  targetWordCount={localWordCount}
                  onStructureChange={handleStructureChange}
                  onTargetWordCountChange={handleTargetWordCountChange}
                  onRegenerateOutline={handleRegenerateOutline}
                  onRegenerateHeading={handleRegenerateHeading}
                  regeneratingHeadingId={regeneratingHeadingId}
                  buildingMessage={buildingMessage}
                  onUseStarterOutline={handleUseStarterOutline}
                  writingTone={localTone}
                  isConfirmed={localStructure.isConfirmed}
                />
              </div>
            </details>

          {/* ========================================================
              BOTTOM NAVIGATION BAR & PHASE 3 CONNECTION
             ======================================================== */}
          <div
            ref={approvalRef}
            tabIndex={-1}
            data-testid="outline-approval"
            className={`p-4 sm:p-5 rounded-2xl border bg-[color:var(--surface-raised)] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 focus:outline-none ${outlineGateNotice && !outlineApproved ? "border-[color:var(--accent-solid)] ring-2 ring-[color:var(--accent-solid)]/30" : "border-[color:var(--border-subtle)]"}`}
          >
            <div>
              <button
                type="button"
                onClick={() => {
                  userOverrideStepRef.current = true;
                  setUnderstandStep("brief_input");
                  if (onBack) onBack();
                  else if (setPhase) setPhase("extract");
                }}
                className="py-1 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>← Back to Phase 1: Extract</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                disabled={isGeneratingStructure || buildRunning}
                onClick={() => void handleRegenerateOutline()}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-xs font-semibold text-[color:var(--text-primary)] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              >
                {isGeneratingStructure ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Regenerating outline…</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 text-purple-500" />
                    <span>Regenerate outline with AI</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={!canProceedToSources || isGeneratingStructure || buildRunning || !hasOutline(localStructure)}
                onClick={handleProceedToSources}
                title={hasOutline(localStructure) ? "Approves this thesis and outline; you can still change them later" : "Your outline comes first"}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 active:scale-[0.99] font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Approve outline &amp; continue to Sources</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Export alias for lazy-loading requirement
export { AssignmentUnderstandStage as AssignmentForm };
