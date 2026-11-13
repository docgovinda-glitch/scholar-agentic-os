import React, { useState } from "react";
import type { AssignmentDraftingSection } from "../types";
import {
  CheckCircle2,
  Clock,
  Sparkles,
  BookOpen,
  ArrowRight,
  Layers,
  FileText,
  Loader2,
  Edit2,
  Check,
  X,
} from "lucide-react";

export interface DraftingSectionIndexProps {
  sections: AssignmentDraftingSection[];
  activeSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  onGenerateNext?: () => void;
  onGenerateAll?: () => void;
  onTuneToQuestion?: () => void;
  onUpdateSectionTitle?: (sectionId: string, newTitle: string) => void;
  assignmentTopic?: string;
  isTuning?: boolean;
  isGenerating?: boolean;
  generatingSectionId?: string | null;
  className?: string;
}

export function DraftingSectionIndex({
  sections,
  activeSectionId,
  onSelectSection,
  onGenerateNext,
  onGenerateAll,
  onTuneToQuestion,
  onUpdateSectionTitle,
  assignmentTopic,
  isTuning = false,
  isGenerating = false,
  generatingSectionId = null,
  className = "",
}: DraftingSectionIndexProps) {
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState<string>("");

  const completedCount = sections.filter(
    (s) => s.status === "completed" || (s.draftContent && s.draftContent.trim().length > 0)
  ).length;
  const totalCount = sections.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasPending = completedCount < totalCount;

  return (
    <aside
      aria-label="Section Index"
      className={`flex flex-col bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors ${className}`}
    >
      {/* Header & Section Progress */}
      <div className="pb-4 border-b border-neutral-100 dark:border-white/5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
                Section Outline & Structure
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Drafting subsection-by-subsection
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 tabular-nums">
            {completedCount}/{totalCount} completed
          </span>
        </div>

        {/* Mini progress bar */}
        <div className="w-full bg-neutral-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-neutral-900 dark:bg-white rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Global Actions */}
      <div className="py-3 border-b border-neutral-100 dark:border-white/5 space-y-2">
        <button
          type="button"
          onClick={onGenerateNext}
          disabled={isGenerating || !hasPending}
          className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Writing section…</span>
            </>
          ) : hasPending ? (
            <>
              <Sparkles className="w-3.5 h-3.5 text-amber-300 dark:text-amber-500" />
              <span>Draft Next Section</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>All Sections Drafted</span>
            </>
          )}
        </button>

      </div>

      {/* Sections List */}
      <nav
        aria-label="Sections list"
        className="flex-1 overflow-y-auto pt-3 space-y-1.5 max-h-[calc(100vh-320px)] pr-0.5"
      >
        {sections.map((section, idx) => {
          const isActive = section.id === activeSectionId;
          const isSectionGenerating =
            isGenerating && (generatingSectionId === section.id || section.status === "generating");
          const isCompleted =
            section.status === "completed" ||
            Boolean(section.draftContent && section.draftContent.trim().length > 0);
          const boundSourcesCount = section.boundSourceIds ? section.boundSourceIds.length : 0;
          const isEditing = editingSectionId === section.id;

          const innerCardContent = (
            <>
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[11px] font-mono font-medium text-neutral-400 dark:text-neutral-500">
                  Section {idx + 1}
                </span>

                {/* Status Indicator */}
                {isSectionGenerating ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full animate-pulse">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>Writing</span>
                  </span>
                ) : isCompleted ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>Ready</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-white/5 px-1.5 py-0.5 rounded-full">
                    <Clock className="w-2.5 h-2.5" />
                    <span>Pending</span>
                  </span>
                )}
              </div>

              {/* Title / Inline Edit */}
              {isEditing ? (
                <div
                  className="my-1.5 flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (editTitleValue.trim()) {
                          onUpdateSectionTitle?.(section.id, editTitleValue.trim());
                        }
                        setEditingSectionId(null);
                      } else if (e.key === "Escape") {
                        setEditingSectionId(null);
                      }
                    }}
                    className="w-full text-xs font-semibold px-2 py-1 rounded bg-white dark:bg-ink-600 border border-neutral-300 dark:border-white/20 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editTitleValue.trim()) {
                        onUpdateSectionTitle?.(section.id, editTitleValue.trim());
                      }
                      setEditingSectionId(null);
                    }}
                    className="p-1 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 shrink-0 cursor-pointer"
                    title="Save title"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSectionId(null)}
                    className="p-1 rounded hover:bg-neutral-200/60 dark:hover:bg-white/10 text-neutral-500 shrink-0 cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-1 group/item">
                  <h3
                    className={`text-xs font-semibold leading-snug line-clamp-2 ${
                      isActive
                        ? "text-neutral-900 dark:text-white"
                        : "text-neutral-700 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-white"
                    }`}
                  >
                    {section.title}
                  </h3>
                  {onUpdateSectionTitle && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSectionId(section.id);
                        setEditTitleValue(section.title);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          setEditingSectionId(section.id);
                          setEditTitleValue(section.title);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-opacity shrink-0 cursor-pointer"
                      title="Edit section title"
                    >
                      <Edit2 className="w-3 h-3" />
                    </span>
                  )}
                </div>
              )}

              {/* Word Count and Sources Meta */}
              <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 pt-1 border-t border-neutral-100/80 dark:border-white/5">
                <div className="flex items-center gap-1.5 tabular-nums">
                  <FileText className="w-3 h-3 text-neutral-400" />
                  <span>
                    {section.currentWordCount || 0} / {section.targetWordCount} words
                  </span>
                </div>

                {boundSourcesCount > 0 && (
                  <div
                    title={`${boundSourcesCount} approved sources assigned to this subsection`}
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 font-medium"
                  >
                    <BookOpen className="w-2.5 h-2.5 text-neutral-400" />
                    <span>{boundSourcesCount}</span>
                  </div>
                )}
              </div>

              {/* Subsection Word Budget Micro Progress Meter */}
              <div className="w-full bg-neutral-100 dark:bg-white/5 h-1 rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isCompleted
                      ? "bg-emerald-500"
                      : isSectionGenerating
                      ? "bg-blue-500 animate-pulse"
                      : "bg-neutral-300 dark:bg-neutral-600"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        ((section.currentWordCount || 0) / (section.targetWordCount || 500)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            </>
          );

          if (isEditing) {
            return (
              <div
                key={section.id}
                className={`w-full text-left p-3 rounded-xl transition-all border ${
                  isActive
                    ? "bg-neutral-50 dark:bg-white/[0.08] border-neutral-300/80 dark:border-white/20 shadow-xs"
                    : "bg-transparent border-neutral-200/50 dark:border-white/10"
                }`}
              >
                {innerCardContent}
              </div>
            );
          }

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelectSection(section.id)}
              className={`w-full text-left p-3 rounded-xl transition-all border cursor-pointer relative group ${
                isActive
                  ? "bg-neutral-50 dark:bg-white/[0.08] border-neutral-300/80 dark:border-white/20 shadow-xs"
                  : "bg-transparent hover:bg-neutral-50/70 dark:hover:bg-white/[0.03] border-transparent"
              }`}
            >
              {innerCardContent}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export default DraftingSectionIndex;
