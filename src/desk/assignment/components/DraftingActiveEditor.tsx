import React,{ useState,useEffect,useRef } from "react";
import SectionTextEditor,{ type SectionEditorHandle } from "../../editor/SectionTextEditor";
import { inlineMarkdownRuns } from "../../../shared/inlineMarkdown";
import { formatSourceInTextCitation } from "../services/citationFormatService";
import { parsePersonName } from "../services/personName";
import { countProseWords,parseProseBlocks } from "../../../shared/proseBlocks";
import type { AssignmentDraftingSection,DiscoveredSource } from "../types";
import { splitProseIntoParagraphs } from "../../../shared/proseParagraphs";
import {
Sparkles,
Edit3,
Check,
BookOpen,
ArrowRight,
ArrowLeft,
CheckCircle2,
Loader2,
TrendingUp,
FileText,
Scissors,
PlusCircle,
Edit2,
X,
Copy,
ChevronDown,
ShieldCheck,
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
  /** The project's citation style: inserted citations use it (shared citation engine). */
  citationStyle?: string;
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

  const citationRegex =
    /(\([A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?(?:;\s*[A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?)*\)|\[\d+(?:,\s*\d+)*\])/g;

  // Inline text: citation chips plus real bold / italic / underline (never asterisks or tags).
  const inline = (text: string) =>
    text.split(citationRegex).map((part, i) => {
      if (!part) return null;
      if (citationRegex.test(part)) {
        citationRegex.lastIndex = 0; // reset regex state
        return (
          <span
            key={i}
            data-testid="citation-anchor"
            onClick={(e) => onCitationClick?.(part, e)}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-xs font-mono font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/80 dark:border-blue-700/40 transition-all hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer shadow-2xs select-none active:scale-[0.98]"
            title="Verified Grounded Citation — Click to view source metadata"
          >
            {part}
          </span>
        );
      }
      return (
        <span key={i}>
          {inlineMarkdownRuns(part).map((r, j) => {
            let node: React.ReactNode = r.text;
            if (r.underline) node = <u>{node}</u>;
            if (r.italics) node = <em>{node}</em>;
            if (r.bold) node = <strong>{node}</strong>;
            return <React.Fragment key={j}>{node}</React.Fragment>;
          })}
        </span>
      );
    });

  const textClass = "text-[14px] sm:text-[15px] leading-relaxed text-[color:var(--text-primary)]";

  // One element per block; a single long paragraph is regrouped every 3-4 sentences.
  return parseProseBlocks(prose).map((b, idx) => {
    if (b.kind === "heading") {
      return (
        <h4 key={idx} style={b.align ? { textAlign: b.align } : undefined} className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)] mt-5 mb-2">
          {inline(b.text)}
        </h4>
      );
    }
    if (b.kind === "quote") {
      return (
        <blockquote key={idx} className={`${textClass} mb-4 border-l-2 border-[color:var(--border-default)] pl-4 italic`}>
          {b.text.split("\n").map((l, i) => (
            <p key={i}>{inline(l)}</p>
          ))}
        </blockquote>
      );
    }
    if (b.kind === "bullets" || b.kind === "numbered") {
      const List = b.kind === "bullets" ? "ul" : "ol";
      return (
        <List key={idx} className={`${textClass} mb-4 pl-6 ${b.kind === "bullets" ? "list-disc" : "list-decimal"} space-y-1`}>
          {b.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </List>
      );
    }
    if (b.kind === "table") {
      return (
        <div key={idx} className="mb-4 overflow-x-auto">
          <table className={`${textClass} w-full border-collapse text-[13px]`}>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => {
                    const Cell = b.header && ri === 0 ? "th" : "td";
                    return (
                      <Cell key={ci} className="border border-[color:var(--border-default)] px-2 py-1 text-left align-top">
                        {inline(c)}
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <p key={idx} style={b.align ? { textAlign: b.align } : undefined} className={`${textClass} mb-4 selection:bg-blue-100 dark:selection:bg-blue-900/40`}>
        {inline(b.text)}
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
  citationStyle = "harvard",
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious = false,
  hasNext = false,
  className = "",
}: DraftingActiveEditorProps) {
  const [isEditingManually, setIsEditingManually] = useState(false);
  const [manualText, setManualText] = useState(section?.draftContent || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const headingWords = (section?.title || "").trim().split(/\s+/);
  const [titleInput, setTitleInput] = useState(section?.title || "");

  // Zen Mode & Writer's Block Nudge State
  const [isZenMode, setIsZenMode] = useState(false);
  const [showWriterBlockNudge, setShowWriterBlockNudge] = useState(false);
  const writerBlockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Citation Inspector Popover State
  const [inspectedCitation, setInspectedCitation] = useState<{
    text: string;
    source: DiscoveredSource | null;
  } | null>(null);
  const [copiedCitation, setCopiedCitation] = useState(false);

  // Manual Mode Citation Inserter Dropdown State
  const [showCitationDropdown, setShowCitationDropdown] = useState(false);
  const editorRef = useRef<SectionEditorHandle>(null);
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
      <div className="flex-1 flex items-center justify-center p-12 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs">
        <div className="space-y-2 max-w-sm">
          <FileText className="w-8 h-8 text-[color:var(--text-muted)] mx-auto" />
          <h3 className="text-base font-semibold text-[color:var(--text-primary)]">
            Select a Section to Begin
          </h3>
          <p className="text-xs text-[color:var(--text-muted)]">
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

  const currentWords = countProseWords(liveContent);
  const targetWords = section.targetWordCount || 500;
  const wordDiff = currentWords - targetWords;
  const isBudgetMet =
    currentWords >= Math.floor(targetWords * 0.9) &&
    currentWords <= Math.ceil(targetWords * 1.1);

  // Counted facts about the text
  const citationMatches = liveContent.match(
    /(\([A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?(?:;\s*[A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?)*\)|\[\d+(?:,\s*\d+)*\])/g
  );
  const citationCount = citationMatches ? citationMatches.length : 0;
  const paragraphCount = splitProseIntoParagraphs(liveContent).length;

  // The shared rich-text editor (src/desk/editor) emits the same light-Markdown text that is stored.
  const handleEditorChange = (next: string) => {
    setManualText(next);
    onUpdateContent(next);
  };

  const handleSaveManualEdit = () => {
    onUpdateContent(manualText);
    setIsEditingManually(false);
  };

  // Insert citation into manual editor textarea
  // In-text citation in the project's style from the shared citation engine
  // (family name parsed properly: "Haryo Kuncoro" cites as "Kuncoro").
  const citeLabel = (source: DiscoveredSource) =>
    formatSourceInTextCitation(source, citationStyle, Math.max(1, availableSources.findIndex((s) => s.id === source.id) + 1));

  const handleInsertCitation = (source: DiscoveredSource) => {
    const citationString = ` ${citeLabel(source)}`;

    if (editorRef.current) {
      editorRef.current.insertText(citationString);
      setShowCitationDropdown(false);
    } else {
      const updated = manualText + citationString;
      setManualText(updated);
      onUpdateContent(updated);
      setShowCitationDropdown(false);
    }
  };

  // Inspect citation on click
  const handleCitationClick = (citationText: string) => {
    let matchedSource: DiscoveredSource | null = null;
    const cleanCit = citationText.replace(/[()[\]]/g, "").toLowerCase();

    for (const src of availableSources) {
      const authorMatch = src.authors?.some((a) => {
        const family = parsePersonName(String(a)).family.toLowerCase();
        return family.length > 1 && cleanCit.includes(family);
      });
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
      <div className="fixed inset-0 z-50 bg-[color:var(--surface-raised)] flex flex-col items-center py-12 overflow-y-auto animate-in fade-in duration-300">
        <div className="w-full max-w-3xl px-6">
          <div className="flex items-center justify-between mb-8 text-[color:var(--text-muted)]">
            <h2 className="text-sm font-medium tracking-wide">FOCUS MODE</h2>
            <button
              onClick={() => setIsZenMode(false)}
              className="p-2 hover:bg-[color:var(--surface-hover)] rounded-lg transition-colors flex items-center gap-2 text-xs"
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
              className="text-4xl font-bold text-[color:var(--text-primary)] bg-transparent border-none outline-none w-full mb-8 font-serif"
            />
          ) : (
            <h1 
              onClick={() => setIsEditingTitle(true)}
              className="text-4xl font-bold text-[color:var(--text-primary)] mb-8 font-serif cursor-text"
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

          <SectionTextEditor
            ref={editorRef}
            value={manualText}
            onChange={handleEditorChange}
            ariaLabel="Section text (focus mode)"
            placeholder="Start drafting..."
            citationLabel={(id) => id}
            richBlocks
            autoFocus
            contentClassName="section-editor min-h-[60vh] p-4 sm:p-6 text-lg leading-relaxed font-serif text-[color:var(--text-primary)] focus:outline-none"
          />
        </div>
      </div>
    );
  }

  return (
    <article
      aria-label="Active Section Editor"
      className={`flex flex-col bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs overflow-hidden transition-colors ${className}`}
    >
      {/* Header Bar */}
      <header className="px-5 py-4 border-b border-[color:var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[color:var(--surface-inset)]/50">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* The section's role, only when it says something the title does not. */}
            {(() => {
              const label = (section.academicFunction || "").trim();
              const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/…/g, "").trim();
              const repeatsTitle = label && (norm(section.title).startsWith(norm(label).slice(0, 40)) || norm(label).startsWith(norm(section.title).slice(0, 40)));
              return label && !repeatsTitle ? (
                <span className="text-xs font-medium text-[color:var(--text-muted)] uppercase tracking-wider">{label}</span>
              ) : null;
            })()}

            {section.status === "completed" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                <span>Drafted</span>
              </span>
            )}

            {isStreaming && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full animate-pulse">
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
                className="text-sm sm:text-base font-semibold px-2 py-0.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-neutral-400"
                autoFocus
              />
              <button
                type="submit"
                className="p-1.5 rounded bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 cursor-pointer"
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
                className="p-1.5 rounded hover:bg-[color:var(--surface-hover)] text-[color:var(--text-muted)] cursor-pointer"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 group/title">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[color:var(--text-primary)] truncate" title={section.title}>
                  {headingWords.length > 10 ? `${headingWords.slice(0, 10).join(" ")}…` : section.title}
                </h2>
                {headingWords.length > 10 && (
                  <p className="text-xs text-[color:var(--text-muted)] line-clamp-2" data-testid="section-full-prompt">
                    {section.title}
                  </p>
                )}
              </div>
              {onUpdateTitle && (
                <button
                  type="button"
                  onClick={() => {
                    setTitleInput(section.title);
                    setIsEditingTitle(true);
                  }}
                  className="opacity-0 group-hover/title:opacity-100 transition-opacity p-1 rounded hover:bg-[color:var(--surface-hover)] text-[color:var(--text-muted)] hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
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
            <div className="text-xs font-semibold text-[color:var(--text-primary)] tabular-nums">
              {currentWords.toLocaleString()} / {targetWords.toLocaleString()} words
            </div>
            <div
              className={`text-xs tabular-nums font-medium ${
                isBudgetMet
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-[color:var(--text-muted)]"
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
        <div className="px-5 py-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          {section.guidance && (
            <p className="text-[color:var(--text-secondary)] max-w-xl text-[12px] leading-relaxed line-clamp-2">
              <strong className="font-medium text-[color:var(--text-primary)]">
                Focus:
              </strong>{" "}
              {section.guidance.replace(/^Academic\s+Lens:\s*/i, "").replace(/^Focus:\s*/i, "")}
            </p>
          )}

        {boundSources.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <span className="text-xs text-[color:var(--text-muted)]">
              Assigned Evidence:
            </span>
            {boundSources.map((s) => (
              <span
                key={s.id}
                className="px-2 py-0.5 rounded-md text-xs font-medium bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]"
                title={s.title}
              >
                {citeLabel(s)}
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Facts about the text (shows when content exists): counted, never scored */}
      {liveContent.trim().length > 0 && (
        <div className="px-5 py-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/50 flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="section-facts">
          <div className="flex items-center gap-3 text-[color:var(--text-secondary)] tabular-nums">
            <span>{paragraphCount} {paragraphCount === 1 ? "paragraph" : "paragraphs"}</span>
            <span className="text-neutral-300 dark:text-neutral-600" aria-hidden="true">·</span>
            <span className={citationCount > 0 ? "" : "text-amber-700 dark:text-amber-400"}>
              {citationCount} {citationCount === 1 ? "citation" : "citations"}
            </span>
          </div>
          <div className="text-[color:var(--text-muted)]">
            {citationCount > 0
              ? "Click a citation in the preview to see its source"
              : "No citations yet: use Insert Citation to support your points"}
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
                <span className="text-xs px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono">
                  Verified Literature
                </span>
              </div>
              {inspectedCitation.source ? (
                <p className="text-xs text-blue-800/90 dark:text-blue-300/90 truncate max-w-xl">
                  {inspectedCitation.source.title} ({inspectedCitation.source.year || "n.d."}) —{" "}
                  {inspectedCitation.source.journal || inspectedCitation.source.type || "Peer-Reviewed"}
                </p>
              ) : (
                <p className="text-xs text-blue-700/80 dark:text-blue-400/80">
                  Recognized scholarly citation anchor in active academic prose.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleCopyCitation}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors flex items-center gap-1 cursor-pointer"
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

      {/* Toolbar: refinement actions appear only once the section has text */}
      <div className="px-5 py-2.5 border-b border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 bg-[color:var(--surface-raised)]">
        <div className="flex items-center gap-1.5 flex-wrap">
          {liveContent.trim().length > 0 && (<>
          {[
            { key: "expand", label: "Expand", title: "Elaborate while keeping citations grounded", Icon: PlusCircle },
            { key: "condense", label: "Condense", title: "Tighten the prose to fit the word budget", Icon: Scissors },
            { key: "tone", label: "Refine Tone", title: "Polish the academic register", Icon: TrendingUp },
            { key: "citations", label: "Insert Citation", title: "Anchor assertions with citations from your approved sources", Icon: BookOpen },
          ].map(({ key, label, title, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onStreamSection?.(key)}
              disabled={isStreaming}
              title={title}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
          </>)}
        </div>

        {/* Manual Edit Mode Toggle */}
        <div className="flex items-center gap-2">
          {isEditingManually ? (
            <button
              type="button"
              onClick={handleSaveManualEdit}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingManually(true)}
              disabled={isStreaming}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit text</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor & Content Canvas */}
      <section
        tabIndex={0}
        aria-label="Section Content"
        className="flex-1 p-5 sm:p-8 lg:p-10 min-h-[68vh] focus:outline-none"
      >
        {isEditingManually ? (
          <div className="space-y-3 h-full flex flex-col">
            {/* Insert bar: focus mode and citations (formatting lives in the editor toolbar) */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-[color:var(--surface-inset)]/70 border border-[color:var(--border-subtle)] text-xs">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsZenMode(true)}
                  className="p-1.5 rounded hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer"
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
                  <div className="absolute right-0 mt-1 w-72 max-h-56 overflow-y-auto rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xl z-30 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2 py-1 text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider">
                      Select Source to Cite:
                    </div>
                    {availableSources.length > 0 ? (
                      availableSources.map((s) => {
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleInsertCitation(s)}
                            className="w-full text-left p-2 rounded-lg text-xs hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer group"
                          >
                            <div className="font-medium text-[color:var(--text-primary)] truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                              {citeLabel(s)}
                            </div>
                            <div className="text-xs text-[color:var(--text-muted)] truncate">
                              {s.title}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-[color:var(--text-muted)]">
                        No approved sources found.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <SectionTextEditor
              ref={editorRef}
              value={manualText}
              onChange={handleEditorChange}
              ariaLabel="Section text"
              placeholder="Write or refine your academic section prose here..."
              citationLabel={(id) => id}
              richBlocks
              contentClassName="section-editor min-h-[60vh] p-5 sm:p-8 text-base leading-relaxed font-serif text-[color:var(--text-primary)] focus:outline-none"
            />

            <div className="flex justify-between items-center text-xs text-[color:var(--text-muted)] px-1 pt-1">
              <span>Saved as you type. Enter starts a new paragraph.</span>
              <span className="tabular-nums font-mono">
                {currentWords.toLocaleString()} / {targetWords.toLocaleString()} words
              </span>
            </div>

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
            <div className="p-3 rounded-2xl bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">
              <Sparkles className="w-6 h-6 text-amber-500" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-base font-semibold text-[color:var(--text-primary)]">
                This section is empty
              </h3>
              <p className="text-xs text-[color:var(--text-muted)] leading-relaxed">
                Write it yourself, or let your AI draft it from your approved sources and edit the result.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onStreamSection?.()}
                disabled={isStreaming}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 active:scale-[0.99] transition-all flex items-center gap-2 cursor-pointer shadow-xs"
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
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
              >
                Write it myself
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Footer Navigation Bar */}
      <footer className="px-5 py-3 border-t border-[color:var(--border-subtle)] flex items-center justify-between gap-3 bg-[color:var(--surface-inset)]/30">
        <button
          type="button"
          onClick={onNavigatePrevious}
          disabled={!hasPrevious}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3 h-3" />
          <span>Previous Section</span>
        </button>

        <button
          type="button"
          onClick={onNavigateNext}
          disabled={!hasNext}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span>Next Section</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </footer>
    </article>
  );
}

export default DraftingActiveEditor;
