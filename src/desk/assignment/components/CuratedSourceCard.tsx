import React, { useState } from "react";
import type { DiscoveredSource } from "../types";
import {
  Check,
  Plus,
  X,
  ExternalLink,
  Sparkles,
  BookOpen,
  Star,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Quote,
  Unlock,
} from "lucide-react";

export interface CuratedSourceCardProps {
  source: DiscoveredSource;
  isApproved: boolean;
  onToggleApproval: (sourceId: string) => void;
  onDismiss: (sourceId: string) => void;
  isReplacing?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: (sourceId: string) => void;
}

export const CuratedSourceCard: React.FC<CuratedSourceCardProps> = ({
  source,
  isApproved,
  onToggleApproval,
  onDismiss,
  isReplacing = false,
  isBookmarked = false,
  onToggleBookmark,
}) => {
  const [showAbstract, setShowAbstract] = useState(false);

  const authorDisplay =
    source.authors && source.authors.length > 0
      ? source.authors.slice(0, 3).join(", ") + (source.authors.length > 3 ? " et al." : "")
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
        {/* Header Tags: Type, Year, Credibility, Match % and Bookmark */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full font-medium uppercase tracking-wider bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
              {source.type}
            </span>
            <span className="text-neutral-400 dark:text-neutral-500 font-mono">
              {source.year}
            </span>
            {source.isVerifiedAcademic !== false && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700/40 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Verified Academic</span>
              </span>
            )}
            {source.isOpenAccess && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200/60 dark:border-amber-700/40 flex items-center gap-1">
                <Unlock className="w-2.5 h-2.5" />
                <span>Open Access</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {source.relevanceScore && (
              <span className="text-neutral-600 dark:text-neutral-300 font-mono font-semibold text-xs">
                {source.relevanceScore}% match
              </span>
            )}
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
          {source.volumeIssue && (
            <span className="text-neutral-400 dark:text-neutral-500 ml-1">({source.volumeIssue})</span>
          )}
        </p>

        {/* Metrics & Methodology Pill Strip */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {source.methodology && (
            <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/30 font-medium">
              {source.methodology}
            </span>
          )}
          {source.citationCount !== undefined && (
            <span className="px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 font-mono flex items-center gap-1">
              <Quote className="w-2.5 h-2.5" />
              <span>{source.citationCount.toLocaleString()} citations</span>
              {source.citationImpact && (
                <span className="text-neutral-400 dark:text-neutral-500">· {source.citationImpact}</span>
              )}
            </span>
          )}
        </div>

        {/* Key Concepts / Themes */}
        {source.keyConcepts && source.keyConcepts.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {source.keyConcepts.slice(0, 4).map((concept, idx) => (
              <span
                key={idx}
                className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400"
              >
                #{concept}
              </span>
            ))}
          </div>
        )}

        {/* Abstract Expander */}
        {source.abstract && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAbstract(!showAbstract)}
              className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>{showAbstract ? "Hide abstract" : "Read scholarly abstract"}</span>
              {showAbstract ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showAbstract && (
              <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-white/[0.02] p-3 rounded-xl border border-neutral-200/50 dark:border-white/5 leading-relaxed italic animate-in fade-in duration-150">
                "{source.abstract}"
              </p>
            )}
          </div>
        )}

        {/* How it supports assignment prompt */}
        <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-1.5">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <Sparkles className="w-3 h-3 text-neutral-400" />
            <span>How it supports your assignment prompt</span>
          </div>
          <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
            {source.suggestedUse || source.mainFinding}
          </p>
        </div>

        {/* DOI / External Link */}
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

