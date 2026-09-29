import React, { useState } from "react";
import type { DiscoveredSource } from "./types";
import { ReferenceBarItem, formatInTextCitation } from "./ReferenceBarItem";
import {
  ChevronUp,
  ChevronDown,
  BookOpen,
  Copy,
  Check,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export interface ApprovedReferencesShelfProps {
  approvedSources: DiscoveredSource[];
  recommendedCount?: number;
  onToggleApproval: (sourceId: string) => void;
  onEditSource?: (source: DiscoveredSource) => void;
  onSaveEditSource?: (sourceId: string, updates: Partial<DiscoveredSource>) => void;
  onProceedToDrafting?: () => void;
  className?: string;
}

export const ApprovedReferencesShelf: React.FC<ApprovedReferencesShelfProps> = ({
  approvedSources,
  recommendedCount = 4,
  onToggleApproval,
  onEditSource,
  onSaveEditSource,
  onProceedToDrafting,
  className = "",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const approvedCount = approvedSources.length;
  if (approvedCount === 0) return null;

  const handleCopyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const bibliography = approvedSources
      .map((s, idx) => {
        const inText = formatInTextCitation(s);
        const authors = s.authors?.join(", ") || "Unknown Author";
        const year = s.year || "2024";
        const title = s.title;
        const venue = s.journal || s.publisher || "Academic Press";
        return `${idx + 1}. ${authors} (${year}). ${title}. ${venue}. In-text: ${inText}`;
      })
      .join("\n\n");

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(bibliography).catch(() => {});
    }
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center pointer-events-none ${className}`}>
      {/* Expanded Reference Drawer */}
      {isExpanded && (
        <div className="w-[92vw] max-w-3xl mb-3 bg-white/98 dark:bg-[#1C1C1E]/98 backdrop-blur-xl border border-neutral-200/90 dark:border-white/15 rounded-2xl p-4 shadow-2xl space-y-3 pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between pb-2.5 border-b border-neutral-100 dark:border-white/5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <BookOpen className="w-3.5 h-3.5" />
              </span>
              <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                Approved Paper References ({approvedCount})
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAll}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 border border-neutral-200/80 dark:border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Copy all formatted citations to clipboard"
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">All Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-neutral-400" />
                    <span>Copy All</span>
                  </>
                )}
              </button>

              {onProceedToDrafting && (
                <button
                  type="button"
                  onClick={onProceedToDrafting}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <span>Drafting</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Reference Bars List */}
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {approvedSources.map((source) => (
              <ReferenceBarItem
                key={source.id}
                source={source}
                isApproved={true}
                onToggleApproval={onToggleApproval}
                onEdit={onEditSource}
                onSaveEdit={onSaveEditSource}
                showDismiss={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Dock Capsule Trigger */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setIsExpanded((prev) => !prev);
          }
        }}
        className="dock-capsule bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-md border border-neutral-200/80 dark:border-white/15 rounded-full px-5 py-2.5 shadow-lg flex items-center gap-4 pointer-events-auto cursor-pointer hover:border-neutral-300 dark:hover:border-white/25 active:scale-[0.99] transition-all select-none"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-neutral-900 dark:text-white">
            {approvedCount} {approvedCount === 1 ? "Reference" : "References"} Approved
          </span>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
            (Target: {recommendedCount})
          </span>
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-neutral-200/80 dark:border-white/10">
          <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
            {isExpanded ? "Hide Shelf" : "View Shelf"}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-neutral-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-neutral-400" />
          )}
        </div>
      </div>
    </div>
  );
};

export default ApprovedReferencesShelf;
