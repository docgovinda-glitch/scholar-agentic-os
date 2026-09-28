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
  FileText,
  Table,
  Presentation,
  Globe,
  FileUp,
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
  const [showEvidences, setShowEvidences] = useState(true);

  const authorDisplay =
    source.authors && source.authors.length > 0
      ? source.authors.slice(0, 3).join(", ") + (source.authors.length > 3 ? " et al." : "")
      : source.isUserUploaded
      ? "Course Materials / Uploaded Source"
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
            {source.isUserUploaded ? (
              <span className="px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25 flex items-center gap-1 text-[10px]">
                <FileUp className="w-3 h-3" />
                <span>Uploaded: {source.sourceFormatBadge || "Course Material"}</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full font-medium uppercase tracking-wider bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                {source.type}
              </span>
            )}
            <span className="text-neutral-400 dark:text-neutral-500 font-mono font-medium">
              {source.year}
            </span>
            {parseInt(source.year || "0", 10) >= 2026 && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/60">
                2026 Recent
              </span>
            )}
            {source.roleInAssignment && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                source.roleInAssignment === "Empirical evidence"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40"
                  : source.roleInAssignment === "Theoretical framework"
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/40"
                  : source.roleInAssignment === "Comparative evidence"
                  ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200/60 dark:border-sky-800/40"
                  : source.roleInAssignment === "Core theory"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40"
                  : "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/40"
              }`}>
                {source.roleInAssignment}
              </span>
            )}
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
            {source.relevanceCategory && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                source.relevanceCategory === "Very High"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border-blue-300 dark:border-blue-700"
              }`}>
                {source.relevanceCategory}
              </span>
            )}
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
          {source.isUserUploaded && evidences.length > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/30 font-medium font-mono text-[10px]">
              {evidences.length} Extracted Excerpt(s)
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

        {/* Structured Data Summary for Uploaded Spreadsheets */}
        {source.structuredDataSummary && (
          <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 text-xs flex items-start gap-2">
            <Table className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <span className="leading-relaxed">{source.structuredDataSummary}</span>
          </div>
        )}

        {/* Extracted Evidence Layer for User Uploaded Materials */}
        {source.isUserUploaded && evidences.length > 0 && (
          <div className="pt-1 border-t border-neutral-100 dark:border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowEvidences(!showEvidences)}
                className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Quote className="w-3 h-3 text-blue-500" />
                <span>Extracted Content & Used References ({evidences.length})</span>
                {showEvidences ? <ChevronUp className="w-3 h-3 text-neutral-400" /> : <ChevronDown className="w-3 h-3 text-neutral-400" />}
              </button>
              <span className="text-[10px] text-neutral-400 font-mono">Provenance & Evidence</span>
            </div>

            {showEvidences && (
              <div className="space-y-2 pt-1">
                {evidences.map((ev, eIdx) => (
                  <div
                    key={ev.id || eIdx}
                    className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/10 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
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
                    {ev.context && ev.context !== ev.excerpt && (
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-normal">
                        <span className="font-semibold text-neutral-600 dark:text-neutral-300">Context: </span>
                        {ev.context}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Abstract Expander (for Academic sources) */}
        {!source.isUserUploaded && source.abstract && (
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <Sparkles className="w-3 h-3 text-neutral-400" />
              <span>How it supports your assignment prompt</span>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="text-purple-600 dark:text-purple-400 normal-case font-medium">Role: {source.roleInAssignment || "Empirical evidence"}</span>
            </div>
            {source.questionAlignment?.evidenceType && (
              <span className="text-[10px] font-mono text-neutral-400">
                Type: {source.questionAlignment.evidenceType}
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
            {source.suggestedUse || source.mainFinding}
          </p>
          {source.questionAlignment?.supportsPart && (
            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium pt-0.5">
              🎯 {source.questionAlignment.supportsPart}
            </p>
          )}
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
              <span>{source.doi ? `DOI: ${source.doi}` : source.isUserUploaded ? "Open Linked Resource" : "View source article"}</span>
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
          className="text-xs text-neutral-400 hover:text-red-500 dark:hover:text-red-400 py-1.5 px-2 rounded-lg hover:bg-red-500/10 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5" />
          <span>{source.isUserUploaded ? "Remove from project" : "Dismiss"}</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleApproval(source.id)}
          aria-label={isApproved ? `Remove ${source.title} from approved` : `Approve ${source.title}`}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
            isApproved
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100"
          }`}
        >
          {isApproved ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Approved</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Approve Source</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
