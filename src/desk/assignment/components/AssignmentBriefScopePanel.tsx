import React, { useState, useRef } from "react";
import {
  type AcademicLevel,
  type AssignmentType,
  ASSIGNMENT_TYPE_LABELS,
  CITATION_STYLES,
  cleanAnswerString,
  type AssignmentAnalysis,
} from "../types";
import { authedFetch, authedJsonFetch } from "../../api";
import {
  FileText,
  Upload,
  Sparkles,
  Edit3,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Scale,
  GraduationCap,
  BookOpen,
  Target,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

export interface AssignmentBriefScopePanelProps {
  projectId: string;
  question: string;
  academicLevel: AcademicLevel;
  assignmentType: AssignmentType;
  citationStyle: string;
  targetWordCount: number;
  assignmentBriefText?: string;
  analysis?: AssignmentAnalysis | null;
  onUpdateQuestion: (newQuestion: string) => Promise<void>;
  onUpdateAcademicLevel: (level: AcademicLevel) => Promise<void>;
  onUpdateAssignmentType: (type: AssignmentType) => Promise<void>;
  onUpdateCitationStyle: (style: string) => Promise<void>;
  onUpdateWordCount: (count: number) => Promise<void>;
  onRefreshLiterature?: () => void;
  ensurePersisted: () => Promise<string>;
}

export const AssignmentBriefScopePanel: React.FC<AssignmentBriefScopePanelProps> = ({
  projectId,
  question,
  academicLevel,
  assignmentType,
  citationStyle,
  targetWordCount,
  assignmentBriefText,
  analysis,
  onUpdateQuestion,
  onUpdateAcademicLevel,
  onUpdateAssignmentType,
  onUpdateCitationStyle,
  onUpdateWordCount,
  onRefreshLiterature,
  ensurePersisted,
}) => {
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(cleanAnswerString(question));
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [showRubricModal, setShowRubricModal] = useState(false);
  const [isUploadingBrief, setIsUploadingBrief] = useState(false);
  const [briefUploadSuccess, setBriefUploadSuccess] = useState<string | null>(null);
  const [isEditingWordCount, setIsEditingWordCount] = useState(false);
  const [wordCountVal, setWordCountVal] = useState(targetWordCount || 2000);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const briefFileInputRef = useRef<HTMLInputElement>(null);

  const handleSavePrompt = async () => {
    const trimmed = promptText.trim();
    if (!trimmed || trimmed === question) {
      setIsEditingPrompt(false);
      return;
    }
    setIsSavingPrompt(true);
    try {
      await onUpdateQuestion(trimmed);
      setIsEditingPrompt(false);
      if (onRefreshLiterature) {
        onRefreshLiterature();
      }
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleSaveWordCount = async () => {
    const num = Math.max(200, Math.min(50000, Number(wordCountVal) || 2000));
    await onUpdateWordCount(num);
    setIsEditingWordCount(false);
  };

  const handleBriefFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingBrief(true);
    setBriefUploadSuccess(null);

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
        setPromptText(extractedText);
        await onUpdateQuestion(extractedText);
      }
      if (data.detectedWordCount && data.detectedWordCount >= 200) {
        await onUpdateWordCount(data.detectedWordCount);
        setWordCountVal(data.detectedWordCount);
      }
      if (data.detectedLevel) {
        await onUpdateAcademicLevel(data.detectedLevel);
      }
      if (data.detectedCitation) {
        await onUpdateCitationStyle(data.detectedCitation);
      }
      setBriefUploadSuccess(`Parsed brief: "${file.name}" updated assignment parameters.`);
      if (onRefreshLiterature) {
        onRefreshLiterature();
      }
      setTimeout(() => setBriefUploadSuccess(null), 5000);
    } catch (err: any) {
      console.error("Failed to upload brief in Phase 2:", err);
    } finally {
      setIsUploadingBrief(false);
      if (briefFileInputRef.current) briefFileInputRef.current.value = "";
    }
  };

  const handleReanalyzeBrief = async () => {
    setIsReanalyzing(true);
    try {
      const targetProjectId = await ensurePersisted();
      await authedJsonFetch(`/api/projects/${targetProjectId}/assignment/analyze`, "POST", {
        question,
        assignmentType,
        academicLevel,
        targetWordCount,
        citationStyle,
        briefText: assignmentBriefText || question,
      });
    } catch (err) {
      console.error("Failed to re-analyze brief:", err);
    } finally {
      setIsReanalyzing(false);
    }
  };

  const introWords = Math.round((targetWordCount || 2000) * 0.1);
  const conclWords = Math.round((targetWordCount || 2000) * 0.15);
  const bodyWords = Math.max(0, (targetWordCount || 2000) - introWords - conclWords);

  return (
    <div className="rounded-2xl bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs p-4 sm:p-5 space-y-4">
      {/* Hidden File Input for Brief Upload */}
      <input
        ref={briefFileInputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        aria-label="Upload assignment brief document"
        className="hidden"
        onChange={handleBriefFileUpload}
      />

      {/* Row 1: Header with Title, Prompt, and Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Assignment Research Prompt</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
              Calibrating Literature
            </span>
          </div>

          {!isEditingPrompt ? (
            <div className="group relative">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white leading-relaxed pr-6">
                {question || "No prompt specified. Click Edit Prompt to provide your assignment question."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setPromptText(question);
                  setIsEditingPrompt(true);
                }}
                title="Edit assignment prompt"
                aria-label="Edit assignment prompt"
                className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                <span>Refine question</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 pt-1 animate-in fade-in duration-150">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Enter or paste your assignment prompt, research question, or brief instructions..."
                rows={3}
                aria-label="Edit assignment instructions"
                className="w-full p-2.5 text-xs rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-300 dark:border-white/20 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditingPrompt(false)}
                  className="px-3 py-1 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePrompt}
                  disabled={isSavingPrompt || !promptText.trim()}
                  className="px-3.5 py-1 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <Check className="w-3 h-3" />
                  <span>Update & Re-curate</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons: Upload Brief & View Rubric Guidance */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => briefFileInputRef.current?.click()}
            disabled={isUploadingBrief}
            title="Upload assignment brief (.pdf, .docx) to auto-extract parameters"
            aria-label="Upload Brief"
            className="px-3 py-1.5 rounded-xl text-xs font-medium border border-neutral-200 dark:border-white/10 bg-neutral-50 hover:bg-neutral-100 dark:bg-white/5 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Upload className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
            <span>{isUploadingBrief ? "Parsing Brief..." : "Upload Brief (.pdf, .docx)"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRubricModal(true)}
            aria-label="Rubric & Command Verbs Guidance"
            className="px-3 py-1.5 rounded-xl text-xs font-medium border border-blue-200 dark:border-blue-900/40 bg-blue-50/70 hover:bg-blue-100/70 dark:bg-blue-950/30 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Scale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Rubric & Command Verbs</span>
          </button>
        </div>
      </div>

      {briefUploadSuccess && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
            <span>{briefUploadSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setBriefUploadSuccess(null)}
            className="text-emerald-600 hover:opacity-75 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Row 2: Research Calibration Parameters (Academic Level, Type, Citation, Word Count) */}
      <div className="pt-2 border-t border-neutral-100 dark:border-white/5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {/* Param 1: Academic Level */}
        <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 font-semibold">
            <span className="flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-neutral-400" />
              <span>Academic Level</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 bg-neutral-200/60 dark:bg-white/10 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => onUpdateAcademicLevel("undergraduate")}
              className={`py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                academicLevel === "undergraduate"
                  ? "bg-white dark:bg-ink-500 text-neutral-900 dark:text-white shadow-2xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              Undergrad
            </button>
            <button
              type="button"
              onClick={() => onUpdateAcademicLevel("postgraduate")}
              className={`py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                academicLevel === "postgraduate"
                  ? "bg-white dark:bg-ink-500 text-neutral-900 dark:text-white shadow-2xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900"
              }`}
            >
              Postgrad / Masters
            </button>
          </div>
        </div>

        {/* Param 2: Assignment Type */}
        <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-1">
          <label className="text-[11px] text-neutral-500 dark:text-neutral-400 font-semibold flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-neutral-400" />
            <span>Assignment Type</span>
          </label>
          <select
            value={assignmentType}
            onChange={(e) => onUpdateAssignmentType(e.target.value as AssignmentType)}
            aria-label="Select assignment type"
            className="w-full py-1 px-2 text-xs rounded-lg bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
          >
            {Object.entries(ASSIGNMENT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Param 3: Citation Style */}
        <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-1">
          <label className="text-[11px] text-neutral-500 dark:text-neutral-400 font-semibold flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
            <span>Citation Style</span>
          </label>
          <select
            value={citationStyle}
            onChange={(e) => onUpdateCitationStyle(e.target.value)}
            aria-label="Select citation style"
            className="w-full py-1 px-2 text-xs rounded-lg bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white outline-none cursor-pointer"
          >
            {CITATION_STYLES.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.name}
              </option>
            ))}
          </select>
        </div>

        {/* Param 4: Target Word Count & Breakdown */}
        <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 font-semibold">
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-neutral-400" />
              <span>Target Budget</span>
            </span>
            <button
              type="button"
              onClick={() => setIsEditingWordCount(!isEditingWordCount)}
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {isEditingWordCount ? "Done" : "Edit"}
            </button>
          </div>

          {!isEditingWordCount ? (
            <div>
              <div className="text-xs font-bold text-neutral-900 dark:text-white font-mono">
                {targetWordCount.toLocaleString()} words
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                Intro ~{introWords}w · Body ~{bodyWords}w · Concl ~{conclWords}w
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 pt-0.5">
              <input
                type="number"
                value={wordCountVal}
                onChange={(e) => setWordCountVal(Number(e.target.value))}
                min={200}
                max={50000}
                step={100}
                className="w-20 px-2 py-0.5 rounded border border-neutral-300 dark:border-white/20 text-xs font-mono bg-white dark:bg-ink-750 text-neutral-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleSaveWordCount}
                className="px-2 py-0.5 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[10px] font-semibold cursor-pointer"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rubric Guidance & Command Verbs Modal Drawer */}
      {showRubricModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-200/80 dark:border-white/10 pb-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    Phase 1 Advisor Guidance
                  </span>
                </div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  Rubric Criteria & Command Verbs Analysis
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRubricModal(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section 1: Detected Command Verbs */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Prompt Command Verbs & Academic Actions
              </h4>
              <div className="space-y-2">
                {analysis?.commandVerbs && analysis.commandVerbs.length > 0 ? (
                  analysis.commandVerbs.map((cv, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-1 text-xs"
                    >
                      <div className="font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-mono text-[11px]">
                          {cv.verb}
                        </span>
                        <span className="text-neutral-600 dark:text-neutral-400">{cv.meaning}</span>
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pl-1 border-l-2 border-blue-500">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">Expected Execution: </span>
                        {cv.academicExpectation}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 text-xs text-neutral-600 dark:text-neutral-400">
                    <span className="font-semibold text-neutral-900 dark:text-white">Examine & Critically Evaluate: </span>
                    Break down core institutional mechanisms, weigh empirical effectiveness against structural limitations, and synthesize counterarguments.
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Scope Boundaries */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Scope & Analytical Boundaries
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/30 space-y-1.5">
                  <div className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Included Focus</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-emerald-900 dark:text-emerald-200 list-disc list-inside">
                    <li>Systematic definition of key concepts & theoretical frameworks</li>
                    <li>Dialectical comparison of institutional strengths vs limitations</li>
                    <li>Verified empirical citations formatted in {citationStyle.toUpperCase()}</li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/30 space-y-1.5">
                  <div className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Excluded from Scope</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-amber-900 dark:text-amber-200 list-disc list-inside">
                    <li>Unsubstantiated personal opinion lacking academic provenance</li>
                    <li>Excessive historical narrative without analytical contribution</li>
                    <li>Peripheral case studies that do not address the prompt</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-neutral-200/80 dark:border-white/10">
              <button
                type="button"
                onClick={handleReanalyzeBrief}
                disabled={isReanalyzing}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isReanalyzing ? "animate-spin" : ""}`} />
                <span>{isReanalyzing ? "Re-analyzing Brief..." : "Re-analyze with AI"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRubricModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 cursor-pointer"
              >
                Close Guidance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
