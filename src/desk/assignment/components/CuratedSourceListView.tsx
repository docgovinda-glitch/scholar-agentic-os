import React, { useState } from "react";
import type { DiscoveredSource } from "../types";
import {
  Check,
  Plus,
  X,
  ExternalLink,
  Sparkles,
  Star,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Quote,
  Unlock,
  Copy,
  CheckCircle2,
  FileUp,
  Table,
} from "lucide-react";

export interface CuratedSourceListViewProps {
  sources: DiscoveredSource[];
  approvedSourceIds: string[];
  bookmarkedSourceIds: string[];
  onToggleApproval: (sourceId: string) => void;
  onDismiss: (sourceId: string) => void;
  onToggleBookmark: (sourceId: string) => void;
}

export const CuratedSourceListView: React.FC<CuratedSourceListViewProps> = ({
  sources,
  approvedSourceIds,
  bookmarkedSourceIds,
  onToggleApproval,
  onDismiss,
  onToggleBookmark,
}) => {
  const [expandedAbstractIds, setExpandedAbstractIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleAbstract = (id: string) => {
    setExpandedAbstractIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyCitation = (source: DiscoveredSource) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(source.citation);
      setCopiedId(source.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="space-y-3" data-testid="curated-sources-list-view">
      {sources.map((source) => {
        const isApproved = approvedSourceIds.includes(source.id);
        const isBookmarked = bookmarkedSourceIds.includes(source.id) || !!source.isBookmarked;
        const isExpanded = !!expandedAbstractIds[source.id];
        const evidences = source.extractedEvidences || [];

        const authorDisplay =
          source.authors && source.authors.length > 0
            ? source.authors.join(", ")
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
            : "Institutional Report");

        return (
          <article
            key={source.id}
            data-testid={`curated-source-list-item-${source.id}`}
            className={`p-4 sm:p-5 rounded-2xl border transition-all duration-150 ${
              isApproved
                ? "border-emerald-500/50 bg-emerald-500/[0.03] dark:border-emerald-500/40 dark:bg-emerald-500/[0.04]"
                : "border-neutral-200/80 dark:border-white/10 bg-white dark:bg-ink-750 hover:border-neutral-300 dark:hover:border-white/20"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-2 flex-1 min-w-0">
                {/* Badges line */}
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  {source.isUserUploaded ? (
                    <span className="px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25 flex items-center gap-1 text-[10px]">
                      <FileUp className="w-2.5 h-2.5" />
                      <span>Uploaded: {source.sourceFormatBadge || "Course Material"}</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full font-medium uppercase tracking-wider bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 text-[10px]">
                      {source.type}
                    </span>
                  )}
                  <span className="font-mono font-medium text-neutral-500 dark:text-neutral-400">
                    {source.year}
                  </span>
                  {parseInt(source.year || "0", 10) >= 2026 && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/60">
                      2026 Recent
                    </span>
                  )}
                  {source.roleInAssignment && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                      {source.roleInAssignment}
                    </span>
                  )}
                  {source.isVerifiedAcademic !== false && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
                      <ShieldCheck className="w-2.5 h-2.5 text-neutral-500" />
                      <span>Verified Academic</span>
                    </span>
                  )}
                  {source.methodology && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                      {source.methodology}
                    </span>
                  )}
                  {source.citationCount !== undefined && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
                      <Quote className="w-2.5 h-2.5 text-neutral-400" />
                      <span>{source.citationCount.toLocaleString()} cit.</span>
                    </span>
                  )}
                  {source.isUserUploaded && evidences.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                      {evidences.length} Excerpt(s) Extracted
                    </span>
                  )}
                  {source.isOpenAccess && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
                      <Unlock className="w-2.5 h-2.5 text-neutral-500" />
                      <span>Open Access</span>
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-base font-semibold text-neutral-900 dark:text-white leading-snug tracking-tight">
                  {source.title}
                </h3>

                {/* Bibliographic Citation Details */}
                <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-normal">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">{authorDisplay}</span>
                  <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">·</span>
                  <span className="italic font-medium">{venueDisplay}</span>
                  {source.volumeIssue && (
                    <span className="text-neutral-500 dark:text-neutral-400 ml-1">({source.volumeIssue})</span>
                  )}
                </p>

                {/* Structured Data Summary for Uploaded Spreadsheets */}
                {source.structuredDataSummary && (
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 text-xs flex items-start gap-2">
                    <Table className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{source.structuredDataSummary}</span>
                  </div>
                )}

                {/* Extracted Evidence Layer for User Uploaded Materials */}
                {source.isUserUploaded && evidences.length > 0 && (
                  <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      <span className="flex items-center gap-1">
                        <Quote className="w-3 h-3 text-blue-500" />
                        <span>Extracted Content & Used References ({evidences.length})</span>
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">Provenance & Evidence</span>
                    </div>
                    <div className="space-y-1.5">
                      {evidences.map((ev, eIdx) => (
                        <div key={ev.id || eIdx} className="p-2.5 rounded-lg bg-white dark:bg-ink-750 border border-neutral-200/60 dark:border-white/10 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}
                            </span>
                            {ev.claim && <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{ev.claim}</span>}
                          </div>
                          <p className="italic text-neutral-800 dark:text-neutral-200">"{ev.excerpt}"</p>
                          {ev.context && ev.context !== ev.excerpt && (
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              <span className="font-semibold text-neutral-600 dark:text-neutral-300">Context: </span>{ev.context}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assignment Alignment Rationale */}
                <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 space-y-1">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200 mr-1">
                        Role: {source.roleInAssignment || "Empirical evidence"} ·
                      </span>
                      {source.suggestedUse || source.mainFinding}
                    </p>
                  </div>
                  {source.questionAlignment?.supportsPart && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium pl-5.5">
                      🎯 {source.questionAlignment.supportsPart}
                    </p>
                  )}
                </div>

                {/* Key Concepts Chips */}
                {source.keyConcepts && source.keyConcepts.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    {source.keyConcepts.map((concept, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400"
                      >
                        #{concept}
                      </span>
                    ))}
                  </div>
                )}

                {/* Abstract Accordion (academic sources) */}
                {!source.isUserUploaded && source.abstract && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => toggleAbstract(source.id)}
                      className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>{isExpanded ? "Collapse abstract" : "View academic abstract"}</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {isExpanded && (
                      <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-white/[0.02] p-3 rounded-xl border border-neutral-200/60 dark:border-white/5 leading-relaxed italic animate-in fade-in duration-150">
                        "{source.abstract}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Relevance match & Action Controls */}
              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2.5 shrink-0 sm:min-w-36 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  {source.relevanceCategory && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                      {source.relevanceCategory}
                    </span>
                  )}
                  <span className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
                    {source.relevanceScore}% match
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleBookmark(source.id)}
                    aria-label={isBookmarked ? "Remove bookmark" : "Bookmark source"}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isBookmarked
                        ? "text-amber-500 bg-amber-500/10"
                        : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5"
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isBookmarked ? "fill-amber-500" : ""}`} />
                  </button>
                </div>

                {/* Primary Action: Approve */}
                <button
                  type="button"
                  onClick={() => onToggleApproval(source.id)}
                  aria-label={isApproved ? `Remove ${source.title}` : `Approve ${source.title}`}
                  className={`w-full sm:w-auto px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs dark:shadow-none ${
                    isApproved
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-neutral-900 hover:opacity-90 text-white dark:bg-white dark:text-neutral-900 active:scale-[0.99]"
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
                      <span>Approve</span>
                    </>
                  )}
                </button>

                {/* Secondary Actions: Copy citation, DOI, Dismiss */}
                <div className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <button
                    type="button"
                    onClick={() => handleCopyCitation(source)}
                    title="Copy full bibliographic citation"
                    className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                  >
                    {copiedId === source.id ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {(source.doi || source.url) && (
                    <a
                      href={source.url || `https://doi.org/${source.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open source URL or DOI"
                      className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => onDismiss(source.id)}
                    title="Exclude or replace this source"
                    className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-neutral-400 hover:text-red-600 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};
