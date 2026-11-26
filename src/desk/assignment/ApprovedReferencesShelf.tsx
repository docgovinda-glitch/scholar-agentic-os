import { DEFAULT_CITATION_STYLE } from "../../domain/assignment/answerKeys";
import React,{ useState } from "react";
import type { DiscoveredSource } from "./types";
import { ReferenceBarItem } from "./ReferenceBarItem";
import { buildFormattedBibliography } from "./services/assignmentExportService";
import {
ChevronUp,
ChevronDown,
BookOpen,
Copy,
Check,
ArrowRight
} from "lucide-react";

export interface ApprovedReferencesShelfProps {
  approvedSources: DiscoveredSource[];
  onToggleApproval: (sourceId: string) => void;
  onEditSource?: (source: DiscoveredSource) => void;
  onSaveEditSource?: (sourceId: string, updates: Partial<DiscoveredSource>) => void;
  onProceedToDrafting?: () => void;
  className?: string;
  /** The project's citation style (copied references and in-text citations use it). */
  citationStyle?: string;
}

export const ApprovedReferencesShelf: React.FC<ApprovedReferencesShelfProps> = ({
  approvedSources,
  onToggleApproval,
  onEditSource,
  onSaveEditSource,
  onProceedToDrafting,
  className = "",
  citationStyle = DEFAULT_CITATION_STYLE,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const approvedCount = approvedSources.length;
  if (approvedCount === 0) return null;

  const handleCopyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    // The same reference entries as the exports, in the project's style.
    const bibliography = buildFormattedBibliography(approvedSources, citationStyle).join("\n\n");
    void navigator?.clipboard
      ?.writeText(bibliography)
      .then(() => {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      })
      .catch((err: unknown) => console.warn("Copy references failed:", err));
  };

  return (
    <div className={`fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center pointer-events-none ${className}`}>
      {/* Expanded Reference Drawer */}
      {isExpanded && (
        <div className="w-[92vw] max-w-3xl mb-3 bg-[color:var(--surface-raised)] backdrop-blur-xl border border-[color:var(--border-subtle)] rounded-2xl p-4 shadow-2xl space-y-3 pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between pb-2.5 border-b border-[color:var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-400">
                <BookOpen className="w-3.5 h-3.5" />
              </span>
              <h3 className="text-xs font-semibold text-[color:var(--text-primary)]">
                Approved Paper References ({approvedCount})
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAll}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Copy all formatted citations to clipboard"
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">All Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-[color:var(--text-muted)]" />
                    <span>Copy All</span>
                  </>
                )}
              </button>

              {onProceedToDrafting && (
                <button
                  type="button"
                  onClick={onProceedToDrafting}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
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
                citationStyle={citationStyle}
              />
            ))}
          </div>
        </div>
      )}

      {/* Dock Capsule Trigger */}
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="dock-capsule bg-[color:var(--surface-raised)] backdrop-blur-md border border-[color:var(--border-default)] rounded-full px-3.5 sm:px-5 py-2 sm:py-2.5 shadow-lg flex items-center gap-2.5 sm:gap-4 whitespace-nowrap pointer-events-auto cursor-pointer hover:border-[color:var(--border-strong)] active:scale-[0.99] transition-all select-none"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-[color:var(--text-primary)]">
            {approvedCount} {approvedCount === 1 ? "Reference" : "References"} Approved
          </span>
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-[color:var(--border-subtle)]">
          <span className="hidden sm:inline text-xs font-medium text-[color:var(--text-secondary)]">
            {isExpanded ? "Hide list" : "View list"}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[color:var(--text-muted)]" />
          ) : (
            <ChevronUp className="w-4 h-4 text-[color:var(--text-muted)]" />
          )}
        </div>
      </button>
    </div>
  );
};

export default ApprovedReferencesShelf;
