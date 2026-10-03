import React, { useState } from "react";
import type { DraftingSection } from "../types/drafting";
import { SectionOutlineSidebar } from "./SectionOutlineSidebar";
import { formatSectionFocus } from "../services/academicLensService";
import { Sparkles, FileText, ArrowRight } from "lucide-react";

export interface DraftingWorkspaceProps {
  sections: DraftingSection[];
  onDraftSection?: (sectionId: string) => Promise<void>;
  onUpdateDraftContent?: (sectionId: string, content: string) => void;
  className?: string;
}

export function DraftingWorkspace({
  sections,
  onDraftSection,
  onUpdateDraftContent,
  className = "",
}: DraftingWorkspaceProps) {
  const [activeSectionId, setActiveSectionId] = useState<string>(
    sections[0]?.id || ""
  );

  const activeSection = sections.find((s) => s.id === activeSectionId) || sections[0];
  const activeFocus = formatSectionFocus(activeSection?.guidance, activeSection?.title);

  return (
    <div
      data-testid="drafting-workspace"
      className={`grid grid-cols-1 lg:grid-cols-4 gap-6 p-4 sm:p-6 bg-transparent ${className}`}
    >
      {/* Sidebar */}
      <div className="lg:col-span-1">
        <SectionOutlineSidebar
          sections={sections}
          activeSectionId={activeSection?.id || null}
          onSelectSection={setActiveSectionId}
        />
      </div>

      {/* Main Drafting Canvas */}
      <div className="lg:col-span-3 flex flex-col bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-6 shadow-xs">
        {activeSection ? (
          <div className="space-y-4">
            {/* Header */}
            <div className="pb-4 border-b border-neutral-100 dark:border-white/5 space-y-1">
              <span className="text-xs font-mono text-neutral-400">
                {activeSection.numberStr || "Section"}
              </span>
              <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                {activeSection.title}
              </h2>

              {/* Clean Focus Guidance (NO CANNED "ACADEMIC LENS" BOILERPLATE) */}
              {activeFocus && (
                <p
                  data-testid="section-focus-guidance"
                  className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 pt-1 leading-relaxed"
                >
                  <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
                    Focus:
                  </strong>{" "}
                  {activeFocus.replace(/^Focus:\s*/i, "")}
                </p>
              )}
            </div>

            {/* Editor Canvas */}
            <div className="min-h-[340px] flex flex-col justify-between py-2">
              <textarea
                value={activeSection.draftContent || ""}
                onChange={(e) => onUpdateDraftContent?.(activeSection.id, e.target.value)}
                placeholder="Drafting prose grounded in academic literature and assignment directives..."
                className="w-full flex-1 p-4 rounded-xl text-sm leading-relaxed bg-neutral-50/50 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 resize-none min-h-[300px]"
              />
            </div>

            {/* Action Toolbar */}
            <div className="pt-4 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-neutral-500 tabular-nums">
                <FileText className="w-3.5 h-3.5" />
                <span>
                  {activeSection.currentWordCount || 0} / {activeSection.targetWordCount} words
                </span>
              </div>

              {onDraftSection && (
                <button
                  type="button"
                  onClick={() => onDraftSection(activeSection.id)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Draft Next Subsection</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">
            Select a section from the outline to view details
          </div>
        )}
      </div>
    </div>
  );
}
