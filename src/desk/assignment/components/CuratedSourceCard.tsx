import React from "react";
import type { DiscoveredSource } from "../types";
import { Check, Plus, X, ExternalLink, Sparkles, BookOpen } from "lucide-react";

export interface CuratedSourceCardProps {
  source: DiscoveredSource;
  isApproved: boolean;
  onToggleApproval: (sourceId: string) => void;
  onDismiss: (sourceId: string) => void;
  isReplacing?: boolean;
}

export const CuratedSourceCard: React.FC<CuratedSourceCardProps> = ({
  source,
  isApproved,
  onToggleApproval,
  onDismiss,
  isReplacing = false,
}) => {
  const authorDisplay =
    source.authors && source.authors.length > 0
      ? source.authors.slice(0, 3).join(", ") + (source.authors.length > 3 ? " et al." : "")
      : "Scholarly Author";

  const venueDisplay = source.journal || (source.type === "journal" ? "Academic Journal" : source.type === "book" ? "University Press" : "Scholarly Publication");

  return (
    <div
      data-testid={`curated-source-${source.id}`}
      className={`rounded-2xl p-5 border transition-all duration-200 flex flex-col justify-between gap-4 ${
        isApproved
          ? "border-emerald-500/50 bg-emerald-500/[0.03] dark:border-emerald-500/40 dark:bg-emerald-500/[0.04] shadow-xs"
          : "border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] hover:border-neutral-300 dark:hover:border-white/20 shadow-xs"
      }`}
    >
      <div className="space-y-3">
        {/* Header Tags */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-0.5 rounded-full font-medium uppercase tracking-wider bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
              {source.type}
            </span>
            <span className="text-neutral-400 dark:text-neutral-500 font-mono">
              {source.year}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {source.relevanceScore && (
              <span className="text-neutral-500 dark:text-neutral-400 font-mono font-medium">
                {source.relevanceScore}% match
              </span>
            )}
            {isApproved && (
              <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Approved</span>
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-white leading-snug tracking-tight">
          {source.title}
        </h3>

        {/* Authors & Publication Venue */}
        <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-normal">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{authorDisplay}</span>
          <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">·</span>
          <span className="italic">{venueDisplay}</span>
        </p>

        {/* 2-Sentence Rationale Summarizing Assignment Support */}
        <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <Sparkles className="w-3 h-3 text-neutral-400" />
            <span>How it supports your assignment prompt</span>
          </div>
          <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
            {source.suggestedUse || source.mainFinding}
          </p>
        </div>

        {/* DOI / External Reference Link */}
        {(source.doi || source.url) && (
          <div className="pt-0.5">
            <a
              href={source.url || `https://doi.org/${source.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              <span>{source.doi ? `DOI: ${source.doi}` : "View source article"}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onDismiss(source.id)}
          disabled={isReplacing}
          aria-label={`Dismiss or replace ${source.title}`}
          className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          <span>Dismiss (Replace)</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleApproval(source.id)}
          aria-label={isApproved ? `Remove ${source.title} from approved sources` : `Approve ${source.title}`}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
            isApproved
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : "bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 active:scale-[0.99]"
          }`}
        >
          {isApproved ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Approved (Include)</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Approve (Include)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
