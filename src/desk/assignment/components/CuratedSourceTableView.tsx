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
  ArrowUpDown,
  Unlock,
  Sparkles,
} from "lucide-react";

export interface CuratedSourceTableViewProps {
  sources: DiscoveredSource[];
  approvedSourceIds: string[];
  bookmarkedSourceIds: string[];
  onToggleApproval: (sourceId: string) => void;
  onDismiss: (sourceId: string) => void;
  onToggleBookmark: (sourceId: string) => void;
}

export type TableSortField = "role" | "relevance" | "year" | "citations" | "title";

export const CuratedSourceTableView: React.FC<CuratedSourceTableViewProps> = ({
  sources,
  approvedSourceIds,
  bookmarkedSourceIds,
  onToggleApproval,
  onDismiss,
  onToggleBookmark,
}) => {
  const [sortField, setSortField] = useState<TableSortField | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSort = (field: TableSortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default desc for numbers
    }
  };

  const getRoleBadgeClasses = (role?: string) => {
    switch (role) {
      case "Empirical evidence":
        return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40";
      case "Theoretical framework":
        return "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/40";
      case "Comparative evidence":
        return "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200/60 dark:border-sky-800/40";
      case "Core theory":
        return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40";
      case "Methodological framework":
        return "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/40";
      case "Contextual evidence":
      default:
        return "bg-neutral-100 text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700";
    }
  };

  const getCategoryBadgeClasses = (cat?: string) => {
    switch (cat) {
      case "Very High":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 font-bold border-emerald-300 dark:border-emerald-700";
      case "High":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 font-semibold border-blue-300 dark:border-blue-700";
      case "Moderate":
      default:
        return "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700";
    }
  };

  const sortedSources = sortField
    ? [...sources].sort((a, b) => {
        let comparison = 0;
        if (sortField === "role") {
          comparison = (a.roleInAssignment || "").localeCompare(b.roleInAssignment || "");
        } else if (sortField === "relevance") {
          comparison = (b.relevanceScore || 0) - (a.relevanceScore || 0);
        } else if (sortField === "year") {
          comparison = parseInt(b.year || "0", 10) - parseInt(a.year || "0", 10);
        } else if (sortField === "citations") {
          comparison = (b.citationCount || 0) - (a.citationCount || 0);
        } else if (sortField === "title") {
          comparison = a.title.localeCompare(b.title);
        }
        return sortAsc ? -comparison : comparison;
      })
    : sources;

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shadow-xs">
      <table className="w-full text-left text-xs border-collapse min-w-[860px]" data-testid="curated-sources-table">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.02] text-neutral-600 dark:text-neutral-400 font-semibold uppercase tracking-wider text-[10px]">
            <th className="py-3 px-3 w-10 text-center">Status</th>
            <th className="py-3 px-3 cursor-pointer hover:text-neutral-900 dark:hover:text-white" onClick={() => handleSort("title")}>
              <div className="flex items-center gap-1">
                <span>Source</span>
                <ArrowUpDown className="w-2.5 h-2.5" />
              </div>
            </th>
            <th className="py-3 px-2 w-20 cursor-pointer hover:text-neutral-900 dark:hover:text-white" onClick={() => handleSort("year")}>
              <div className="flex items-center gap-1">
                <span>Year</span>
                <ArrowUpDown className="w-2.5 h-2.5" />
              </div>
            </th>
            <th className="py-3 px-2 w-28 cursor-pointer hover:text-neutral-900 dark:hover:text-white" onClick={() => handleSort("relevance")}>
              <div className="flex items-center gap-1">
                <span>Relevance</span>
                <ArrowUpDown className="w-2.5 h-2.5" />
              </div>
            </th>
            <th className="py-3 px-2 w-36 cursor-pointer hover:text-neutral-900 dark:hover:text-white" onClick={() => handleSort("role")}>
              <div className="flex items-center gap-1">
                <span>Role in Assignment</span>
                <ArrowUpDown className="w-2.5 h-2.5" />
              </div>
            </th>
            <th className="py-3 px-3">Venue / Publisher</th>
            <th className="py-3 px-2 w-28">Methodology</th>
            <th className="py-3 px-2 w-20 cursor-pointer hover:text-neutral-900 dark:hover:text-white text-right" onClick={() => handleSort("citations")}>
              <div className="flex items-center justify-end gap-1">
                <span>Citations</span>
                <ArrowUpDown className="w-2.5 h-2.5" />
              </div>
            </th>
            <th className="py-3 px-3 w-20 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
          {sortedSources.map((source) => {
            const isApproved = approvedSourceIds.includes(source.id);
            const isBookmarked = bookmarkedSourceIds.includes(source.id) || !!source.isBookmarked;
            const isExpanded = expandedId === source.id;

            return (
              <React.Fragment key={source.id}>
                <tr
                  className={`transition-colors hover:bg-neutral-50/60 dark:hover:bg-white/[0.02] ${
                    isApproved ? "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]" : ""
                  }`}
                >
                  {/* Status checkbox / button */}
                  <td className="py-3 px-3 text-center align-top">
                    <button
                      type="button"
                      onClick={() => onToggleApproval(source.id)}
                      aria-label={isApproved ? "Remove approval" : "Approve source"}
                      className={`w-6 h-6 rounded-lg transition-colors cursor-pointer flex items-center justify-center mx-auto ${
                        isApproved
                          ? "bg-emerald-600 text-white"
                          : "border border-neutral-300 dark:border-white/20 text-transparent hover:border-neutral-400"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </td>

                  {/* Title & Authors */}
                  <td className="py-3 px-3 align-top max-w-sm">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {source.isUserUploaded ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300">
                            Uploaded: {source.sourceFormatBadge || "File"}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                            {source.type}
                          </span>
                        )}
                        {source.isVerifiedAcademic !== false && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/30 flex items-center gap-0.5">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            <span>Verified</span>
                          </span>
                        )}
                        {source.isOpenAccess && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200/50 dark:border-amber-700/30 flex items-center gap-0.5">
                            <Unlock className="w-2 h-2" />
                            <span>OA</span>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : source.id)}
                        className="text-left font-semibold text-neutral-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 leading-snug cursor-pointer block"
                      >
                        {source.title}
                      </button>

                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1">
                        {source.authors && source.authors.length > 0
                          ? source.authors.join(", ")
                          : "Unknown"}
                      </p>
                    </div>
                  </td>

                  {/* Year */}
                  <td className="py-3 px-2 align-top font-mono text-neutral-600 dark:text-neutral-400">
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-semibold text-neutral-900 dark:text-white">{source.year}</span>
                      {parseInt(source.year || "0", 10) >= 2026 ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/60">
                          2026 Recent
                        </span>
                      ) : parseInt(source.year || "0", 10) === 2025 ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          2025
                        </span>
                      ) : source.roleInAssignment === "Core theory" || source.citationImpact === "Seminal Work" ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/30">
                          Foundational
                        </span>
                      ) : null}
                    </div>
                  </td>

                  {/* Relevance */}
                  <td className="py-3 px-2 align-top">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] border ${getCategoryBadgeClasses(source.relevanceCategory)}`}>
                        {source.relevanceCategory || (source.relevanceScore >= 88 ? "Very High" : source.relevanceScore >= 76 ? "High" : "Moderate")}
                      </span>
                      <span className="text-[10px] font-mono font-medium text-neutral-500 dark:text-neutral-400">
                        {source.relevanceScore}% match
                      </span>
                    </div>
                  </td>

                  {/* Role in Assignment */}
                  <td className="py-3 px-2 align-top">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getRoleBadgeClasses(source.roleInAssignment)}`}>
                      {source.roleInAssignment || "Empirical evidence"}
                    </span>
                    {source.questionAlignment?.supportsPart && (
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-1 max-w-[200px]" title={source.questionAlignment.supportsPart}>
                        {source.questionAlignment.supportsPart}
                      </p>
                    )}
                  </td>

                  {/* Venue */}
                  <td className="py-3 px-3 align-top text-neutral-600 dark:text-neutral-400 max-w-[180px]">
                    <div className="line-clamp-2 italic">
                      {source.journal || source.publisher || "Academic Press"}
                    </div>
                  </td>

                  {/* Methodology */}
                  <td className="py-3 px-2 align-top">
                    {source.methodology ? (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200/40 dark:border-purple-800/20">
                        {source.methodology}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>

                  {/* Citations */}
                  <td className="py-3 px-2 align-top font-mono text-right text-neutral-600 dark:text-neutral-400">
                    {source.citationCount !== undefined ? source.citationCount.toLocaleString() : "—"}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-3 align-top text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onToggleBookmark(source.id)}
                        title={isBookmarked ? "Remove bookmark" : "Bookmark"}
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          isBookmarked
                            ? "text-amber-500 bg-amber-500/10"
                            : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-white/5"
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${isBookmarked ? "fill-amber-500" : ""}`} />
                      </button>

                      {(source.doi || source.url) && (
                        <a
                          href={source.url || `https://doi.org/${source.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open article link"
                          className="p-1 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => onDismiss(source.id)}
                        title="Dismiss"
                        className="p-1 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded Details Row */}
                {isExpanded && (
                  <tr className="bg-neutral-50/80 dark:bg-white/[0.02]">
                    <td colSpan={9} className="py-3 px-4 sm:px-6">
                      <div className="space-y-2 text-xs">
                        {/* Question-Driven Role & Alignment */}
                        <div className="bg-white dark:bg-[#1C1C1E] p-3 rounded-xl border border-neutral-200/60 dark:border-white/5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                              <span>Role in Assignment: {source.roleInAssignment || "Empirical evidence"}</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] border ${getCategoryBadgeClasses(source.relevanceCategory)}`}>
                              Relevance: {source.relevanceCategory || "High"} ({source.relevanceScore}%)
                            </span>
                          </div>
                          {source.questionAlignment && (
                            <p className="text-neutral-700 dark:text-neutral-300">
                              <span className="font-medium text-neutral-900 dark:text-white">Evidence Function:</span>{" "}
                              {source.questionAlignment.supportsPart} ({source.questionAlignment.evidenceType})
                            </p>
                          )}
                        </div>
                        {/* Extracted Evidence for Uploaded Source */}
                        {source.isUserUploaded && source.extractedEvidences && source.extractedEvidences.length > 0 && (
                          <div className="bg-white dark:bg-[#1C1C1E] p-3 rounded-xl border border-neutral-200/60 dark:border-white/5 space-y-2">
                            <span className="font-semibold text-neutral-900 dark:text-white block">
                              Extracted Evidence & Used References ({source.extractedEvidences.length}):
                            </span>
                            <div className="space-y-1.5">
                              {source.extractedEvidences.map((ev, eIdx) => (
                                <div key={ev.id || eIdx} className="p-2 rounded bg-neutral-50 dark:bg-neutral-900/60 text-xs">
                                  <div className="flex items-center justify-between font-mono text-[10px] text-blue-600 dark:text-blue-400 mb-1">
                                    <span>📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}</span>
                                    {ev.claim && <span className="text-neutral-400 truncate max-w-xs">{ev.claim}</span>}
                                  </div>
                                  <p className="italic text-neutral-800 dark:text-neutral-200">"{ev.excerpt}"</p>
                                  {ev.context && ev.context !== ev.excerpt && (
                                    <p className="text-[11px] text-neutral-500 mt-1"><span className="font-semibold">Context:</span> {ev.context}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {source.structuredDataSummary && (
                          <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-emerald-900 dark:text-emerald-200">
                            <span className="font-semibold block mb-1">Spreadsheet Data Summary:</span>
                            {source.structuredDataSummary}
                          </div>
                        )}

                        <div className="flex items-start gap-2 bg-white dark:bg-[#1C1C1E] p-3 rounded-xl border border-neutral-200/60 dark:border-white/5">
                          <Sparkles className="w-3.5 h-3.5 text-neutral-500 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-neutral-900 dark:text-white">
                              Prompt Alignment:
                            </span>{" "}
                            <span className="text-neutral-700 dark:text-neutral-300">
                              {source.suggestedUse || source.mainFinding}
                            </span>
                          </div>
                        </div>

                        {source.abstract && (
                          <div className="text-neutral-600 dark:text-neutral-400 italic bg-white dark:bg-[#1C1C1E] p-3 rounded-xl border border-neutral-200/60 dark:border-white/5 leading-relaxed">
                            <span className="font-semibold not-italic text-neutral-900 dark:text-white block mb-1">
                              Abstract:
                            </span>
                            "{source.abstract}"
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
