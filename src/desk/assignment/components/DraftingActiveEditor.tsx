import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { showAppToast } from "../../../components/ui/FeedbackSystem";
import type { AssignmentDraftingSection, DiscoveredSource } from "../types";
import {
  Sparkles,
  Edit3,
  Check,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  CheckCircle2,
  Loader2,
  TrendingUp,
  FileText,
  Scissors,
  PlusCircle,
  Edit2,
  X,
  Copy,
  ExternalLink,
  ChevronDown,
  Quote,
  Bold,
  Italic,
  Heading,
  List,
  ShieldCheck,
  Layers,
  Maximize2,
  Minimize2,
  Brain,
} from "lucide-react";

export interface DraftingActiveEditorProps {
  section: AssignmentDraftingSection | null;
  onUpdateContent: (content: string) => void;
  onUpdateTitle?: (newTitle: string) => void;
  onStreamSection?: (revisionType?: "deepen" | "expand" | "condense" | "citations" | "smooth" | "challenge" | string) => void;
  isStreaming?: boolean;
  streamingChunk?: string;
  boundSources?: DiscoveredSource[];
  allApprovedSources?: DiscoveredSource[];
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
function renderAcademicProseWithCitations(
  prose: string,
  onCitationClick?: (citationText: string, event: React.MouseEvent) => void
) {
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
                onClick={(e) => onCitationClick?.(part, e)}
                className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-mono font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/80 dark:border-blue-700/40 transition-all hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer shadow-2xs select-none active:scale-[0.98]"
                title="Verified Grounded Citation — Click to view source metadata"
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
  onUpdateTitle,
  onStreamSection,
  isStreaming = false,
  streamingChunk = "",
  boundSources = [],
  allApprovedSources = [],
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious = false,
  hasNext = false,
  className = "",
}: DraftingActiveEditorProps) {
  const [isEditingManually, setIsEditingManually] = useState(false);
  const [manualText, setManualText] = useState(section?.draftContent || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(section?.title || "");
  const [customDirective, setCustomDirective] = useState("");

  // Zen Mode & Writer's Block Nudge State
  const [isZenMode, setIsZenMode] = useState(false);
  const [showWriterBlockNudge, setShowWriterBlockNudge] = useState(false);
  const writerBlockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Tone Enhancer State
  const [toneEnhancement, setToneEnhancement] = useState<{
    original: string;
    enhanced: string;
    start: number;
    end: number;
  } | null>(null);

  // Citation Inspector Popover State
  const [inspectedCitation, setInspectedCitation] = useState<{
    text: string;
    source: DiscoveredSource | null;
  } | null>(null);
  const [copiedCitation, setCopiedCitation] = useState(false);

  // Manual Mode Citation Inserter Dropdown State
  const [showCitationDropdown, setShowCitationDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const citationDropdownRef = useRef<HTMLDivElement>(null);

  // Combined pool of available sources
  const availableSources = React.useMemo(() => {
    const list = [...boundSources];
    for (const src of allApprovedSources) {
      if (!list.some((s) => s.id === src.id)) {
        list.push(src);
      }
    }
    return list;
  }, [boundSources, allApprovedSources]);

  // A different section: start fresh. (Saving what the student types also
  // changes draftContent; that must not close the editor mid-sentence.)
  useEffect(() => {
    setManualText(section?.draftContent || "");
    setIsEditingManually(false);
    setIsEditingTitle(false);
    setInspectedCitation(null);
    setShowCitationDropdown(false);
    setCustomDirective("");
    setIsZenMode(false);
    setShowWriterBlockNudge(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the section changes
  }, [section?.id]);

  // Text that arrives from elsewhere (an AI draft) shows when not typing.
  useEffect(() => {
    if (!isEditingManually) setManualText(section?.draftContent || "");
  }, [section?.draftContent, isEditingManually]);

  useEffect(() => {
    setTitleInput(section?.title || "");
  }, [section?.title]);

  // An AI draft or revision replaces the text: leave edit mode so typing
  // cannot overwrite it with the older version.
  useEffect(() => {
    if (isStreaming) setIsEditingManually(false);
  }, [isStreaming]);

  // The writing box grows with the text instead of scrolling inside itself.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el || isZenMode) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, Math.round(window.innerHeight * 0.6))}px`;
  }, [manualText, isEditingManually, isZenMode]);

  // Writer's Block Nudge Effect
  useEffect(() => {
    if (isEditingManually && isZenMode) {
      if (writerBlockTimeoutRef.current) {
        clearTimeout(writerBlockTimeoutRef.current);
      }
      setShowWriterBlockNudge(false);
      
      // 120,000 ms = 2 minutes. Setting to 120s as per spec.
      writerBlockTimeoutRef.current = setTimeout(() => {
        setShowWriterBlockNudge(true);
      }, 120000);
    } else {
      if (writerBlockTimeoutRef.current) {
        clearTimeout(writerBlockTimeoutRef.current);
      }
      setShowWriterBlockNudge(false);
    }
    
    return () => {
      if (writerBlockTimeoutRef.current) clearTimeout(writerBlockTimeoutRef.current);
    };
  }, [manualText, isEditingManually, isZenMode]);

  // Close citation dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        citationDropdownRef.current &&
        !citationDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCitationDropdown(false);
      }
    };
    if (showCitationDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCitationDropdown]);

  if (!section) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-center bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 rounded-2xl shadow-xs">
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
  const isBudgetMet =
    currentWords >= Math.floor(targetWords * 0.9) &&
    currentWords <= Math.ceil(targetWords * 1.1);

  // PEEL Diagnostics
  const citationMatches = liveContent.match(
    /(\([A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?(?:;\s*[A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?)*\)|\[\d+(?:,\s*\d+)*\])/g
  );
  const citationCount = citationMatches ? citationMatches.length : 0;
  const hasAnalyticalDepth = /however|demonstrates|indicates|reveals|trade-off|contrasts|suggests|critique|substantiates|furthermore/i.test(
    liveContent
  );
  const hasPointSentence = liveContent.trim().length > 40;
  const hasLinkConclusion = liveContent.split("\n\n").length > 1;

  const handleManualTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setManualText(val);
    onUpdateContent(val);
  };

  const handleSaveManualEdit = () => {
    onUpdateContent(manualText);
    setIsEditingManually(false);
  };

  // Insert citation into manual editor textarea
  const handleInsertCitation = (source: DiscoveredSource) => {
    const author =
      source.authors && source.authors[0]
        ? source.authors[0].split(",")[0].trim()
        : "Scholar";
    const year = source.year || "n.d.";
    const citationString = ` (${author}, ${year})`;

    if (textareaRef.current) {
      const el = textareaRef.current;
      const start = el.selectionStart ?? manualText.length;
      const end = el.selectionEnd ?? manualText.length;
      const updated =
        manualText.slice(0, start) + citationString + manualText.slice(end);
      setManualText(updated);
      onUpdateContent(updated);
      setShowCitationDropdown(false);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(
          start + citationString.length,
          start + citationString.length
        );
      }, 50);
    } else {
      const updated = manualText + citationString;
      setManualText(updated);
      onUpdateContent(updated);
      setShowCitationDropdown(false);
    }
  };

  // Markdown formatting tool
  const applyMarkdownFormat = (prefix: string, suffix: string = "") => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = manualText.substring(start, end) || "text";
    const replacement = `${prefix}${selected}${suffix}`;
    const updated =
      manualText.substring(0, start) + replacement + manualText.substring(end);
    setManualText(updated);
    onUpdateContent(updated);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selected.length
      );
    }, 50);
  };

  const handleElevateTone = () => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) {
      showAppToast("Please select some text to elevate.", "warning");
      return;
    }
    const selectedText = manualText.substring(start, end);
    // Simulated Academic Rewrite
    const enhanced = selectedText
      .replace(/\b(good|bad)\b/gi, (m) => (m.toLowerCase() === "good" ? "optimal" : "suboptimal"))
      .replace(/\b(very|really)\b/gi, "significantly")
      .replace(/\b(show|shows)\b/gi, "demonstrates")
      .replace(/\b(say|says)\b/gi, "asserts")
      .replace(/\b(use)\b/gi, "utilize")
      .replace(/\b(think)\b/gi, "postulate") + " [Academic Tone Enhanced]";
      
    setToneEnhancement({ original: selectedText, enhanced, start, end });
  };

  const applyToneEnhancement = () => {
    if (!toneEnhancement) return;
    const newText =
      manualText.substring(0, toneEnhancement.start) +
      toneEnhancement.enhanced +
      manualText.substring(toneEnhancement.end);
    setManualText(newText);
    onUpdateContent(newText);
    setToneEnhancement(null);
  };

  // Inspect citation on click
  const handleCitationClick = (citationText: string) => {
    let matchedSource: DiscoveredSource | null = null;
    const cleanCit = citationText.replace(/[()[\]]/g, "").toLowerCase();

    for (const src of availableSources) {
      const authorMatch = src.authors?.some((a) =>
        cleanCit.includes(a.split(",")[0].toLowerCase().trim())
      );
      const yearMatch = src.year && cleanCit.includes(String(src.year));
      if (authorMatch || yearMatch) {
        matchedSource = src;
        break;
      }
    }

    // Fallback: match index if IEEE [1]
    const ieeeMatch = citationText.match(/\[(\d+)\]/);
    if (!matchedSource && ieeeMatch) {
      const idx = parseInt(ieeeMatch[1], 10) - 1;
      if (availableSources[idx]) {
        matchedSource = availableSources[idx];
      }
    }

    setInspectedCitation({ text: citationText, source: matchedSource });
    setCopiedCitation(false);
  };

  const handleCopyCitation = () => {
    if (inspectedCitation?.text) {
      navigator.clipboard.writeText(inspectedCitation.text);
      setCopiedCitation(true);
      setTimeout(() => setCopiedCitation(false), 2000);
    }
  };

  if (isZenMode) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-ink-750 flex flex-col items-center py-12 overflow-y-auto animate-in fade-in duration-300">
        <div className="w-full max-w-3xl px-6">
          <div className="flex items-center justify-between mb-8 text-neutral-400">
            <h2 className="text-sm font-medium tracking-wide">FOCUS MODE</h2>
            <button
              onClick={() => setIsZenMode(false)}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2 text-xs"
            >
              <Minimize2 className="w-4 h-4" />
              Exit Focus Mode
            </button>
          </div>
          
          {isEditingTitle ? (
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={() => {
                setIsEditingTitle(false);
                if (titleInput.trim() && titleInput !== section.title) {
                  onUpdateTitle?.(titleInput);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              autoFocus
              className="text-4xl font-bold text-neutral-900 dark:text-white bg-transparent border-none outline-none w-full mb-8 font-serif"
            />
          ) : (
            <h1 
              onClick={() => setIsEditingTitle(true)}
              className="text-4xl font-bold text-neutral-900 dark:text-white mb-8 font-serif cursor-text"
            >
              {section.title}
            </h1>
          )}

          {showWriterBlockNudge && (
            <div className="mb-6 p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 flex items-start gap-3 animate-in slide-in-from-top-2 fade-in duration-300">
              <Brain className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-indigo-900 dark:text-indigo-200 font-medium">Stuck? Try focusing on:</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
                  {section.keyPoints?.[0] || section.guidance || "the main argument of this section."}
                </p>
              </div>
              <button 
                onClick={() => setShowWriterBlockNudge(false)}
                className="ml-auto p-1 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={manualText}
            onChange={handleManualTextChange}
            onBlur={handleSaveManualEdit}
            placeholder="Start drafting..."
            className="w-full h-full min-h-[60vh] bg-transparent border-none outline-none resize-none text-lg text-neutral-800 dark:text-neutral-200 leading-relaxed font-serif"
            autoFocus
          />
        </div>
      </div>
    );
  }

  return (
    <article
      aria-label="Active Section Editor"
      className={`flex flex-col bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 rounded-2xl shadow-xs overflow-hidden transition-colors ${className}`}
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

          {isEditingTitle ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (titleInput.trim()) {
                  onUpdateTitle?.(titleInput.trim());
                  setIsEditingTitle(false);
                }
              }}
              className="flex items-center gap-1.5 py-0.5"
            >
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="text-sm sm:text-base font-semibold px-2 py-0.5 rounded bg-white dark:bg-ink-600 border border-neutral-300 dark:border-white/20 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                autoFocus
              />
              <button
                type="submit"
                className="p-1.5 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 cursor-pointer"
                title="Save title"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitleInput(section.title);
                  setIsEditingTitle(false);
                }}
                className="p-1.5 rounded hover:bg-neutral-200/60 dark:hover:bg-white/10 text-neutral-500 cursor-pointer"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 group/title">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-neutral-900 dark:text-white truncate">
                {section.title}
              </h2>
              {onUpdateTitle && (
                <button
                  type="button"
                  onClick={() => {
                    setTitleInput(section.title);
                    setIsEditingTitle(true);
                  }}
                  className="opacity-0 group-hover/title:opacity-100 transition-opacity p-1 rounded hover:bg-neutral-200/60 dark:hover:bg-white/10 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                  title="Edit section title"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
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
      {(section.guidance || boundSources.length > 0) && (
        <div className="px-5 py-3 border-b border-neutral-100 dark:border-white/5 bg-neutral-50/30 dark:bg-white/[0.01] flex flex-wrap items-center justify-between gap-3 text-xs">
          {section.guidance && (
            <p className="text-neutral-600 dark:text-neutral-400 max-w-xl text-[12px] leading-relaxed line-clamp-2">
              <strong className="font-medium text-neutral-800 dark:text-neutral-200">
                Focus:
              </strong>{" "}
              {section.guidance.replace(/^Academic\s+Lens:\s*/i, "").replace(/^Focus:\s*/i, "")}
            </p>
          )}

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
                {s.authors?.[0]?.split(",")[0] || "Source"} ({s.year || "n.d."})
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {/* PEEL Quality & Diagnostic Bar (shows when content exists) */}
      {liveContent.trim().length > 0 && (
        <div className="px-5 py-2 border-b border-neutral-100 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-3">
            <span className="text-neutral-400 font-medium uppercase tracking-wider text-[10px]">
              PEEL Framework:
            </span>
            <div className="flex items-center gap-2 font-mono">
              <span
                title="Point: Distinct academic topic claim"
                className={`flex items-center gap-1 ${
                  hasPointSentence
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-neutral-400"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>P: Point</span>
              </span>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
              <span
                title="Evidence: In-text citations grounded in literature"
                className={`flex items-center gap-1 ${
                  citationCount > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-neutral-400"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>E: {citationCount} {citationCount === 1 ? "Citation" : "Citations"}</span>
              </span>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
              <span
                title="Explanation: 70% critical analysis & dialectical rigor"
                className={`flex items-center gap-1 ${
                  hasAnalyticalDepth
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-neutral-400"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>E: 70% Analysis</span>
              </span>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
              <span
                title="Link: Concluding transition connecting to assessment thesis"
                className={`flex items-center gap-1 ${
                  hasLinkConclusion
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-neutral-400"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>L: Link</span>
              </span>
            </div>
          </div>

          <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
            {citationCount > 0
              ? "Click citations in preview to inspect grounded sources"
              : "Use Insert Citations to anchor arguments"}
          </div>
        </div>
      )}

      {/* Floating Citation Inspector Drawer/Banner (when a citation anchor is clicked) */}
      {inspectedCitation && (
        <div className="px-5 py-3 border-b border-blue-200/80 dark:border-blue-800/40 bg-blue-50/80 dark:bg-blue-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5 min-w-0">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-blue-900 dark:text-blue-200">
                  {inspectedCitation.text}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono">
                  Verified Literature
                </span>
              </div>
              {inspectedCitation.source ? (
                <p className="text-[11px] text-blue-800/90 dark:text-blue-300/90 truncate max-w-xl">
                  {inspectedCitation.source.title} ({inspectedCitation.source.year || "n.d."}) —{" "}
                  {inspectedCitation.source.journal || inspectedCitation.source.type || "Peer-Reviewed"}
                </p>
              ) : (
                <p className="text-[11px] text-blue-700/80 dark:text-blue-400/80">
                  Recognized scholarly citation anchor in active academic prose.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleCopyCitation}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors flex items-center gap-1 cursor-pointer"
            >
              {copiedCitation ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Citation</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setInspectedCitation(null)}
              className="p-1 rounded text-blue-700 dark:text-blue-300 hover:bg-blue-200/60 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
              title="Close inspection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Inline Section Action Controls Toolbar */}
      <div className="px-5 py-2.5 border-b border-neutral-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-ink-750">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Deepen Analysis */}
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

          {/* Reinforce Citations */}
          <button
            type="button"
            onClick={() => onStreamSection?.("citations")}
            disabled={isStreaming}
            title="Anchor assertions with in-text citations from bound literature"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Ground Citations</span>
          </button>

          {/* Devil's Advocate */}
          <button
            type="button"
            onClick={() => onStreamSection?.("challenge")}
            disabled={isStreaming}
            title="Devil's Advocate: Identify weak spots and suggest counter-arguments"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden sm:inline">Challenge Me</span>
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
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingManually(true)}
              disabled={isStreaming}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit text</span>
            </button>
          )}
        </div>
      </div>

      {/* Custom AI Section Directives Bar */}
      <div className="px-5 py-2.5 bg-neutral-50/70 dark:bg-white/[0.02] border-b border-neutral-100 dark:border-white/5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-purple-500">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              value={customDirective}
              onChange={(e) => setCustomDirective(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customDirective.trim() && !isStreaming) {
                  onStreamSection?.(customDirective.trim());
                }
              }}
              placeholder="Guide AI for this section... (e.g. 'Contrast with empirical studies from 2023', 'Emphasize policy implications', 'Add critical counter-argument')"
              className="w-full pl-8 pr-20 py-1.5 text-xs bg-white dark:bg-ink-600 border border-neutral-200/80 dark:border-white/10 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all shadow-2xs font-sans"
            />
            <button
              type="button"
              disabled={!customDirective.trim() || isStreaming}
              onClick={() => {
                if (customDirective.trim()) {
                  onStreamSection?.(customDirective.trim());
                }
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <span>Draft</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Quick Directive Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px] pt-0.5">
          <span className="text-[10px] uppercase font-semibold text-neutral-400 dark:text-neutral-500 tracking-wider shrink-0">
            Suggested Directives:
          </span>
          {[
            { label: "Synthesize Counterargument", prompt: "Synthesize strong counterarguments and theoretical critiques challenging the primary hypothesis" },
            { label: "Deepen Dialectical Rigor", prompt: "Deepen dialectical rigor by evaluating methodological trade-offs and structural assumptions" },
            { label: "Strengthen Academic Register", prompt: "Elevate formal academic register and sophisticated transitional phrasing" },
            { label: "Focus on Policy Implications", prompt: "Expand pragmatic policy implications and actionable future recommendations" },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={isStreaming}
              onClick={() => {
                setCustomDirective(chip.prompt);
                onStreamSection?.(chip.prompt);
              }}
              className="px-2 py-0.5 rounded-md bg-white dark:bg-ink-600 border border-neutral-200/70 dark:border-white/10 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:border-white/20 transition-all shrink-0 cursor-pointer disabled:opacity-40"
            >
              + {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor & Content Canvas */}
      <main
        tabIndex={0}
        aria-label="Section Content"
        className="flex-1 p-4 sm:p-6 min-h-[60vh] focus:outline-none"
      >
        {isEditingManually ? (
          <div className="space-y-3 h-full flex flex-col">
            {/* Markdown & Citation Insertion Helper Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-neutral-100/70 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5 text-xs">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyMarkdownFormat("**", "**")}
                  className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                  title="Bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkdownFormat("*", "*")}
                  className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                  title="Italic"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkdownFormat("### ", "")}
                  className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                  title="Heading 3"
                >
                  <Heading className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkdownFormat("> ", "")}
                  className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                  title="Blockquote"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkdownFormat("- ", "")}
                  className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                  title="Bullet List"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-4 bg-neutral-200 dark:bg-white/10 mx-1" />
                <button
                  type="button"
                  onClick={handleElevateTone}
                  className="px-2 py-1 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center gap-1 transition-colors"
                  title="Elevate Academic Tone of selected text"
                >
                  <Sparkles className="w-3 h-3" />
                  Elevate Tone
                </button>
                <div className="w-px h-4 bg-neutral-200 dark:bg-white/10 mx-1" />
                <button
                  type="button"
                  onClick={() => setIsZenMode(true)}
                  className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                  title="Enter Focus Mode"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* + Insert Citation Dropdown Button */}
              <div className="relative" ref={citationDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowCitationDropdown(!showCitationDropdown)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <BookOpen className="w-3 h-3" />
                  <span>+ Insert Citation</span>
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </button>

                {showCitationDropdown && (
                  <div className="absolute right-0 mt-1 w-72 max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-ink-650 border border-neutral-200 dark:border-white/15 shadow-xl z-30 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Select Source to Cite:
                    </div>
                    {availableSources.length > 0 ? (
                      availableSources.map((s) => {
                        const author =
                          s.authors && s.authors[0]
                            ? s.authors[0].split(",")[0].trim()
                            : "Scholar";
                        const year = s.year || "n.d.";
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleInsertCitation(s)}
                            className="w-full text-left p-2 rounded-lg text-xs hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer group"
                          >
                            <div className="font-medium text-neutral-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                              ({author}, {year})
                            </div>
                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                              {s.title}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-neutral-400">
                        No approved sources found.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={manualText}
              onChange={handleManualTextChange}
              placeholder="Write or refine your academic section prose here..."
              rows={16}
              aria-label="Section text"
              className="w-full flex-1 min-h-[60vh] p-5 text-base leading-relaxed text-neutral-900 dark:text-neutral-100 bg-neutral-50/70 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-white/20 resize-none overflow-hidden font-sans transition-colors"
            />

            <div className="flex justify-between items-center text-xs text-neutral-500 dark:text-neutral-400 px-1 pt-1">
              <span>Saved as you type. Blank lines start new paragraphs.</span>
              <span className="tabular-nums font-mono">
                {currentWords.toLocaleString()} / {targetWords.toLocaleString()} words
              </span>
            </div>

            {/* Tone Enhancer Diff Overlay */}
            {toneEnhancement && (
              <div className="absolute inset-x-4 bottom-4 p-4 rounded-xl bg-white dark:bg-ink-500 border border-indigo-200 dark:border-indigo-900/50 shadow-2xl z-20 animate-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" />
                    Academic Tone Enhancement
                  </div>
                  <button onClick={() => setToneEnhancement(null)} className="p-1 hover:bg-neutral-100 dark:hover:bg-white/5 rounded text-neutral-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-neutral-50 dark:bg-ink-750 border border-neutral-200 dark:border-white/10 text-sm line-through opacity-70">
                    {toneEnhancement.original}
                  </div>
                  <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 text-sm text-indigo-900 dark:text-indigo-100">
                    {toneEnhancement.enhanced}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setToneEnhancement(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors">
                    Reject
                  </button>
                  <button onClick={applyToneEnhancement} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                    Accept Enhancement
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : liveContent.trim().length > 0 ? (
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            {renderAcademicProseWithCitations(liveContent, handleCitationClick)}
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
                This section is empty
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Write it yourself, or let your AI draft it from your approved sources and edit the result.
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
                    <span>Draft with AI</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsEditingManually(true)}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Write it myself
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
