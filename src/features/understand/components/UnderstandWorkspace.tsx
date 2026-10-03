import React, { useState, useMemo } from "react";
import { BriefUploadCard } from "./BriefUploadCard";
import { classifyScopeBoundaries, type ScopeBoundaries } from "../services/scopeClassifier";
import { sanitizeBrief } from "../services/briefSanitizer";
import { CheckCircle2, ChevronDown, Sparkles, AlertCircle, FileText, Check } from "lucide-react";

export interface UnderstandWorkspaceProps {
  initialQuestion?: string;
  initialBriefText?: string;
  initialTone?: string;
  onProceed?: (data: {
    question: string;
    briefText: string;
    tone: string;
    scope: ScopeBoundaries;
  }) => void;
  className?: string;
}

export const WRITING_TONE_OPTIONS = [
  { id: "formal_academic", label: "Formal Academic" },
  { id: "analytical", label: "Analytical" },
  { id: "persuasive", label: "Persuasive" },
  { id: "critical", label: "Critical" },
  { id: "conversational_academic", label: "Conversational Academic" },
];

/**
 * UnderstandWorkspace Component
 * ----------------------------
 * Clean, streamlined Step 01 workspace:
 * - Single Writing Tone dropdown (duplicate nested tone picker removed).
 * - 8-card breakdown grid removed in favor of a clean, single-sentence scope banner.
 * - Plain-English Green & Orange research scope cards without internal line markers.
 */
export const UnderstandWorkspace: React.FC<UnderstandWorkspaceProps> = ({
  initialQuestion = "",
  initialBriefText = "",
  initialTone = "analytical",
  onProceed,
  className = "",
}) => {
  const [briefText, setBriefText] = useState(initialBriefText);
  const [question, setQuestion] = useState(initialQuestion);
  const [writingTone, setWritingTone] = useState(initialTone);
  const [uploadedFileName, setUploadedFileName] = useState<string | undefined>();
  const [showCourseDetails, setShowCourseDetails] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  const [institution, setInstitution] = useState("");

  const scopeBoundaries = useMemo<ScopeBoundaries>(() => {
    return classifyScopeBoundaries(briefText, question ? [question] : []);
  }, [briefText, question]);

  const handleBriefFileUpload = async (file: File) => {
    setUploadedFileName(file.name);
    const text = await file.text();
    const sanitized = sanitizeBrief(text);

    setBriefText(sanitized.sanitizedText);
    if (sanitized.questions.length > 0) {
      setQuestion(sanitized.questions.join("\n\n"));
    }
  };

  return (
    <div
      data-testid="understand-workspace"
      className={`max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 text-neutral-900 dark:text-neutral-100 ${className}`}
    >
      {/* Step Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
            Phase 01 · Understand Brief & Scope
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Deconstruct Brief & Scoping Requirements
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
          Upload your assignment handbook or lecture slides to automatically extract questions and calibrated academic scope.
        </p>
      </div>

      {/* Upload Card */}
      <BriefUploadCard
        onFileSelect={handleBriefFileUpload}
        uploadedFileName={uploadedFileName}
      />

      {/* Scope Banner (Replaces redundant 8-card matrix) */}
      <div
        data-testid="scope-summary-banner"
        className="p-4 rounded-xl border border-blue-500/20 bg-blue-50/50 dark:bg-blue-950/10 flex items-center justify-between gap-3 shadow-2xs"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-semibold text-neutral-900 dark:text-white block">
              {scopeBoundaries.summaryBanner}
            </span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Filtered pedagogical logistics and established core assessment boundaries.
            </span>
          </div>
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
          Calibrated
        </span>
      </div>

      {/* Primary Academic Parameters Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Primary Writing Configuration
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Writing Tone * (Single canonical dropdown) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              <span>Writing Tone</span>
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <select
              value={writingTone}
              onChange={(e) => setWritingTone(e.target.value)}
              aria-label="Writing Tone"
              className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {WRITING_TONE_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Assignment Question / Prompt */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              <span>Extracted Core Questions</span>
            </label>
            <textarea
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Core research inquiry questions will appear here..."
              className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 rounded-xl p-3 text-xs leading-relaxed text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Collapsible Accordion: Course & Institution Details (Redundant tone picker deleted) */}
        <div className="pt-2 border-t border-neutral-100 dark:border-white/5">
          <button
            type="button"
            onClick={() => setShowCourseDetails(!showCourseDetails)}
            className="text-xs font-medium text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer py-1"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showCourseDetails ? "rotate-180" : ""
              }`}
            />
            <span>
              {showCourseDetails
                ? "Hide optional course details"
                : "+ Course Details & Institution (Optional)"}
            </span>
          </button>

          {showCourseDetails && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-neutral-100 dark:border-white/5 animate-in fade-in duration-150">
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Course / Module Code
                </label>
                <input
                  type="text"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="e.g. MN6094NI Developing Breakthrough Leadership"
                  className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  University / Institution
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. University of Westminster"
                  className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plain-English Scope Cards: Green (Included) & Orange (Excluded) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Green Box: Included Scope */}
        <div
          data-testid="included-scope-card"
          className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10 space-y-3 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
              <h3 className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>What to Focus On & Include</span>
              </h3>
              <span className="text-[10px] font-mono text-emerald-600/80 dark:text-emerald-400/80">
                {scopeBoundaries.included.length} Targets
              </span>
            </div>

            <ul className="space-y-2">
              {scopeBoundaries.included.map((item, idx) => (
                <li
                  key={idx}
                  className="text-xs text-emerald-900 dark:text-emerald-200/90 leading-relaxed flex items-start gap-2 bg-emerald-500/10 dark:bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/15"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Orange/Amber Box: Excluded Scope */}
        <div
          data-testid="excluded-scope-card"
          className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10 space-y-3 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
              <h3 className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>What to Avoid / Out of Scope</span>
              </h3>
              <span className="text-[10px] font-mono text-amber-600/80 dark:text-amber-400/80">
                {scopeBoundaries.excluded.length} Boundaries
              </span>
            </div>

            <ul className="space-y-2">
              {scopeBoundaries.excluded.map((item, idx) => (
                <li
                  key={idx}
                  className="text-xs text-amber-900 dark:text-amber-200/90 leading-relaxed flex items-start gap-2 bg-amber-500/10 dark:bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/15"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      {onProceed && (
        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={() =>
              onProceed({
                question,
                briefText,
                tone: writingTone,
                scope: scopeBoundaries,
              })
            }
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            Proceed to Literature Discovery →
          </button>
        </div>
      )}
    </div>
  );
};

export default UnderstandWorkspace;
