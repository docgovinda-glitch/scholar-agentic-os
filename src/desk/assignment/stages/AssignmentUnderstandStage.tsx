import React, { useState, useRef, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch, authedFetch } from "../../api";
import {
  type AcademicLevel,
  type AssignmentType,
  type AssignmentAnalysis,
  type SectionBudgetItem,
  type WritingToneConfig,
  ASSIGNMENT_TYPE_LABELS,
  cleanAnswerString,
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
} from "lucide-react";
import type { SectionBreakdown } from "../../../components/forms/TargetWordCountInput";
import SectionBudgetPlanner from "../components/SectionBudgetPlanner";
import WritingToneSelector from "../components/WritingToneSelector";

const CITATION_STYLES = [
  { id: "apa7", name: "APA 7th Edition (Author, Year)" },
  { id: "harvard", name: "Harvard Referencing (Author, Year)" },
  { id: "mla9", name: "MLA 9th Edition (Author, Page)" },
  { id: "chicago", name: "Chicago Manual of Style (Notes & Bibliography)" },
  { id: "ieee", name: "IEEE (Numbered [1])" },
  { id: "vancouver", name: "Vancouver (Numbered in-text)" },
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
    sections,
    assignmentBriefText,
    writingTone,
    setWritingTone,
    sectionBudgets,
    saveAnswers,
    analysis,
    setAnalysis,
    advancePhase,
    setPhase,
    advanceStage,
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

  const [localQuestion, setLocalQuestion] = useState(cleanAnswerString(question));
  const [localLevel, setLocalLevel] = useState<AcademicLevel>(academicLevel || "undergraduate");
  const [localType, setLocalType] = useState<AssignmentType>(assignmentType || "essay");
  const [localWordCount, setLocalWordCount] = useState<number>(targetWordCount || 2000);
  const [localSections, setLocalSections] = useState<SectionBreakdown | undefined>(sections);
  const [localCitation, setLocalCitation] = useState<string>(citationStyle || "apa7");
  const [localBrief, setLocalBrief] = useState(
    cleanAnswerString(assignmentBriefText) || cleanAnswerString(question)
  );

  // Dynamic Section Budgets state (defaults: 10% Intro / 80% Body / 10% Conclusion)
  const [localSectionBudgets, setLocalSectionBudgets] = useState<SectionBudgetItem[]>(() => {
    if (sectionBudgets && sectionBudgets.length > 0) return sectionBudgets;
    const total = targetWordCount > 0 ? targetWordCount : 2000;
    const intro = Math.round(total * 0.10);
    const conclusion = Math.round(total * 0.10);
    const body = Math.max(0, total - intro - conclusion);
    return [
      { id: "intro", title: "Introduction", targetWordCount: intro, isCustom: false },
      { id: "body", title: "Body Paragraphs", targetWordCount: body, isCustom: false },
      { id: "conclusion", title: "Conclusion", targetWordCount: conclusion, isCustom: false },
    ];
  });

  // Writing Tone state
  const [localTone, setLocalTone] = useState<WritingToneConfig>(
    writingTone || { preset: "scholarly_rigorous" }
  );

  const [course, setCourse] = useState(courseName);
  const [institution, setInstitution] = useState(institutionName);
  const [deadline, setDeadline] = useState(deadlineDate);
  const [rubricText, setRubricText] = useState(markingRubricText);
  const [showAdditional, setShowAdditional] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingBrief, setUploadingBrief] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

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
    const body =
      otherSections.length > 0
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
      if (!prev || prev.trim().toLowerCase() === "provisional") {
        return currentInstructions;
      }
      return prev;
    });
    if (academicLevel) setLocalLevel(academicLevel);
    if (assignmentType) setLocalType(assignmentType);
    if (targetWordCount > 0) setLocalWordCount(targetWordCount);
    if (citationStyle) setLocalCitation(citationStyle);
    if (sections) setLocalSections(sections);
    if (writingTone) setLocalTone(writingTone);
    if (sectionBudgets && sectionBudgets.length > 0) {
      setLocalSectionBudgets(sectionBudgets);
    }
    const cleanedBrief = cleanAnswerString(assignmentBriefText);
    if (cleanedBrief) {
      setLocalBrief(cleanedBrief);
    } else if (currentInstructions) {
      setLocalBrief(currentInstructions);
    }
    if (courseName) setCourse(courseName);
    if (institutionName) setInstitution(institutionName);
    if (deadlineDate) setDeadline(deadlineDate);
    if (markingRubricText) setRubricText(markingRubricText);
  }, [
    isLoading,
    question,
    academicLevel,
    assignmentType,
    targetWordCount,
    citationStyle,
    sections,
    writingTone,
    sectionBudgets,
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

  // Autosave / onBlur debouncing to commit changes directly to PostgreSQL / JSONB storage
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

      const budget = computeWordBudgetFromSections(localWordCount, localSectionBudgets);
      const legacyBreakdown = computeSectionBreakdown(localWordCount, localSectionBudgets);

      const updates: Record<string, any> = {
        rawPrompt: trimmed,
        raw_prompt: trimmed,
        instructions: trimmed,
        assignment_question: trimmed,
        assignment_brief_text: trimmed,
        research_topic: trimmed,
        assignment_brief: trimmed,
        wordBudget: budget,
        word_budget: budget,
        sectionBudgets: localSectionBudgets,
        section_budgets: localSectionBudgets,
        sections: legacyBreakdown,
        writingTone: localTone,
        writing_tone: localTone,
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
    setLocalWordCount(newCount);
    // If not customized, adjust standard sections proportionally (10/80/10)
    const hasCustom = localSectionBudgets.some((s) => s.isCustom);
    let updatedSections = localSectionBudgets;
    if (!hasCustom) {
      const intro = Math.round(newCount * 0.10);
      const conclusion = Math.round(newCount * 0.10);
      const body = Math.max(0, newCount - intro - conclusion);
      updatedSections = [
        { id: "intro", title: "Introduction", targetWordCount: intro, isCustom: false },
        { id: "body", title: "Body Paragraphs", targetWordCount: body, isCustom: false },
        { id: "conclusion", title: "Conclusion", targetWordCount: conclusion, isCustom: false },
      ];
      setLocalSectionBudgets(updatedSections);
    }
    const budget = computeWordBudgetFromSections(newCount, updatedSections);
    const legacyBreakdown = computeSectionBreakdown(newCount, updatedSections);
    setLocalSections(legacyBreakdown);

    saveAnswers({
      targetWordCount: newCount,
      target_word_count: newCount,
      word_count: newCount,
      word_limit: newCount,
      sectionBudgets: updatedSections,
      section_budgets: updatedSections,
      sections: legacyBreakdown,
      wordBudget: budget,
      word_budget: budget,
    });
  };

  const handleSectionBudgetsChange = (newSections: SectionBudgetItem[]) => {
    setLocalSectionBudgets(newSections);
    const budget = computeWordBudgetFromSections(localWordCount, newSections);
    const legacyBreakdown = computeSectionBreakdown(localWordCount, newSections);
    setLocalSections(legacyBreakdown);

    saveAnswers({
      sectionBudgets: newSections,
      section_budgets: newSections,
      sections: legacyBreakdown,
      wordBudget: budget,
      word_budget: budget,
    });
  };

  const handleToneChange = (newTone: WritingToneConfig) => {
    setLocalTone(newTone);
    setWritingTone(newTone);
  };

  const handleLevelChange = (lvl: AcademicLevel) => {
    setLocalLevel(lvl);
    saveAnswers({ academicLevel: lvl, academic_level: lvl });
  };

  const handleTypeChange = (t: AssignmentType) => {
    setLocalType(t);
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

  const canProceedToSources =
    localQuestion.trim().length > 0 &&
    localWordCount > 0 &&
    Boolean(localCitation && localCitation.trim().length > 0);

  const handleProceedToSources = async () => {
    if (!canProceedToSources) return;
    const trimmed = cleanAnswerString(localQuestion);
    const budget = computeWordBudgetFromSections(localWordCount, localSectionBudgets);
    const legacyBreakdown = computeSectionBreakdown(localWordCount, localSectionBudgets);
    const parsedCriteria = parseRubricCriteria(rubricText);

    await saveAnswers({
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
      wordBudget: budget,
      word_budget: budget,
      sectionBudgets: localSectionBudgets,
      section_budgets: localSectionBudgets,
      sections: legacyBreakdown,
      writingTone: localTone,
      writing_tone: localTone,
      citation_style: localCitation,
      citationStyle: localCitation,
      rubricCriteria: parsedCriteria,
      rubric_criteria: parsedCriteria,
      marking_rubric: rubricText,
      rubric: rubricText,
      course_name: course,
      institution,
      deadline,
    });

    if (advancePhase) {
      advancePhase("sources");
    } else if (setPhase) {
      setPhase("sources");
    } else {
      advanceStage("sources");
    }
  };

  const canAnalyze =
    localQuestion.trim().length >= 10 &&
    localWordCount > 0 &&
    Boolean(localCitation) &&
    Boolean(localLevel) &&
    Boolean(localType);

  const handleAnalyze = async () => {
    if (!canAnalyze || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    const budget = computeWordBudgetFromSections(localWordCount, localSectionBudgets);
    const legacyBreakdown = computeSectionBreakdown(localWordCount, localSectionBudgets);

    // Save intake details first
    await saveAnswers({
      instructions: localQuestion,
      research_topic: localQuestion,
      assignment_question: localQuestion,
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
      sectionBudgets: localSectionBudgets,
      section_budgets: localSectionBudgets,
      wordBudget: budget,
      word_budget: budget,
      sections: legacyBreakdown,
      writingTone: localTone,
      writing_tone: localTone,
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
    });

    try {
      const targetProjectId = await ensurePersisted();
      const response = await authedJsonFetch(
        `/api/projects/${targetProjectId}/assignment/analyze`,
        "POST",
        {
          question: localQuestion,
          assignmentType: localType,
          academicLevel: localLevel,
          targetWordCount: localWordCount,
          citationStyle: localCitation,
          briefText: localBrief,
          rubricText,
          sections: legacyBreakdown,
          writingTone: localTone,
        }
      );

      if (response && response.ok) {
        const data = await response.json();
        if (data.analysis) {
          await setAnalysis(data.analysis);
          return;
        }
        await setAnalysis(data);
        return;
      }
      throw new Error("Server analysis unavailable");
    } catch (err: any) {
      console.warn("Using resilient brief analyzer:", err);
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

      const fallbackAnalysis: AssignmentAnalysis = {
        commandVerbs: detectedVerbs,
        summary: `Rigorous academic breakdown of assignment prompt: ${localQuestion.slice(0, 120)}`,
        keyConcepts: [
          "Theoretical Frameworks & Foundational Literature",
          "Empirical Context & Practical Applications",
          "Methodological or Evaluative Rigor",
        ],
        scopeBoundaries: {
          included: ["Direct addressing of assignment prompt", "Scholarly evidence and critical literature grounding"],
          excluded: ["Unsubstantiated assertion", "Out-of-scope tangents"],
        },
        expectedResponseType: localType,
        evidenceRequirements: `High-quality peer-reviewed scholarly citations adhering to ${localCitation.toUpperCase()}.`,
        markingCriteriaInsights: rubricText
          ? ["Custom module grading rubric criteria indexed and integrated."]
          : ["Rigorous argument structure, critical analysis, and authentic academic evidence."],
        wordCountImplications: `Target allocation of ${localWordCount} words across planned sections.`,
        citationGuidance: `Format all in-text citations and bibliography according to ${localCitation.toUpperCase()} conventions.`,
        academicLevelNotes: `Calibrated for ${localLevel} academic standards. Demands sustained analytical depth and critical synthesis.`,
        approvedByUser: false,
      };

      await setAnalysis(fallbackAnalysis);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApproveAnalysis = async () => {
    if (!analysis) return;
    const updated: AssignmentAnalysis = {
      ...analysis,
      approvedByUser: true,
    };
    await setAnalysis(updated);
    await handleProceedToSources();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBrief(true);
    setAnalysisError(null);
    setUploadedFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const targetProjectId = await ensurePersisted();
      const res = await authedFetch(`/api/projects/${targetProjectId}/assignment/parse-brief`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to parse brief file");
      const data = await res.json();
      const extractedText = data.text || "";
      if (extractedText) {
        setLocalQuestion(extractedText);
        setLocalBrief(extractedText);
        const updates: Record<string, any> = {
          instructions: extractedText,
          assignment_question: extractedText,
          assignment_brief_text: extractedText,
          research_topic: extractedText,
          assignment_brief: extractedText,
        };
        if (data.detectedWordCount && data.detectedWordCount >= 200) {
          setLocalWordCount(data.detectedWordCount);
          updates.word_count = data.detectedWordCount;
          updates.word_limit = data.detectedWordCount;
          updates.targetWordCount = data.detectedWordCount;
          updates.target_word_count = data.detectedWordCount;
        }
        if (data.detectedLevel) {
          setLocalLevel(data.detectedLevel);
          updates.academic_level = data.detectedLevel;
          updates.academicLevel = data.detectedLevel;
        }
        if (data.detectedCitation) {
          setLocalCitation(data.detectedCitation);
          updates.citation_style = data.detectedCitation;
          updates.citationStyle = data.detectedCitation;
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

          if (isDefaultOrUntitled && extractedText.length >= 10) {
            const derived = deriveHeuristicTitle(extractedText);
            if (derived && derived !== "Academic Assignment") {
              updates.title = derived;
              updates.assignment_title = derived;
            }
          }
        }
        await saveAnswers(updates);
      }
    } catch (err: any) {
      setAnalysisError(err.message || "Failed to parse brief file");
    } finally {
      setUploadingBrief(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 space-y-8 text-neutral-900 dark:text-neutral-100 font-sans">
      {/* Clean Decluttered Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200">
            Phase 1 • Understand
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          <span className="sr-only">Phase 1: Understand the Assignment</span>
          Understand Your Brief
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1.5 leading-relaxed">
          Define the assignment question, target word allocation, academic writing tone, and rubric criteria.
        </p>
      </div>

      {/* Main Intake Canvas Card */}
      <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-neutral-200/70 dark:border-white/10 p-6 sm:p-8 shadow-xs space-y-7">
        {/* Streamlined Assessment Brief Intake: Dual-Tab Card */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 w-fit">
              <button
                type="button"
                onClick={() => setIntakeTab("paste")}
                className={`py-1.5 px-3.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  intakeTab === "paste"
                    ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                Paste Prompt
              </button>
              <button
                type="button"
                onClick={() => setIntakeTab("upload")}
                className={`py-1.5 px-3.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  intakeTab === "upload"
                    ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <Upload className="w-3 h-3" />
                <span>Upload Brief Document (.pdf, .docx)</span>
              </button>
            </div>

            {uploadedFileName && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                <FileText className="w-3.5 h-3.5" />
                <span>Loaded: {uploadedFileName}</span>
              </span>
            )}
          </div>

          {intakeTab === "paste" ? (
            <textarea
              value={localQuestion}
              onChange={(e) => setLocalQuestion(e.target.value)}
              onBlur={handleQuestionBlur}
              rows={5}
              placeholder="Paste your assignment prompt, essay title, or question here..."
              className="w-full bg-neutral-50/70 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-xl p-4 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 dark:focus:ring-white/15 focus:border-neutral-400 dark:focus:border-white/20 transition-all leading-relaxed resize-y"
            />
          ) : (
            <div className="border border-dashed border-neutral-300 dark:border-white/15 rounded-xl p-6 bg-neutral-50/50 dark:bg-white/[0.02] flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Upload your assignment brief or module handbook
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Supports PDF, DOCX, DOC, or TXT
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
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

        {/* Compact Single Row: Academic Level, Assignment Type & Citation Style */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-neutral-50/60 dark:bg-white/[0.02] border border-neutral-200/70 dark:border-white/10">
          {/* Academic Level */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
              <span>Academic Level</span>
              <span className="text-rose-500 text-xs">*</span>
            </label>
            <div className="flex p-0.5 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10">
              <button
                type="button"
                onClick={() => handleLevelChange("undergraduate")}
                className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer text-center ${
                  localLevel === "undergraduate"
                    ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                Undergraduate
              </button>
              <button
                type="button"
                onClick={() => handleLevelChange("postgraduate")}
                className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer text-center ${
                  localLevel === "postgraduate"
                    ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                Postgraduate / Masters
              </button>
            </div>
          </div>

          {/* Assignment Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
              <span>Assignment Type</span>
              <span className="text-rose-500 text-xs">*</span>
            </label>
            <div className="relative">
              <select
                value={localType}
                onChange={(e) => handleTypeChange(e.target.value as AssignmentType)}
                className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all appearance-none cursor-pointer pr-8 font-medium"
              >
                {Object.entries(ASSIGNMENT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-neutral-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Citation Style */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
              <span>Citation Style</span>
              <span className="text-rose-500 text-xs">*</span>
            </label>
            <div className="relative">
              <select
                value={localCitation}
                onChange={(e) => handleCitationChange(e.target.value)}
                className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all appearance-none cursor-pointer pr-8 font-medium"
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
        </div>

        {/* Word Budget with Custom Sections Adder */}
        <div className="pt-1">
          <SectionBudgetPlanner
            targetWordCount={localWordCount}
            onTargetWordCountChange={handleTargetWordCountChange}
            sections={localSectionBudgets}
            onSectionsChange={handleSectionBudgetsChange}
          />
        </div>

        {/* Academic Writing Tone & Style Selector */}
        <div className="pt-2 border-t border-neutral-200/60 dark:border-white/5">
          <WritingToneSelector
            value={localTone}
            onChange={handleToneChange}
          />
        </div>

        {/* Collapsible Accordion: Additional Course Details & Rubric */}
        <div className="pt-1 border-t border-neutral-200/60 dark:border-white/5">
          <button
            type="button"
            onClick={() => setShowAdditional(!showAdditional)}
            className="text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer py-1"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdditional ? "rotate-180" : ""}`} />
            <span>{showAdditional ? "Hide additional course details & grading rubric" : "+ Additional Course Details & Rubric (Optional)"}</span>
          </button>

          {showAdditional && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-xl border border-neutral-200/60 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] animate-in fade-in duration-150">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Course / Module Code</label>
                <input
                  type="text"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  onBlur={handleCourseDetailsBlur}
                  placeholder="e.g. POLI3002 International Security"
                  className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3.5 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">University / Institution</label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  onBlur={handleCourseDetailsBlur}
                  placeholder="e.g. University of Edinburgh"
                  className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3.5 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  onBlur={handleCourseDetailsBlur}
                  className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3.5 py-2 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                />
              </div>
              <div className="md:col-span-3 space-y-1.5 pt-1">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Marking Rubric / Assessment Criteria</label>
                <textarea
                  value={rubricText}
                  onChange={(e) => setRubricText(e.target.value)}
                  onBlur={handleCourseDetailsBlur}
                  rows={3}
                  placeholder="Paste marking criteria or grade band descriptions to index..."
                  className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg p-3 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button Bar */}
        <div className="pt-4 border-t border-neutral-100 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          {!canProceedToSources ? (
            <p className="text-xs text-rose-500 dark:text-rose-400 font-medium">
              Please provide the assignment question, word count, and citation style to continue.
            </p>
          ) : <div />}

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              disabled={!canAnalyze || isAnalyzing}
              onClick={handleAnalyze}
              className="w-full sm:w-auto px-6 py-2.5 rounded-full border border-neutral-300 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Analyzing Assignment Brief…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-neutral-500" />
                  <span>{analysis ? "Re-Analyze Assignment Brief" : "Analyze Assignment Brief"}</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={!canProceedToSources || isAnalyzing}
              onClick={handleProceedToSources}
              className="w-full sm:w-auto px-7 py-2.5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Proceed to Sources</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {analysisError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{analysisError}</span>
          </div>
        )}
      </div>

      {/* Analysis Breakdown Results */}
      {analysis && (
        <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-neutral-200/70 dark:border-white/10 p-6 sm:p-8 shadow-xs space-y-7 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white tracking-tight">
                Assignment Analysis Breakdown
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Target expectations, command verbs, and academic scope boundaries unpacked by the Socratic Agent.
              </p>
            </div>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              ✓ Analysis Ready{analysis.briefLedger && analysis.briefLedger.length > 0 ? ` · ${analysis.briefLedger.length} Rules Indexed` : ""}
            </span>
          </div>

          {/* Command Verbs & Examiner Demands */}
          {analysis.commandVerbs && analysis.commandVerbs.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Command Verbs & Examiner Demands
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.commandVerbs.map((cv, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-neutral-200/60 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-neutral-200/80 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold text-xs">
                        {cv.verb}
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 italic">{cv.meaning}</span>
                    </div>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed pt-1">
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">Requirement:</span> {cv.academicExpectation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scope Boundaries: Included vs Excluded */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2.5">
              <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                ✓ What Must Be Researched & Included
              </h4>
              <ul className="text-xs text-neutral-700 dark:text-neutral-300 space-y-1.5 list-disc list-inside leading-relaxed">
                {analysis.scopeBoundaries?.included?.map((inc, i) => (
                  <li key={i}>{inc}</li>
                ))}
              </ul>
            </div>

            <div className="p-5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2.5">
              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                ✕ Out of Scope (Do Not Waste Word Budget On)
              </h4>
              <ul className="text-xs text-neutral-700 dark:text-neutral-300 space-y-1.5 list-disc list-inside leading-relaxed">
                {analysis.scopeBoundaries?.excluded?.map((exc, i) => (
                  <li key={i}>{exc}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Summary & Core Specifications */}
          <div className="p-5 rounded-xl border border-neutral-200/60 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] space-y-3">
            <div>
              <span className="text-xs uppercase font-semibold text-neutral-500 dark:text-neutral-400 block tracking-wider">
                Summary & Expected Response
              </span>
              <p className="text-xs text-neutral-800 dark:text-neutral-200 mt-1 leading-relaxed">
                {analysis.summary}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-neutral-200/60 dark:border-white/5">
              <div>
                <span className="text-[11px] uppercase font-semibold text-neutral-400 block tracking-wider">Evidence Requirements</span>
                <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1">{analysis.evidenceRequirements}</p>
              </div>
              <div>
                <span className="text-[11px] uppercase font-semibold text-neutral-400 block tracking-wider">Word Budget Guidance</span>
                <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1">{analysis.wordCountImplications}</p>
              </div>
              <div>
                <span className="text-[11px] uppercase font-semibold text-neutral-400 block tracking-wider">Referencing Style</span>
                <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1">{analysis.citationGuidance}</p>
              </div>
            </div>
          </div>

          {/* Rubric Insights & Penalty Clauses */}
          {analysis.markingCriteriaInsights && analysis.markingCriteriaInsights.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                Marking Rubric Insights & Assessment Standards
              </h3>
              <div className="space-y-2">
                {analysis.markingCriteriaInsights.map((insight, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                      insight.includes("🚨") || insight.toLowerCase().includes("penalty")
                        ? "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300 font-medium"
                        : "border-neutral-200/60 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] text-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {insight}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student Approval & Confirmation Banner */}
          <div className="pt-4 border-t border-neutral-100 dark:border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Is my understanding of the assignment correct?
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Approve to lock this understanding and proceed to source discovery.
              </p>
            </div>
            <button
              type="button"
              onClick={handleApproveAnalysis}
              className="w-full sm:w-auto px-7 py-3 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] text-xs font-semibold transition-all cursor-pointer shadow-xs shrink-0 flex items-center justify-center gap-2"
            >
              ✓ Approve & Continue to Sources →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export alias for lazy-loading requirement
export { AssignmentUnderstandStage as AssignmentForm };
