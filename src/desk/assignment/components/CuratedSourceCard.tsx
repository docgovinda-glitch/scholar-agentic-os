import React, { useState } from "react";
import type { DiscoveredSource } from "../types";
import {
  Check,
  Plus,
  Star,
  ChevronDown,
  ChevronUp,
  Quote,
  Table,
  FileUp,
} from "lucide-react";

export interface CuratedSourceCardProps {
  source: DiscoveredSource;
  isApproved: boolean;
  onToggleApproval: (sourceId: string) => void;
  onDismiss?: (sourceId: string) => void;
  isReplacing?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: (sourceId: string) => void;
}

export const CuratedSourceCard: React.FC<CuratedSourceCardProps> = ({
  source,
  isApproved,
  onToggleApproval,
  isBookmarked = false,
  onToggleBookmark,
}) => {
  const [showEvidences, setShowEvidences] = useState(true);

  const authorDisplay =
    source.authors && source.authors.length > 0
      ? source.authors.slice(0, 3).join(", ") + (source.authors.length > 3 ? " et al." : "")
      : source.isUserUploaded
      ? "Course Materials"
      : "Scholarly Author";

  const venueDisplay =
    source.journal ||
    source.publisher ||
    (source.type === "journal"
      ? "Academic Journal"
      : source.type === "book"
      ? "University Press"
      : source.type === "conference"
      ? "Conference Proceedings"
      : source.type === "institutional"
      ? "Institutional Research"
      : "Scholarly Publication");

  const effectiveBookmarked = source.isBookmarked ?? isBookmarked;
  const evidences = source.extractedEvidences || [];

  // Concise 1-2 sentence relevance snippet
  const relevanceSnippet =
    source.suggestedUse ||
    source.mainFinding ||
    source.questionAlignment?.supportsPart ||
    source.abstract ||
    "Contextually matched scholarly evidence to support your thesis arguments and claims.";

  return (
    <div
      data-testid={`curated-source-${source.id}`}
      className={`rounded-2xl p-5 border transition-all duration-200 flex flex-col justify-between gap-4 ${
        isApproved
          ? "border-emerald-500/50 bg-emerald-500/[0.02] dark:border-emerald-500/30 dark:bg-emerald-500/[0.03] shadow-xs dark:shadow-none hover:border-emerald-500/70"
          : "border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] hover:border-neutral-300 dark:hover:border-white/20 shadow-xs dark:shadow-none"
      }`}
    >
      <div className="space-y-2">
        {/* Minimal Header Strip */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {source.isUserUploaded ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 flex items-center gap-1">
                <FileUp className="w-3 h-3" />
                <span>Uploaded: {source.sourceFormatBadge || "Course Material"}</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 uppercase tracking-wider">
                {source.type}
              </span>
            )}

            {source.roleInAssignment && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                {source.roleInAssignment}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onToggleBookmark && (
              <button
                type="button"
                onClick={() => onToggleBookmark(source.id)}
                aria-label={effectiveBookmarked ? "Remove bookmark" : "Bookmark this source"}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  effectiveBookmarked
                    ? "text-amber-500 hover:text-amber-600 bg-amber-500/10"
                    : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${effectiveBookmarked ? "fill-amber-500" : ""}`} />
              </button>
            )}
          </div>
        </div>

        {/* Clean Typographic Title */}
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2">
          {source.title}
        </h3>

        {/* Authors & Date */}
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{authorDisplay}</span>
          <span className="mx-1 text-neutral-300 dark:text-neutral-600">·</span>
          <span>{venueDisplay}</span>
          <span className="mx-1 text-neutral-300 dark:text-neutral-600">·</span>
          <span className="font-mono">{source.year}</span>
        </p>

        {/* Concise 1-2 sentence relevance snippet */}
        <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2 mt-2 leading-relaxed">
          {relevanceSnippet}
        </p>

        {/* Structured Data Summary for Uploaded Spreadsheets */}
        {source.structuredDataSummary && (
          <div className="px-3 py-2 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs flex items-start gap-2 mt-1">
            <Table className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neutral-500" />
            <span className="leading-relaxed">{source.structuredDataSummary}</span>
          </div>
        )}

        {/* Extracted Evidence Layer for User Uploaded Materials */}
        {source.isUserUploaded && evidences.length > 0 && (
          <div className="pt-2 border-t border-neutral-100 dark:border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowEvidences(!showEvidences)}
                className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Quote className="w-3 h-3 text-neutral-400" />
                <span>Extracted Content & Used References ({evidences.length})</span>
                {showEvidences ? <ChevronUp className="w-3 h-3 text-neutral-400" /> : <ChevronDown className="w-3 h-3 text-neutral-400" />}
              </button>
            </div>

            {showEvidences && (
              <div className="space-y-1.5 pt-1">
                {evidences.map((ev, eIdx) => (
                  <div
                    key={ev.id || eIdx}
                    className="p-2.5 rounded-xl bg-neutral-50/70 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/10 text-xs space-y-1"
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

      {/* Single Primary Action: Clean pill toggle (+ Add Source / ✓ Added) */}
      <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => onToggleApproval(source.id)}
          aria-label={isApproved ? `Remove ${source.title} from approved` : `Approve ${source.title}`}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold active:scale-[0.99] transition-all cursor-pointer flex items-center gap-1.5 shadow-xs dark:shadow-none ${
            isApproved
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90"
          }`}
        >
          {isApproved ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>✓ Added</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Source</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
