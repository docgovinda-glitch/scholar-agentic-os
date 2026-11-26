import { DEFAULT_CITATION_STYLE } from "../../domain/assignment/answerKeys";
import React,{ useState,useRef,useEffect } from "react";
import { formatSourceInTextCitation } from "./services/citationFormatService";
import { parsePersonName } from "./services/referenceListGenerator";
import { sourceVenueLabel } from "./services/sourceDisplay";
import type { DiscoveredSource } from "./types";
import {
Check,
Plus,
Copy,
Edit2,
X,
FileUp,
Bookmark,BookOpen,
Table,
Quote,
ChevronUp,
ChevronDown,
Sparkles
} from "lucide-react";

export interface ReferenceBarItemProps {
  source: DiscoveredSource;
  isApproved: boolean;
  onToggleApproval: (sourceId: string) => void;
  onDismiss?: (sourceId: string) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: (sourceId: string) => void;
  onEdit?: (source: DiscoveredSource) => void;
  onSaveEdit?: (sourceId: string, updates: Partial<DiscoveredSource>) => void;
  className?: string;
  showDismiss?: boolean;
  /** The project's citation style, for the copied in-text citation. */
  citationStyle?: string;
}

const NUMERIC_STYLES = /^(ieee|vancouver|numeric)/i;

/**
 * In-text citation for a source card, from the shared formatter. A card has no
 * place in the reference order, so numeric styles fall back to author-date.
 */
export function formatInTextCitation(source: DiscoveredSource, style = DEFAULT_CITATION_STYLE): string {
  return formatSourceInTextCitation(source, NUMERIC_STYLES.test(style) ? "harvard" : style, 1);
}

export const ReferenceBarItem: React.FC<ReferenceBarItemProps> = ({
  source,
  isApproved,
  onToggleApproval,
  onDismiss,
  isBookmarked = false,
  onToggleBookmark,
  onEdit,
  onSaveEdit,
  citationStyle = DEFAULT_CITATION_STYLE,
  className = "",
  showDismiss = true,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Edit form state
  const [editTitle, setEditTitle] = useState(source.title || "");
  const [editAuthors, setEditAuthors] = useState(
    Array.isArray(source.authors) ? source.authors.join(", ") : ""
  );
  const [editYear, setEditYear] = useState(source.year ? String(source.year) : "");
  const [editVenue, setEditVenue] = useState(
    source.journal || source.publisher || ""
  );

  useEffect(() => {
    setEditTitle(source.title || "");
    setEditAuthors(Array.isArray(source.authors) ? source.authors.join(", ") : "");
    setEditYear(source.year ? String(source.year) : "");
    setEditVenue(source.journal || source.publisher || "");
  }, [source]);

  // Click outside to close edit popover
  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsEditing(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isEditing]);

  const rawAuthors: unknown = source.authors; // older saves may hold one string
  const authorsList: string[] = Array.isArray(rawAuthors)
    ? rawAuthors
    : typeof rawAuthors === "string" && rawAuthors.trim()
    ? [rawAuthors.trim()]
    : [];
  const namedAuthors = authorsList.filter((a) => !/^et\.?\s*al\.?$/i.test(String(a).trim()));
  const hasEtAl = namedAuthors.length < authorsList.length || namedAuthors.some((a) => parsePersonName(String(a)).etAl);
  const authorDisplay =
    namedAuthors.length > 0
      ? namedAuthors.length === 2 && !hasEtAl
        ? `${parsePersonName(String(namedAuthors[0])).family} & ${parsePersonName(String(namedAuthors[1])).family}`
        : `${parsePersonName(String(namedAuthors[0])).family}${namedAuthors.length > 1 || hasEtAl ? " et al." : ""}`
      : source.isUserUploaded
      ? "Course Materials"
      : "Unknown author";

  const venueDisplay = sourceVenueLabel(source);

  const effectiveBookmarked = source.isBookmarked ?? isBookmarked;

  const handleCopyInText = (e: React.MouseEvent) => {
    e.stopPropagation();
    const citation = formatInTextCitation(source, citationStyle);
    // "Copied" only when the clipboard actually took it.
    void navigator?.clipboard
      ?.writeText(citation)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch((err: unknown) => console.warn("Copy citation failed:", err));
  };

  const handleOpenEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(source);
    }
    setIsEditing((prev) => !prev);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const authorList = editAuthors
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);


    const updates: Partial<DiscoveredSource> = {
      title: editTitle.trim() || source.title,
      authors: authorList.length > 0 ? authorList : source.authors,
      year: editYear.trim() || (source.year ? String(source.year) : undefined),
      journal: editVenue.trim() || source.journal,
    };

    if (onSaveEdit) {
      onSaveEdit(source.id, updates);
    } else if (onEdit) {
      onEdit({ ...source, ...updates });
    }

    setIsEditing(false);
  };

  const handleRemoveOrDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isApproved) {
      onToggleApproval(source.id);
    } else if (onDismiss) {
      onDismiss(source.id);
    } else {
      onToggleApproval(source.id);
    }
  };

  const evidences = source.extractedEvidences || [];
  const [showEvidences, setShowEvidences] = useState(true);
  const hasUploadedDetails = Boolean(
    source.isUserUploaded && (source.structuredDataSummary || evidences.length > 0)
  );

  const barContent = (
    <div
      data-testid={hasUploadedDetails ? undefined : `curated-source-${source.id}`}
      className={`relative h-11 px-3.5 flex items-center justify-between gap-3 bg-[color:var(--surface-raised)] border rounded-xl shadow-2xs dark:shadow-none transition-all group ${
        isApproved
          ? "border-emerald-500/50 bg-emerald-500/[0.02] dark:border-emerald-500/30 dark:bg-emerald-500/[0.03] hover:border-emerald-500/70"
          : "border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)]"
      } ${className}`}
    >
      {/* Left Section: Badges & Single-Line Metadata */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Origin / Type Badge */}
        {source.isUserUploaded ? (
          <span className="px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 shrink-0 flex items-center gap-1">
            <FileUp className="w-2.5 h-2.5" />
            <span>Uploaded: {source.sourceFormatBadge || "DOCUMENT"}</span>
          </span>
        ) : source.sourceOrigin === "ai_research" ? (
          <span className="px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 shrink-0 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            <span>AI Research</span>
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 shrink-0 flex items-center gap-1">
            <BookOpen className="w-2.5 h-2.5" />
            <span>Ask Scholar</span>
          </span>
        )}

        {source.prescribedInBrief && (
          <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 shrink-0" data-testid="prescribed-in-brief-badge">
            Prescribed in Brief
          </span>
        )}

        {/* Primary line, title first: Title · Author (Year) · Venue · N% match */}
        <div className="flex items-center gap-1.5 text-xs text-[color:var(--text-primary)] min-w-0">
          <span className="font-semibold text-[color:var(--text-primary)] truncate min-w-0" title={source.title}>
            {source.title}
          </span>
          <span className="text-[color:var(--text-muted)] shrink-0">·</span>
          <span className="shrink-0 text-[color:var(--text-secondary)]">
            {authorDisplay}
            {source.year ? <> (<span className="font-mono">{source.year}</span>)</> : null}
          </span>
          {venueDisplay && (
            <>
              <span className="text-[color:var(--text-muted)] shrink-0 hidden sm:inline">·</span>
              <span className="text-[color:var(--text-secondary)] shrink-0 italic max-w-[160px] truncate hidden sm:inline">{venueDisplay}</span>
            </>
          )}
          {typeof source.relevanceScore === "number" && source.relevanceScore > 0 && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
              {Math.round(source.relevanceScore <= 1 ? source.relevanceScore * 100 : source.relevanceScore)}% match
            </span>
          )}
        </div>
      </div>

      {/* Right Section: Inline Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Copy In-text Citation Button */}
        <button
          type="button"
          onClick={handleCopyInText}
          aria-label="Copy citation"
          title={`Copy in-text citation: ${formatInTextCitation(source, citationStyle)}`}
          className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer relative"
        >
          {copied ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 px-1">
              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Copied</span>
            </span>
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Bookmark Toggle (Optional/Compact) */}
        {onToggleBookmark && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleBookmark(source.id);
            }}
            aria-label={effectiveBookmarked ? "Remove bookmark" : "Bookmark this source"}
            title={effectiveBookmarked ? "Bookmarked" : "Bookmark this source"}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              effectiveBookmarked
                ? "text-amber-500 hover:text-amber-600 dark:text-amber-400"
                : "text-[color:var(--text-muted)] hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-[color:var(--surface-hover)]"
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${effectiveBookmarked ? "fill-amber-500 dark:fill-amber-400" : ""}`} />
          </button>
        )}

        {/* Inline Edit Icon Button */}
        <button
          type="button"
          onClick={handleOpenEdit}
          aria-label="Edit reference"
          title="Edit reference metadata"
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isEditing
              ? "bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)]"
              : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
          }`}
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>

        {/* Add / Added Button Pill */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleApproval(source.id);
          }}
          aria-label={isApproved ? `✓ Added: remove ${source.title} from approved` : `Add Source: approve ${source.title}`}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
            isApproved
              ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-neutral-950 hover:bg-emerald-700"
              : "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 active:scale-[0.99]"
          }`}
        >
          {isApproved ? (
            <>
              <Check className="w-3 h-3 text-white dark:text-neutral-950" />
              <span>✓ Added</span>
            </>
          ) : (
            <>
              <Plus className="w-3 h-3" />
              <span>Add Source</span>
            </>
          )}
        </button>

        {/* Remove Button (`×`) when approved or dismissible */}
        {showDismiss && (isApproved || onDismiss) && (
          <button
            type="button"
            onClick={handleRemoveOrDismiss}
            aria-label={isApproved ? `Remove ${source.title}` : `Dismiss ${source.title}`}
            title={isApproved ? "Remove from approved references" : "Dismiss source"}
            className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Lightweight Inline Popover for Quick Metadata Editing */}
      {isEditing && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-12 z-50 p-4 w-80 sm:w-96 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-2">
            <span className="text-xs font-semibold text-[color:var(--text-primary)]">
              Edit Reference Details
            </span>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="p-1.5 rounded-md text-[color:var(--text-muted)] hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          <form onSubmit={handleSaveEdit} className="space-y-2.5 text-xs">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[color:var(--text-muted)]">
                Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]/50 text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder="Title of paper or book"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-[color:var(--text-muted)]">
                  Author(s)
                </label>
                <input
                  type="text"
                  value={editAuthors}
                  onChange={(e) => setEditAuthors(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]/50 text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  placeholder="Smith, J., Doe, A."
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[color:var(--text-muted)]">
                  Year
                </label>
                <input
                  type="text"
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]/50 text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  placeholder="2024"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[color:var(--text-muted)]">
                Venue / Journal / Publisher
              </label>
              <input
                type="text"
                value={editVenue}
                onChange={(e) => setEditVenue(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]/50 text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder="Journal or publisher name"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 cursor-pointer shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );

  if (hasUploadedDetails) {
    return (
      <div data-testid={`curated-source-${source.id}`} className="space-y-1.5">
        {barContent}

        {source.structuredDataSummary && (
          <div className="px-3.5 py-2 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] text-xs flex items-start gap-2">
            <Table className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[color:var(--text-muted)]" />
            <span className="leading-relaxed">{source.structuredDataSummary}</span>
          </div>
        )}

        {evidences.length > 0 && (
          <div className="p-3 rounded-xl bg-[color:var(--surface-inset)]/50 border border-[color:var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowEvidences(!showEvidences)}
                className="py-1 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Quote className="w-3 h-3 text-[color:var(--text-muted)]" />
                <span>Extracted Content & Used References ({evidences.length})</span>
                {showEvidences ? (
                  <ChevronUp className="w-3 h-3 text-[color:var(--text-muted)]" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-[color:var(--text-muted)]" />
                )}
              </button>
            </div>

            {showEvidences && (
              <div className="space-y-1.5 pt-1">
                {evidences.map((ev, eIdx) => (
                  <div
                    key={ev.id || eIdx}
                    className="p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-medium px-1.5 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">
                        📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}
                      </span>
                      {ev.claim && (
                        <span className="text-xs text-[color:var(--text-muted)] truncate max-w-xs">
                          {ev.claim}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-[color:var(--text-primary)] text-xs leading-relaxed italic">
                      "{ev.excerpt}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return barContent;
};

export default ReferenceBarItem;
