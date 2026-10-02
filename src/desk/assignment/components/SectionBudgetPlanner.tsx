import React, { useState } from "react";
import { Plus, Trash2, RotateCcw, Check, AlertCircle, Sparkles } from "lucide-react";
import type { SectionBudgetItem } from "../types";

interface SectionBudgetPlannerProps {
  targetWordCount: number;
  onTargetWordCountChange: (total: number) => void;
  sections: SectionBudgetItem[];
  onSectionsChange: (sections: SectionBudgetItem[]) => void;
}

const COMMON_SECTION_SUGGESTIONS = [
  "Literature Review",
  "Theoretical Framework",
  "Methodology",
  "Case Analysis",
  "Policy Recommendations",
];

export default function SectionBudgetPlanner({
  targetWordCount,
  onTargetWordCountChange,
  sections,
  onSectionsChange,
}: SectionBudgetPlannerProps) {
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);

  const totalAllocated = sections.reduce((sum, s) => sum + (Number(s.targetWordCount) || 0), 0);
  const difference = targetWordCount - totalAllocated;
  const isBalanced = totalAllocated === targetWordCount;
  const isOver = totalAllocated > targetWordCount;

  const handleWordChange = (id: string, words: number) => {
    const updated = sections.map((s) =>
      s.id === id ? { ...s, targetWordCount: Math.max(0, words) } : s
    );
    onSectionsChange(updated);
  };

  const handleTitleChange = (id: string, title: string) => {
    const updated = sections.map((s) => (s.id === id ? { ...s, title } : s));
    onSectionsChange(updated);
  };

  const handleAddSection = (titleToAdd?: string) => {
    const title = (titleToAdd || newSectionTitle || "Custom Section").trim();
    if (!title) return;

    // Default allocated words for the new section
    const defaultWords = difference > 0 ? Math.min(difference, 300) : 250;
    const newSection: SectionBudgetItem = {
      id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      targetWordCount: defaultWords,
      isCustom: true,
    };

    onSectionsChange([...sections, newSection]);
    setNewSectionTitle("");
    setIsAddingSection(false);
  };

  const handleDeleteSection = (id: string) => {
    const updated = sections.filter((s) => s.id !== id);
    onSectionsChange(updated);
  };

  const handleAutoBalance = () => {
    if (sections.length === 0) return;
    const total = targetWordCount > 0 ? targetWordCount : 2000;
    
    // Check if standard 3-part layout
    const isStandard =
      sections.length === 3 &&
      sections.some((s) => s.id === "intro") &&
      sections.some((s) => s.id === "body") &&
      sections.some((s) => s.id === "conclusion");

    if (isStandard) {
      const intro = Math.round(total * 0.10);
      const conclusion = Math.round(total * 0.10);
      const body = Math.max(0, total - intro - conclusion);
      onSectionsChange([
        { id: "intro", title: "Introduction", targetWordCount: intro, isCustom: false },
        { id: "body", title: "Body Paragraphs", targetWordCount: body, isCustom: false },
        { id: "conclusion", title: "Conclusion", targetWordCount: conclusion, isCustom: false },
      ]);
      return;
    }

    // Proportional redistribution across current sections
    const currentSum = totalAllocated > 0 ? totalAllocated : 1;
    let distributed = 0;
    const updated = sections.map((s, idx) => {
      if (idx === sections.length - 1) {
        return { ...s, targetWordCount: Math.max(0, total - distributed) };
      }
      const count = Math.round((s.targetWordCount / currentSum) * total);
      distributed += count;
      return { ...s, targetWordCount: Math.max(0, count) };
    });
    onSectionsChange(updated);
  };

  const handleResetToStandard = () => {
    const total = targetWordCount > 0 ? targetWordCount : 2000;
    const intro = Math.round(total * 0.10);
    const conclusion = Math.round(total * 0.10);
    const body = Math.max(0, total - intro - conclusion);
    onSectionsChange([
      { id: "intro", title: "Introduction", targetWordCount: intro, isCustom: false },
      { id: "body", title: "Body Paragraphs", targetWordCount: body, isCustom: false },
      { id: "conclusion", title: "Conclusion", targetWordCount: conclusion, isCustom: false },
    ]);
  };

  return (
    <div className="space-y-4">
      {/* Header & Overall Target Word Count Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
            <span>Target Word Count & Section Allocations</span>
            <span className="text-rose-500 text-xs">*</span>
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Calibrate word targets per section. Baseline: Intro (10%), Body (80%), Conclusion (10%).
          </p>
        </div>

        {/* Global Target Word Count Input */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative flex items-center">
            <input
              type="number"
              min={100}
              max={50000}
              step={50}
              value={targetWordCount || ""}
              onChange={(e) => {
                const val = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                onTargetWordCountChange(isNaN(val) ? 0 : Math.min(50000, Math.max(0, val)));
              }}
              className="w-28 sm:w-32 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-right text-sm font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 dark:focus:ring-white/15 tabular-nums pr-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="2000"
            />
            <span className="pointer-events-none absolute right-3 text-xs font-medium text-neutral-400">
              words
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Sections Table / Card List */}
      <div className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] p-4 space-y-3">
        {/* Top Validation & Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200/60 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium tabular-nums ${
                isBalanced
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : isOver
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              {isBalanced ? (
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              <span>
                Allocated: {totalAllocated.toLocaleString()} / {targetWordCount.toLocaleString()} words
              </span>
            </span>

            {!isBalanced && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {isOver
                  ? `(${Math.abs(difference).toLocaleString()} words over limit)`
                  : `(${difference.toLocaleString()} words unassigned)`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isBalanced && (
              <button
                type="button"
                onClick={handleAutoBalance}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 hover:border-neutral-300 transition-colors cursor-pointer"
                title="Proportionally auto-balance allocated words to match target word count"
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Auto-balance</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleResetToStandard}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Reset to 10% Intro / 80% Body / 10% Conclusion"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Standard 10/80/10</span>
            </button>
          </div>
        </div>

        {/* Section Rows */}
        <div className="space-y-2">
          {sections.map((section) => {
            const percentage = targetWordCount > 0
              ? Math.round((section.targetWordCount / targetWordCount) * 100)
              : 0;

            return (
              <div
                key={section.id}
                className="flex items-center justify-between gap-3 p-2.5 sm:px-3.5 rounded-lg bg-white dark:bg-[#2C2C2E]/60 border border-neutral-200/70 dark:border-white/5 shadow-2xs group hover:border-neutral-300 dark:hover:border-white/15 transition-all"
              >
                {/* Title */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500 shrink-0" />
                  {section.isCustom ? (
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => handleTitleChange(section.id, e.target.value)}
                      placeholder="Section Title"
                      className="w-full text-xs font-medium text-neutral-900 dark:text-neutral-100 bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-neutral-500 focus:outline-none py-0.5 truncate"
                    />
                  ) : (
                    <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">
                      {section.title}
                    </span>
                  )}
                  {section.isCustom && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                      Custom
                    </span>
                  )}
                </div>

                {/* Word Count Control */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500 tabular-nums hidden sm:inline">
                    ~{percentage}%
                  </span>

                  <div className="relative flex items-center">
                    <input
                      type="number"
                      min={0}
                      step={25}
                      value={section.targetWordCount || ""}
                      onChange={(e) =>
                        handleWordChange(section.id, parseInt(e.target.value, 10) || 0)
                      }
                      className="w-20 sm:w-24 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/90 dark:border-white/10 rounded-lg px-2.5 py-1 text-right text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white pr-7 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="pointer-events-none absolute right-2 text-[11px] text-neutral-400">
                      w
                    </span>
                  </div>

                  {/* Delete button (for custom sections or any removable section) */}
                  {section.isCustom ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteSection(section.id)}
                      className="p-1 rounded-md text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Delete section"
                      aria-label={`Delete ${section.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <div className="w-5" aria-hidden="true" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Section Creation Controls */}
        <div className="pt-2">
          {isAddingSection ? (
            <div className="p-3 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#2C2C2E] space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  Define New Section
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingSection(false)}
                  className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
                  placeholder="e.g. Literature Review, Methodology, Case Analysis..."
                  className="flex-1 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleAddSection()}
                  disabled={!newSectionTitle.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              {/* Quick suggestions */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">Quick add:</span>
                {COMMON_SECTION_SUGGESTIONS.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleAddSection(sug)}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                  >
                    + {sug}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingSection(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-white/5 border border-dashed border-neutral-300 dark:border-white/15 transition-colors cursor-pointer w-full justify-center py-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Section</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
