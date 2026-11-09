import React, { useState, useRef, useEffect } from "react";
import { sourceVenueLabel } from "./services/sourceDisplay";
import type { DiscoveredSource } from "./types";
import {
  Check,
  Plus,
  Copy,
  Edit2,
  X,
  FileUp,
  Bookmark,
  ExternalLink,
  BookOpen,
  Table,
  Quote,
  ChevronUp,
  ChevronDown,
  Sparkles,
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
}

export function formatInTextCitation(source: DiscoveredSource): string {
  const year = source.year || "n.d.";
  if (!source.authors || source.authors.length === 0) {
    const fallbackTitle = source.title ? source.title.split(" ").slice(0, 3).join(" ") : "Source";
    return `(${fallbackTitle}, ${year})`;
  }

  const parseLastName = (authorStr: string) => {
    const trimmed = authorStr.trim();
    if (trimmed.includes(",")) {
      return trimmed.split(",")[0].trim();
    }
    const parts = trimmed.split(/\s+/);
    return parts[parts.length - 1];
  };

  const firstAuthor = parseLastName(source.authors[0]);
  if (source.authors.length === 1) {
    return `(${firstAuthor}, ${year})`;
  }
  if (source.authors.length === 2) {
    const secondAuthor = parseLastName(source.authors[1]);
    return `(${firstAuthor} & ${secondAuthor}, ${year})`;
  }
  return `(${firstAuthor} et al., ${year})`;
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

  const rawAuthors = (source as any).authors;
  const authorsList: string[] = Array.isArray(rawAuthors)
    ? rawAuthors
    : typeof rawAuthors === "string" && rawAuthors.trim()
    ? [rawAuthors.trim()]
    : [];
  const authorDisplay =
    authorsList.length > 0
      ? authorsList.slice(0, 3).join(", ") + (authorsList.length > 3 ? " et al." : "")
      : source.isUserUploaded
      ? "Course Materials"
      : "Unknown author";

  const venueDisplay = sourceVenueLabel(source);

  const effectiveBookmarked = source.isBookmarked ?? isBookmarked;

  const handleCopyInText = (e: React.MouseEvent) => {
    e.stopPropagation();
    const citation = formatInTextCitation(source);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(citation).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
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

    const yearNum = parseInt(editYear.trim(), 10) || undefined;

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
      className={`relative h-11 px-3.5 flex items-center justify-between gap-3 bg-white dark:bg-ink-750 border rounded-xl shadow-2xs dark:shadow-none transition-all group ${
        isApproved
          ? "border-emerald-500/50 bg-emerald-500/[0.02] dark:border-emerald-500/30 dark:bg-emerald-500/[0.03] hover:border-emerald-500/70"
          : "border-neutral-200/80 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20"
      } ${className}`}
    >
      {/* Left Section: Badges & Single-Line Metadata */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Origin / Type Badge */}
        {source.isUserUploaded ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 shrink-0 flex items-center gap-1">
            <FileUp className="w-2.5 h-2.5" />
            <span>Uploaded: {source.sourceFormatBadge || "DOCUMENT"}</span>
          </span>
        ) : source.sourceOrigin === "ai_research" ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 shrink-0 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            <span>AI Research</span>
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 shrink-0 flex items-center gap-1">
            <BookOpen className="w-2.5 h-2.5" />
            <span>Ask Scholar</span>
          </span>
        )}

        {/* Primary Line: [Authors, Year] · [Venue] · [Title] */}
        <div className="flex items-center gap-1.5 text-xs text-neutral-800 dark:text-neutral-200 truncate min-w-0">
          <span className="font-semibold shrink-0 text-neutral-900 dark:text-white flex items-center gap-1">
            <span>{authorDisplay}</span>
            {source.year ? (
              <span className="font-normal text-neutral-500 dark:text-neutral-400">
                (<span className="font-mono">{source.year}</span>)
              </span>
            ) : null}
          </span>
          <span className="text-neutral-400 dark:text-neutral-500 shrink-0">·</span>
          {venueDisplay && (
            <>
              <span className="text-neutral-600 dark:text-neutral-400 shrink-0 italic max-w-[140px] truncate hidden sm:inline">
                {venueDisplay}
              </span>
              <span className="text-neutral-400 dark:text-neutral-500 shrink-0 hidden sm:inline">·</span>
            </>
          )}
          <span
            className="text-neutral-700 dark:text-neutral-300 font-medium truncate"
            title={source.title}
          >
            {source.title}
          </span>
        </div>
      </div>

      {/* Right Section: Inline Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Copy In-text Citation Button */}
        <button
          type="button"
          onClick={handleCopyInText}
          aria-label="Copy citation"
          title={`Copy in-text citation: ${formatInTextCitation(source)}`}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer relative"
        >
          {copied ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 px-1">
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
                : "text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5"
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
              ? "bg-neutral-200 dark:bg-white/20 text-neutral-900 dark:text-white"
              : "text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5"
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
          aria-label={isApproved ? `Remove ${source.title} from approved` : `Approve ${source.title}`}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
            isApproved
              ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-neutral-950 hover:bg-emerald-700"
              : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99]"
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
              <span>+ Add Source</span>
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
            className="p-1 rounded-lg text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Lightweight Inline Popover for Quick Metadata Editing */}
      {isEditing && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-12 z-50 p-4 w-80 sm:w-96 bg-white dark:bg-ink-750 border border-neutral-200/90 dark:border-white/15 rounded-2xl shadow-xl space-y-3 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-2">
            <span className="text-xs font-semibold text-neutral-900 dark:text-white">
              Edit Reference Details
            </span>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          <form onSubmit={handleSaveEdit} className="space-y-2.5 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/15 bg-neutral-50/50 dark:bg-white/5 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder="Title of paper or book"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  Author(s)
                </label>
                <input
                  type="text"
                  value={editAuthors}
                  onChange={(e) => setEditAuthors(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/15 bg-neutral-50/50 dark:bg-white/5 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  placeholder="Smith, J., Doe, A."
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  Year
                </label>
                <input
                  type="text"
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/15 bg-neutral-50/50 dark:bg-white/5 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  placeholder="2024"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Venue / Journal / Publisher
              </label>
              <input
                type="text"
                value={editVenue}
                onChange={(e) => setEditVenue(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/15 bg-neutral-50/50 dark:bg-white/5 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                placeholder="Journal or publisher name"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-white/5">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 cursor-pointer shadow-xs"
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
          <div className="px-3.5 py-2 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs flex items-start gap-2">
            <Table className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neutral-500" />
            <span className="leading-relaxed">{source.structuredDataSummary}</span>
          </div>
        )}

        {evidences.length > 0 && (
          <div className="p-3 rounded-xl bg-neutral-50/50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowEvidences(!showEvidences)}
                className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Quote className="w-3 h-3 text-neutral-400" />
                <span>Extracted Content & Used References ({evidences.length})</span>
                {showEvidences ? (
                  <ChevronUp className="w-3 h-3 text-neutral-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-neutral-400" />
                )}
              </button>
            </div>

            {showEvidences && (
              <div className="space-y-1.5 pt-1">
                {evidences.map((ev, eIdx) => (
                  <div
                    key={ev.id || eIdx}
                    className="p-2.5 rounded-lg bg-white dark:bg-ink-750 border border-neutral-200/60 dark:border-white/10 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-400">
                        📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}
                      </span>
                      {ev.claim && (
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                          {ev.claim}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-neutral-800 dark:text-neutral-200 text-xs leading-relaxed italic">
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
