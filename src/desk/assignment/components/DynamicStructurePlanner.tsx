import React, { useState } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
  Check,
  AlertCircle,
  FileText,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Layers,
  StickyNote,
} from "lucide-react";
import type {
  AssignmentStructure,
  AssignmentMainHeading,
  AssignmentSubheading,
} from "../types";
import {
  autoBalanceStructure,
  distributeRemainingWords,
  adjustSubheadingWordCount,
  addMainHeading,
  addSubheading,
  removeSubheading,
  removeMainHeading,
  reorderHeadings,
  reorderSubheadings,
  updateSubheadingNotes,
  updateMainHeadingTitle,
  updateSubheadingTitle,
  generateDynamicAssignmentStructure,
} from "../services/outlineService";

export interface DynamicStructurePlannerProps {
  structure: AssignmentStructure;
  targetWordCount: number;
  onStructureChange?: (structure: AssignmentStructure) => void;
  onChange?: (structure: AssignmentStructure) => void;
  onTargetWordCountChange?: (target: number) => void;
  question?: string;
  assignmentQuestion?: string;
  assignmentType?: string;
  academicLevel?: string;
  isConfirmed?: boolean;
  onConfirmStructure?: () => void;
  className?: string;
}

export function DynamicStructurePlanner({
  structure,
  targetWordCount,
  onStructureChange,
  onChange,
  onTargetWordCountChange,
  question = "",
  assignmentQuestion = "",
  assignmentType = "essay",
  academicLevel = "undergraduate",
  isConfirmed = false,
  onConfirmStructure,
  className = "",
}: DynamicStructurePlannerProps) {
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [newHeadingTitle, setNewHeadingTitle] = useState("");
  const [isAddingHeading, setIsAddingHeading] = useState(false);
  const [activeSubheadingId, setActiveSubheadingId] = useState<string | null>(null);

  const effectiveQuestion = question || assignmentQuestion || "";

  const notifyChange = (updated: AssignmentStructure) => {
    onStructureChange?.(updated);
    onChange?.(updated);
  };

  const totalAllocated = structure.totalAllocated || 0;
  const difference = targetWordCount - totalAllocated;
  const isBalanced = totalAllocated === targetWordCount;
  const isOver = totalAllocated > targetWordCount;
  const allocationPercent = targetWordCount > 0 ? Math.round((totalAllocated / targetWordCount) * 100) : 0;

  const toggleNotes = (id: string) => {
    setExpandedNotes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAdjustWords = (subheadingId: string, delta: number) => {
    const updated = adjustSubheadingWordCount(structure, subheadingId, delta);
    notifyChange(updated);
  };

  const handleExactWords = (subheadingId: string, words: number) => {
    const updated = adjustSubheadingWordCount(structure, subheadingId, { exact: words });
    notifyChange(updated);
  };

  const handleAutoBalance = () => {
    const updated = autoBalanceStructure(structure, targetWordCount);
    notifyChange(updated);
  };

  const handleDistributeRemaining = () => {
    const updated = distributeRemainingWords(structure, targetWordCount);
    notifyChange(updated);
  };

  const handleResetToAI = () => {
    const fresh = generateDynamicAssignmentStructure({
      question: effectiveQuestion,
      assignmentType: assignmentType as any,
      academicLevel: academicLevel as any,
      targetWordCount,
      currentStructure: structure,
    });
    notifyChange(fresh);
  };

  const handleCreateHeading = () => {
    const title = newHeadingTitle.trim();
    const updated = addMainHeading(structure, title || undefined);
    notifyChange(updated);
    setNewHeadingTitle("");
    setIsAddingHeading(false);
  };

  const handleCreateSubheading = (headingId: string) => {
    const updated = addSubheading(structure, headingId);
    notifyChange(updated);
  };

  const handleDeleteHeading = (headingId: string) => {
    const updated = removeMainHeading(structure, headingId);
    notifyChange(updated);
  };

  const handleDeleteSubheading = (subheadingId: string) => {
    const updated = removeSubheading(structure, subheadingId);
    notifyChange(updated);
  };

  const handleMoveHeading = (fromIdx: number, toIdx: number) => {
    const updated = reorderHeadings(structure, fromIdx, toIdx);
    notifyChange(updated);
  };

  const handleMoveSubheading = (headingId: string, fromIdx: number, toIdx: number) => {
    const updated = reorderSubheadings(structure, headingId, fromIdx, toIdx);
    notifyChange(updated);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Header & Target Word Count Input */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
              <span>Target Word Count & Section Allocations</span>
              <span className="text-rose-500 text-xs">*</span>
            </label>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Structure v{structure.version || 1}
            </span>
            {isConfirmed && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Check className="w-2.5 h-2.5" />
                <span>Confirmed</span>
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Dynamic Assignment Structure &amp; Word Allocation calibrated from your question. Add, rename, reorder, and calibrate word targets.
          </p>
        </div>

        {/* Global Target Word Count Input */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex items-center">
            <input
              type="number"
              min={100}
              step={50}
              value={targetWordCount || ""}
              onChange={(e) => onTargetWordCountChange?.(Math.max(0, parseInt(e.target.value, 10) || 0))}
              aria-label="Target Word Count"
              className="w-32 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-xl px-3 py-1.5 text-right text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white tabular-nums pr-12 shadow-2xs"
              placeholder="2000"
            />
            <span className="pointer-events-none absolute right-3 text-xs font-medium text-neutral-400">
              words
            </span>
          </div>
        </div>
      </div>

      {/* Main Structure Workspace Card */}
      <div className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] p-4 sm:p-5 space-y-4">
        {/* Status Bar & Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200/60 dark:border-white/5">
          <div className="flex items-center gap-2.5 flex-wrap text-xs">
            <span className="px-2.5 py-1 rounded-md bg-neutral-200/60 dark:bg-white/10 font-mono text-neutral-700 dark:text-neutral-300 font-semibold">
              Target: {targetWordCount.toLocaleString()} words
            </span>
            <span className="px-2.5 py-1 rounded-md bg-neutral-200/60 dark:bg-white/10 font-mono text-neutral-700 dark:text-neutral-300 font-semibold">
              Allocated: {totalAllocated.toLocaleString()} words
            </span>
            <span
              className={`px-2.5 py-1 rounded-md font-mono font-semibold flex items-center gap-1.5 ${
                isBalanced
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : isOver
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
              }`}
            >
              {isBalanced ? (
                <Check className="w-3 h-3 stroke-[2.5]" />
              ) : (
                <AlertCircle className="w-3 h-3" />
              )}
              <span>
                {isBalanced
                  ? "Remaining: 0 words (Balanced)"
                  : isOver
                  ? `Over: ${Math.abs(difference).toLocaleString()} words`
                  : `Remaining: ${difference.toLocaleString()} words`}
              </span>
            </span>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleAutoBalance}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 hover:border-neutral-300 transition-colors cursor-pointer shadow-2xs"
              title="Proportionally auto-balance all subheadings to equal target word count"
              aria-label="Auto-Balance"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Auto-Balance</span>
            </button>

            <button
              type="button"
              onClick={handleDistributeRemaining}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 hover:border-neutral-300 transition-colors cursor-pointer shadow-2xs"
              title="Distribute remaining words evenly across all subheadings"
              aria-label="Distribute Remaining"
            >
              <SlidersHorizontal className="w-3 h-3 text-blue-500" />
              <span>Distribute Remaining</span>
            </button>

            <button
              type="button"
              onClick={handleResetToAI}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Reset to AI-generated analytical structure"
              aria-label="Reset AI Suggestions"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset AI Suggestions</span>
            </button>
          </div>
        </div>

        {/* Dynamic Main Headings & Subheadings List */}
        <div className="space-y-4">
          {structure.headings.map((heading, hIdx) => {
            const headingPercentage =
              targetWordCount > 0
                ? Math.round((heading.targetWordCount / targetWordCount) * 100)
                : 0;

            return (
              <div
                key={heading.id}
                className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1E1E20] shadow-xs overflow-hidden transition-all group/heading"
              >
                {/* Main Heading Header */}
                <div className="p-3.5 sm:px-4 bg-neutral-100/60 dark:bg-white/[0.04] border-b border-neutral-200/60 dark:border-white/5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-bold flex items-center justify-center shrink-0">
                      {heading.number}
                    </span>
                    <span className="sr-only">{heading.title}</span>
                    <input
                      type="text"
                      value={heading.title}
                      onChange={(e) => {
                        const updated = updateMainHeadingTitle(structure, heading.id, e.target.value);
                        notifyChange(updated);
                      }}
                      placeholder="Main Heading Title"
                      className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-neutral-100 bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-neutral-500 focus:outline-none py-0.5 truncate flex-1 min-w-0"
                    />
                  </div>

                  {/* Heading Word Budget & Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">
                      {heading.targetWordCount.toLocaleString()} words
                    </span>
                    <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500 tabular-nums hidden sm:inline">
                      (~{headingPercentage}%)
                    </span>

                    {/* Reorder Buttons */}
                    <div className="flex items-center gap-0.5 text-neutral-400">
                      <button
                        type="button"
                        onClick={() => handleMoveHeading(hIdx, hIdx - 1)}
                        disabled={hIdx === 0}
                        title="Move heading up"
                        className="p-1 rounded hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveHeading(hIdx, hIdx + 1)}
                        disabled={hIdx === structure.headings.length - 1}
                        title="Move heading down"
                        className="p-1 rounded hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Add Subheading Button */}
                    <button
                      type="button"
                      onClick={() => handleCreateSubheading(heading.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-neutral-200/70 hover:bg-neutral-300 dark:bg-white/10 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                      title="Add a subheading to this section"
                    >
                      <Plus className="w-3 h-3" />
                      <span className="hidden sm:inline">Subheading</span>
                    </button>

                    {/* Delete Heading */}
                    {structure.headings.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteHeading(heading.id)}
                        className="p-1 text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                        title="Delete main heading"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Subheadings Container */}
                <div className="p-3 sm:p-4 space-y-2.5">
                  {heading.subheadings.map((sub, sIdx) => {
                    const subPercent =
                      targetWordCount > 0
                        ? Math.round((sub.targetWordCount / targetWordCount) * 100)
                        : 0;
                    const isNotesOpen = expandedNotes[sub.id];

                    return (
                      <div
                        key={sub.id}
                        className="p-2.5 sm:p-3 rounded-lg border border-neutral-200/70 dark:border-white/5 bg-neutral-50/70 dark:bg-white/[0.02] hover:border-neutral-300 dark:hover:border-white/15 transition-all space-y-2 group/sub"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          {/* Subheading Title & Number */}
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-neutral-500 dark:text-neutral-400 shrink-0 w-7">
                              {sub.numberStr}
                            </span>
                            <span className="sr-only">{sub.title}</span>
                            <input
                              type="text"
                              value={sub.title}
                              onChange={(e) => {
                                const updated = updateSubheadingTitle(structure, sub.id, e.target.value);
                                notifyChange(updated);
                              }}
                              placeholder="Subheading Title"
                              className="text-xs font-medium text-neutral-900 dark:text-neutral-100 bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-neutral-500 focus:outline-none py-0.5 truncate flex-1 min-w-0"
                            />
                          </div>

                          {/* Word Count Adjustment Controls */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500 tabular-nums hidden md:inline mr-1">
                              ~{subPercent}%
                            </span>

                            {/* -50 Words */}
                            <button
                              type="button"
                              onClick={() => handleAdjustWords(sub.id, -50)}
                              className="px-1.5 py-1 text-[11px] font-mono font-semibold rounded bg-neutral-200/60 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                              title="Decrease by 50 words"
                              aria-label="-50"
                            >
                              -50
                            </button>

                            {/* Direct Word Input */}
                            <div className="relative flex items-center">
                              <input
                                type="number"
                                min={0}
                                step={25}
                                value={sub.targetWordCount || ""}
                                onChange={(e) =>
                                  handleExactWords(sub.id, parseInt(e.target.value, 10) || 0)
                                }
                                aria-label={`Word count for ${sub.title}`}
                                className="w-20 bg-white dark:bg-[#2C2C2E] border border-neutral-200/90 dark:border-white/10 rounded-md px-2 py-1 text-right text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white pr-6 tabular-nums"
                              />
                              <span className="pointer-events-none absolute right-1.5 text-[10px] text-neutral-400">
                                w
                              </span>
                            </div>

                            {/* +50 Words */}
                            <button
                              type="button"
                              onClick={() => handleAdjustWords(sub.id, 50)}
                              className="px-1.5 py-1 text-[11px] font-mono font-semibold rounded bg-neutral-200/60 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                              title="Increase by 50 words"
                              aria-label="+50"
                            >
                              +50
                            </button>

                            {/* Reorder Subheading Buttons */}
                            <div className="flex items-center text-neutral-400 pl-1">
                              <button
                                type="button"
                                onClick={() => handleMoveSubheading(heading.id, sIdx, sIdx - 1)}
                                disabled={sIdx === 0}
                                title="Move subheading up"
                                className="p-1 rounded hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <ArrowUp className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveSubheading(heading.id, sIdx, sIdx + 1)}
                                disabled={sIdx === heading.subheadings.length - 1}
                                title="Move subheading down"
                                className="p-1 rounded hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <ArrowDown className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            {/* Notes toggle button */}
                            <button
                              type="button"
                              onClick={() => toggleNotes(sub.id)}
                              className={`p-1 rounded text-xs transition-colors cursor-pointer ml-0.5 ${
                                sub.notes || isNotesOpen
                                  ? "text-blue-600 dark:text-blue-400 bg-blue-500/10"
                                  : "text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                              }`}
                              title={sub.notes ? "Edit section notes" : "Add section notes"}
                            >
                              <StickyNote className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Subheading */}
                            {heading.subheadings.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSubheading(sub.id)}
                                className="p-1 text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                                title="Delete subheading"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Collapsible / Editable Notes & Guidance Box */}
                        {(isNotesOpen || sub.notes) && (
                          <div className="pt-2 border-t border-neutral-200/50 dark:border-white/5 space-y-1.5 animate-in fade-in duration-100">
                            <label className="text-[10px] uppercase font-semibold text-neutral-500 tracking-wider flex items-center justify-between">
                              <span>Author Notes & Research Instructions for Drafting:</span>
                              <span className="text-neutral-400 normal-case font-normal">Passed directly to research & drafting engine</span>
                            </label>
                            <input
                              type="text"
                              value={sub.notes || ""}
                              onChange={(e) => {
                                const updated = updateSubheadingNotes(structure, sub.id, e.target.value);
                                notifyChange(updated);
                              }}
                              placeholder="e.g. Focus on empirical evidence from 2022-2025; address debt-trap critique..."
                              className="w-full text-xs p-2 rounded-lg bg-white dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                            />
                            {sub.guidance && (
                              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 italic">
                                AI Academic Scope: {sub.guidance}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Main Heading Button / Form */}
        <div className="pt-1">
          {isAddingHeading ? (
            <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1E1E20] space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  New Main Analytical Heading
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingHeading(false)}
                  className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newHeadingTitle}
                  onChange={(e) => setNewHeadingTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateHeading()}
                  placeholder="e.g. Geopolitical Implications & Security Architecture"
                  className="flex-1 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateHeading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Add Heading
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingHeading(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 border border-dashed border-neutral-300 dark:border-white/15 transition-colors cursor-pointer w-full justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Main Analytical Heading</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DynamicStructurePlanner;
