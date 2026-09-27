import React, { useState, useEffect } from "react";
import type { AssignmentDraftingSection, DiscoveredSource } from "../types";
import {
  Sparkles,
  Edit3,
  Check,
  Maximize2,
  Minimize2,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  Loader2,
  TrendingUp,
  FileText,
  HelpCircle,
  Scissors,
  PlusCircle,
} from "lucide-react";

export interface DraftingActiveEditorProps {
  section: AssignmentDraftingSection | null;
  onUpdateContent: (content: string) => void;
  onStreamSection?: (revisionType?: "deepen" | "expand" | "condense") => void;
  isStreaming?: boolean;
  streamingChunk?: string;
  boundSources?: DiscoveredSource[];
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  className?: string;
}

/**
 * Parses academic prose and highlights in-text citations:
 * Matches Harvard/APA7 style: (Author, 2024), (Author & Author, 2023), (Author et al., 2022)
 * Matches IEEE style: [1], [2], [1, 2]
 */
function renderAcademicProseWithCitations(prose: string) {
  if (!prose) return null;

  const paragraphs = prose.split("\n\n");
  const citationRegex =
    /(\([A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?(?:;\s*[A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?)*\)|\[\d+(?:,\s*\d+)*\])/g;

  return paragraphs.map((para, pIdx) => {
    const trimmed = para.trim();
    if (!trimmed) return null;

    // Handle markdown headings
    if (trimmed.startsWith("### ")) {
      return (
        <h4
          key={pIdx}
          className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white mt-5 mb-2"
        >
          {trimmed.replace(/^###\s+/, "")}
        </h4>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h3
          key={pIdx}
          className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white mt-6 mb-3"
        >
          {trimmed.replace(/^##\s+/, "")}
        </h3>
      );
    }

    const parts = trimmed.split(citationRegex);

    return (
      <p
        key={pIdx}
        className="text-[14px] sm:text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200 mb-4 selection:bg-blue-100 dark:selection:bg-blue-900/40"
      >
        {parts.map((part, i) => {
          if (!part) return null;
          if (citationRegex.test(part)) {
            citationRegex.lastIndex = 0; // reset regex state
            return (
              <span
                key={i}
                data-testid="citation-anchor"
                className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-mono font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/80 dark:border-blue-700/40 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-help"
                title="Verified Grounded Citation"
              >
                {part}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    );
  });
}

export function DraftingActiveEditor({
  section,
  onUpdateContent,
  onStreamSection,
  isStreaming = false,
  streamingChunk = "",
  boundSources = [],
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious = false,
  hasNext = false,
  className = "",
}: DraftingActiveEditorProps) {
  const [isEditingManually, setIsEditingManually] = useState(false);
  const [manualText, setManualText] = useState(section?.draftContent || "");

  // Sync manual text when active section changes
  useEffect(() => {
    setManualText(section?.draftContent || "");
    setIsEditingManually(false);
  }, [section?.id, section?.draftContent]);

  if (!section) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-center bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl shadow-xs">
        <div className="space-y-2 max-w-sm">
          <FileText className="w-8 h-8 text-neutral-400 mx-auto" />
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
            Select a Section to Begin
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Choose a section from the left outline to inspect, stream prose, or edit manually.
          </p>
        </div>
      </div>
    );
  }

  const liveContent = isStreaming
    ? streamingChunk || section.draftContent || ""
    : isEditingManually
    ? manualText
    : section.draftContent || "";

  const currentWords = liveContent.trim()
    ? liveContent.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const targetWords = section.targetWordCount || 500;
  const wordDiff = currentWords - targetWords;
  const isBudgetMet = currentWords >= Math.floor(targetWords * 0.9);

  const handleManualTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setManualText(val);
    onUpdateContent(val);
  };

  const handleSaveManualEdit = () => {
    onUpdateContent(manualText);
    setIsEditingManually(false);
  };

  return (
    <article
      aria-label="Active Section Editor"
      className={`flex flex-col bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl shadow-xs overflow-hidden transition-colors ${className}`}
    >
      {/* Header Bar */}
      <header className="px-5 py-4 border-b border-neutral-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50/50 dark:bg-white/[0.02]">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              {section.academicFunction || "Academic Section"}
            </span>

            {section.status === "completed" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                <span>Drafted</span>
              </span>
            )}

            {isStreaming && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Streaming Prose</span>
              </span>
            )}
          </div>

          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-neutral-900 dark:text-white truncate">
            {section.title}
          </h2>
        </div>

        {/* Live Word Count Metric */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs font-semibold text-neutral-900 dark:text-white tabular-nums">
              {currentWords.toLocaleString()} / {targetWords.toLocaleString()} words
            </div>
            <div
              className={`text-[11px] tabular-nums font-medium ${
                isBudgetMet
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}
            >
              {wordDiff === 0
                ? "Exact target match"
                : wordDiff > 0
                ? `+${wordDiff}w above target`
                : `${Math.abs(wordDiff)}w remaining`}
            </div>
          </div>
        </div>
      </header>

      {/* Section Guidance & Bound Citations Strip */}
      <div className="px-5 py-3 border-b border-neutral-100 dark:border-white/5 bg-neutral-50/30 dark:bg-white/[0.01] flex flex-wrap items-center justify-between gap-3 text-xs">
        <p className="text-neutral-600 dark:text-neutral-400 max-w-xl text-[12px] leading-relaxed line-clamp-2">
          <strong className="font-medium text-neutral-800 dark:text-neutral-200">
            Academic Lens:
          </strong>{" "}
          {section.guidance}
        </p>

        {boundSources.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Assigned Evidence:
            </span>
            {boundSources.map((s) => (
              <span
                key={s.id}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 border border-neutral-200/60 dark:border-white/5"
                title={s.title}
              >
                {s.authors?.[0]?.split(",")[0] || "Source"} ({s.year || "2024"})
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Inline Section Action Controls Toolbar */}
      <div className="px-5 py-2.5 border-b border-neutral-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#1C1C1E]">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Deepen Analysis (70% critical analysis / 30% description) */}
          <button
            type="button"
            onClick={() => onStreamSection?.("deepen")}
            disabled={isStreaming}
            title="Amplify critical evaluation, evaluate trade-offs, and reduce passive description (70/30 PEEL ratio)"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
            <span>Deepen Analysis</span>
          </button>

          {/* Expand */}
          <button
            type="button"
            onClick={() => onStreamSection?.("expand")}
            disabled={isStreaming}
            title="Expand analytical elaboration while maintaining citation grounding"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-blue-500" />
            <span>Expand</span>
          </button>

          {/* Condense */}
          <button
            type="button"
            onClick={() => onStreamSection?.("condense")}
            disabled={isStreaming}
            title="Tighten prose to eliminate wordiness and fit exact budget"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-500" />
            <span>Condense</span>
          </button>

          {/* Full Regenerate */}
          <button
            type="button"
            onClick={() => onStreamSection?.()}
            disabled={isStreaming}
            title="Regenerate this section from scratch using PEEL framework"
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Manual Edit Mode Toggle */}
        <div className="flex items-center gap-2">
          {isEditingManually ? (
            <button
              type="button"
              onClick={handleSaveManualEdit}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done Editing</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingManually(true)}
              disabled={isStreaming}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Manual Edit</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor & Content Canvas */}
      <main
        tabIndex={0}
        aria-label="Section Content"
        className="flex-1 p-6 sm:p-8 min-h-[380px] max-h-[calc(100vh-380px)] overflow-y-auto focus:outline-none"
      >
        {isEditingManually ? (
          <div className="space-y-3 h-full">
            <textarea
              value={manualText}
              onChange={handleManualTextChange}
              placeholder="Write or refine your academic section prose here..."
              rows={16}
              aria-label="Manual Section Prose Editor"
              className="w-full h-full min-h-[340px] p-4 text-sm sm:text-base leading-relaxed text-neutral-900 dark:text-neutral-100 bg-neutral-50/70 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-white/20 resize-y font-sans transition-colors"
            />
            <div className="flex justify-between items-center text-xs text-neutral-500 dark:text-neutral-400 px-1">
              <span>Auto-saving live changes. Markdown formatting supported.</span>
              <span className="tabular-nums font-mono">{manualText.length} characters</span>
            </div>
          </div>
        ) : liveContent.trim().length > 0 ? (
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            {renderAcademicProseWithCitations(liveContent)}
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-neutral-900 dark:bg-white animate-pulse" />
            )}
          </div>
        ) : (
          /* Empty Section State Call-to-action */
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="p-3 rounded-2xl bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">
              <Sparkles className="w-6 h-6 text-amber-500" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                Section Ready for Drafting
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Generate this section using the PEEL academic framework (Point, Evidence, Explanation, Link) with 70% analytical depth and direct citations.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onStreamSection?.()}
                disabled={isStreaming}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                {isStreaming ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Writing Prose...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 dark:text-amber-500" />
                    <span>Generate with PEEL Framework</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsEditingManually(true)}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Write Manually
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer Navigation Bar */}
      <footer className="px-5 py-3 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between gap-3 bg-neutral-50/30 dark:bg-white/[0.01]">
        <button
          type="button"
          onClick={onNavigatePrevious}
          disabled={!hasPrevious}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3 h-3" />
          <span>Previous Section</span>
        </button>

        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
          Enforcing 70% Analysis · 30% Description balance
        </span>

        <button
          type="button"
          onClick={onNavigateNext}
          disabled={!hasNext}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span>Next Section</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </footer>
    </article>
  );
}

export default DraftingActiveEditor;
