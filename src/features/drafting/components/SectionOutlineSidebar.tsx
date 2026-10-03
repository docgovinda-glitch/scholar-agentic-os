import React from "react";
import type { DraftingSection } from "../types/drafting";
import { CheckCircle2, Clock, Loader2, FileText, BookOpen } from "lucide-react";

export interface SectionOutlineSidebarProps {
  sections: DraftingSection[];
  activeSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  className?: string;
}

export function SectionOutlineSidebar({
  sections,
  activeSectionId,
  onSelectSection,
  className = "",
}: SectionOutlineSidebarProps) {
  const completedCount = sections.filter(
    (s) => s.status === "completed" || Boolean(s.draftContent && s.draftContent.trim().length > 0)
  ).length;
  const totalCount = sections.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <aside
      aria-label="Section Outline Sidebar"
      data-testid="section-outline-sidebar"
      className={`flex flex-col bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors ${className}`}
    >
      {/* Header & Section Progress */}
      <div className="pb-4 border-b border-neutral-100 dark:border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
              Section Outline
            </h2>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Drafting subsection-by-subsection
            </p>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 tabular-nums">
            {completedCount}/{totalCount} completed
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-neutral-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-neutral-900 dark:bg-white rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Clean Sequential Outline List */}
      <nav aria-label="Sections list" className="flex-1 overflow-y-auto pt-3 space-y-1.5 max-h-[calc(100vh-280px)] pr-0.5">
        {sections.map((section, idx) => {
          const isActive = section.id === activeSectionId;
          const isCompleted =
            section.status === "completed" ||
            Boolean(section.draftContent && section.draftContent.trim().length > 0);
          const isGenerating = section.status === "generating";
          const boundCount = section.boundSourceIds ? section.boundSourceIds.length : 0;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelectSection(section.id)}
              className={`w-full text-left p-3 rounded-xl transition-all border cursor-pointer ${
                isActive
                  ? "bg-neutral-50 dark:bg-white/[0.08] border-neutral-300/80 dark:border-white/20 shadow-xs"
                  : "bg-transparent border-neutral-200/50 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/15 hover:bg-neutral-50/50 dark:hover:bg-white/[0.02]"
              }`}
            >
              {/* Header: Section Number & Status (NO TRUNCATED CATEGORY CHIPS) */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-mono font-semibold text-neutral-500 dark:text-neutral-400">
                  {section.numberStr || `${idx + 1}.0`}
                </span>

                {/* Status Indicator */}
                {isGenerating ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full animate-pulse">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>Writing</span>
                  </span>
                ) : isCompleted ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>Ready</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                    <Clock className="w-2.5 h-2.5" />
                    <span>Pending</span>
                  </span>
                )}
              </div>

              {/* Title */}
              <h3
                className={`text-xs font-semibold leading-snug line-clamp-2 ${
                  isActive
                    ? "text-neutral-900 dark:text-white"
                    : "text-neutral-700 dark:text-neutral-300"
                }`}
              >
                {section.title}
              </h3>

              {/* Word Count and Evidence Meta */}
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 pt-1.5 border-t border-neutral-100 dark:border-white/5">
                <div className="flex items-center gap-1.5 tabular-nums">
                  <FileText className="w-3 h-3 text-neutral-400" />
                  <span>
                    {section.currentWordCount || 0} / {section.targetWordCount} w
                  </span>
                </div>

                {boundCount > 0 && (
                  <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 font-medium">
                    <BookOpen className="w-2.5 h-2.5 text-neutral-400" />
                    <span>{boundCount}</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
