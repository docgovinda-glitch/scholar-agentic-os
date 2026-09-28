import React, { useState } from "react";
import type { DiscoveredSource } from "../types";
import {
  Check,
  Plus,
  X,
  ExternalLink,
  Star,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";

export interface CuratedSourceCompactViewProps {
  sources: DiscoveredSource[];
  approvedSourceIds: string[];
  bookmarkedSourceIds: string[];
  onToggleApproval: (sourceId: string) => void;
  onDismiss: (sourceId: string) => void;
  onToggleBookmark: (sourceId: string) => void;
}

export const CuratedSourceCompactView: React.FC<CuratedSourceCompactViewProps> = ({
  sources,
  approvedSourceIds,
  bookmarkedSourceIds,
  onToggleApproval,
  onDismiss,
  onToggleBookmark,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-1.5" data-testid="curated-sources-compact-view">
      {sources.map((source) => {
        const isApproved = approvedSourceIds.includes(source.id);
        const isBookmarked = bookmarkedSourceIds.includes(source.id) || !!source.isBookmarked;
        const isExpanded = expandedId === source.id;

        const leadAuthor =
          source.authors && source.authors.length > 0
            ? source.authors[0] + (source.authors.length > 1 ? " et al." : "")
            : "Unknown";

        return (
          <div
            key={source.id}
            data-testid={`curated-source-compact-${source.id}`}
            className={`rounded-xl border transition-all duration-150 p-2.5 sm:px-4 sm:py-2.5 ${
              isApproved
                ? "border-emerald-500/50 bg-emerald-500/[0.03] dark:border-emerald-500/40 dark:bg-emerald-500/[0.04]"
                : "border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] hover:border-neutral-300 dark:hover:border-white/20"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              {/* Left: Quick Approve button + Title + Meta */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onToggleApproval(source.id)}
                  aria-label={isApproved ? "Remove approval" : "Approve source"}
                  className={`w-6 h-6 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center ${
                    isApproved
                      ? "bg-emerald-600 text-white"
                      : "border border-neutral-300 dark:border-white/20 text-transparent hover:border-neutral-400"
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs text-neutral-900 dark:text-white truncate max-w-md">
                      {source.title}
                    </span>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono shrink-0">
                      {leadAuthor} ({source.year})
                    </span>
                    {source.isUserUploaded ? (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300">
                        Uploaded: {source.sourceFormatBadge || "File"}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.2 rounded uppercase tracking-wider bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                        {source.type}
                      </span>
                    )}
                    {source.roleInAssignment && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-medium border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 hidden sm:inline-block">
                        {source.roleInAssignment}
                      </span>
                    )}
                    {source.methodology && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200/40 dark:border-purple-800/20 hidden md:inline-block">
                        {source.methodology}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Score + Bookmark + Details Toggle + Dismiss */}
              <div className="flex items-center gap-2 shrink-0">
                {source.relevanceCategory && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold border hidden sm:inline-block ${
                    source.relevanceCategory === "Very High"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border-blue-300 dark:border-blue-700"
                  }`}>
                    {source.relevanceCategory}
                  </span>
                )}
                <span className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
                  {source.relevanceScore}%
                </span>

                <button
                  type="button"
                  onClick={() => onToggleBookmark(source.id)}
                  aria-label="Bookmark"
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    isBookmarked
                      ? "text-amber-500 bg-amber-500/10"
                      : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-white/5"
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${isBookmarked ? "fill-amber-500" : ""}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : source.id)}
                  aria-label="Expand details"
                  className="p-1 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
                >
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {(source.doi || source.url) && (
                  <a
                    href={source.url || `https://doi.org/${source.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="External Link"
                    className="p-1 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => onDismiss(source.id)}
                  title={source.isUserUploaded ? "Remove from project" : "Dismiss"}
                  className="p-1 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Accordion content */}
            {isExpanded && (
              <div className="mt-2.5 pt-2.5 border-t border-neutral-100 dark:border-white/5 space-y-2 text-xs">
                {source.isUserUploaded && source.extractedEvidences && source.extractedEvidences.length > 0 && (
                  <div className="bg-neutral-50 dark:bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-200/60 dark:border-white/5 space-y-1.5">
                    <span className="font-semibold text-neutral-900 dark:text-white block">
                      Extracted Evidence ({source.extractedEvidences.length}):
                    </span>
                    {source.extractedEvidences.map((ev, eIdx) => (
                      <div key={ev.id || eIdx} className="p-2 rounded bg-white dark:bg-[#1C1C1E] text-xs">
                        <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 font-semibold block mb-0.5">
                          📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}
                        </span>
                        <p className="italic text-neutral-800 dark:text-neutral-200">"{ev.excerpt}"</p>
                      </div>
                    ))}
                  </div>
                )}
                {source.structuredDataSummary && (
                  <p className="text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 p-2 rounded-lg text-[11px]">
                    {source.structuredDataSummary}
                  </p>
                )}
                <div className="flex items-start gap-2 bg-neutral-50 dark:bg-white/[0.02] p-2.5 rounded-lg border border-neutral-200/60 dark:border-white/5">
                  <Sparkles className="w-3.5 h-3.5 text-neutral-400 mt-0.5 shrink-0" />
                  <p className="text-neutral-700 dark:text-neutral-300">
                    <span className="font-semibold text-neutral-900 dark:text-white mr-1">Rationale:</span>
                    {source.suggestedUse || source.mainFinding}
                  </p>
                </div>
                {!source.isUserUploaded && source.abstract && (
                  <p className="text-neutral-600 dark:text-neutral-400 italic bg-neutral-50 dark:bg-white/[0.02] p-2.5 rounded-lg border border-neutral-200/60 dark:border-white/5">
                    "{source.abstract}"
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
