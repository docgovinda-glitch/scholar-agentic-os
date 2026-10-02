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
  X,
  Edit2,
  BookOpen,
  CheckCircle2,
  BookmarkCheck,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import type {
  AssignmentStructure,
  AssignmentMainHeading,
  AssignmentSubheading,
  ResearchSourceReference,
  QuestionMappingMatrixItem,
} from "../types";
import {
  autoBalanceStructure,
  distributeRemainingWords,
  adjustSubheadingWordCount,
  adjustHeadingWordCount,
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
  updateThesisStatement,
  addKeyPoint,
  removeKeyPoint,
  updateKeyPoint,
  addTargetFramework,
  removeTargetFramework,
} from "../services/outlineService";
import { safeFormatLabel } from "../../../utils/briefExtractor";

export interface DynamicStructurePlannerProps {
  structure: AssignmentStructure;
  targetWordCount: number;
  onStructureChange?: (structure: AssignmentStructure) => void;
  onChange?: (structure: AssignmentStructure) => void;
  onTargetWordCountChange?: (target: number) => void;
  onRegenerateOutline?: () => void;
  question?: string;
  assignmentQuestion?: string;
  assignmentType?: string;
  academicLevel?: string;
  writingTone?: string;
  citationStyle?: string;
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
  onRegenerateOutline,
  question = "",
  assignmentQuestion = "",
  assignmentType = "essay",
  academicLevel = "undergraduate",
  writingTone,
  citationStyle,
  isConfirmed = false,
  onConfirmStructure,
  className = "",
}: DynamicStructurePlannerProps) {
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [expandedBlueprintHeadings, setExpandedBlueprintHeadings] = useState<Record<string, boolean>>({});
  const [expandedBlueprintSubheadings, setExpandedBlueprintSubheadings] = useState<Record<string, boolean>>({});
  const [newHeadingTitle, setNewHeadingTitle] = useState("");
  const [isAddingHeading, setIsAddingHeading] = useState(false);
  const [activeSubheadingId, setActiveSubheadingId] = useState<string | null>(null);
  const [newFramework, setNewFramework] = useState("");

  const toggleHeadingBlueprint = (headingId: string) => {
    setExpandedBlueprintHeadings((prev) => ({ ...prev, [headingId]: !prev[headingId] }));
  };

  const toggleSubheadingBlueprint = (subId: string) => {
    setExpandedBlueprintSubheadings((prev) => ({ ...prev, [subId]: !prev[subId] }));
  };

  const effectiveQuestion = question || assignmentQuestion || "";

  const notifyChange = (updated: AssignmentStructure) => {
    onStructureChange?.(updated);
    onChange?.(updated);
  };

  const handleAddFramework = (name: string) => {
    if (!name.trim()) return;
    const updated = addTargetFramework(structure, name.trim());
    notifyChange(updated);
    setNewFramework("");
  };

  const handleRemoveFramework = (index: number) => {
    const updated = removeTargetFramework(structure, index);
    notifyChange(updated);
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

  const handleAdjustHeadingWords = (headingId: string, delta: number) => {
    const updated = adjustHeadingWordCount(structure, headingId, delta);
    notifyChange(updated);
  };

  const handleExactHeadingWords = (headingId: string, words: number) => {
    const updated = adjustHeadingWordCount(structure, headingId, { exact: words });
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
      writingTone,
      citationStyle,
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

        {/* Global Target Word Count Input & Stepper */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onTargetWordCountChange?.(Math.max(100, (Number(targetWordCount) || 2000) - 250))}
            aria-label="Decrease target word count"
            className="h-8 w-8 rounded-lg border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#2C2C2E] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-semibold text-sm shrink-0"
            title="Decrease by 250 words"
          >
            −
          </button>
          <div className="relative flex items-center">
            <input
              type="number"
              min={100}
              max={50000}
              step={50}
              value={targetWordCount || ""}
              onChange={(e) => {
                const val = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                onTargetWordCountChange?.(isNaN(val) ? 0 : Math.min(50000, Math.max(0, val)));
              }}
              aria-label="Target Word Count"
              className="w-32 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-xl px-3 py-1.5 text-right text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white tabular-nums pr-12 shadow-2xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="e.g. 2000"
            />
            <span className="pointer-events-none absolute right-3 text-xs font-medium text-neutral-400">
              words
            </span>
          </div>
          <button
            type="button"
            onClick={() => onTargetWordCountChange?.(Math.min(50000, (Number(targetWordCount) || 2000) + 250))}
            aria-label="Increase target word count"
            className="h-8 w-8 rounded-lg border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#2C2C2E] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-semibold text-sm shrink-0"
            title="Increase by 250 words"
          >
            +
          </button>
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

            {onRegenerateOutline && (
              <button
                type="button"
                onClick={onRegenerateOutline}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 hover:border-neutral-300 transition-colors cursor-pointer shadow-2xs"
                title="Regenerate outline from current brief"
                aria-label="Regenerate Outline"
              >
                <RotateCcw className="w-3 h-3 text-purple-500" />
                <span>Regenerate Outline</span>
              </button>
            )}

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

        {/* Introduction & Core Working Thesis (tailored to writing tone) */}
        <div className="p-3.5 sm:px-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1E1E20] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                T
              </span>
              <div>
                <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  <span>Introduction &amp; Core Working Thesis</span>
                  {writingTone && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 capitalize">
                      {safeFormatLabel(writingTone)} tone
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Tone-calibrated problem statement and working thesis to anchor analysis and evidence synthesis.
                </p>
              </div>
            </div>
          </div>
          <textarea
            value={structure.thesisStatement || ""}
            onChange={(e) => {
              const updated = updateThesisStatement(structure, e.target.value);
              notifyChange(updated);
            }}
            placeholder="Core thesis statement or problem formulation tailored to your selected tone..."
            rows={2}
            className="w-full text-xs p-2.5 rounded-lg bg-neutral-50/80 dark:bg-white/[0.03] border border-neutral-200/90 dark:border-white/10 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-y font-normal leading-relaxed"
          />
        </div>

        {/* Theoretical Frameworks & Analytical Models */}
        {(() => {
          const frameworksList = Array.isArray(structure.targetFrameworks)
            ? structure.targetFrameworks
            : typeof structure.targetFrameworks === "string" && structure.targetFrameworks !== "[Circular]"
              ? [structure.targetFrameworks]
              : [];

          return (
            <div className="p-3.5 sm:px-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1E1E20] shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-bold flex items-center justify-center shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      Target Theoretical Frameworks &amp; Models
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                      {frameworksList.length} active
                    </span>
                  </div>
                </div>
              </div>

              {/* Frameworks Chip List */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {frameworksList.map((framework, fIdx) => (
                  <span
                    key={fIdx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-white/[0.05] border border-neutral-200/80 dark:border-white/10 text-neutral-800 dark:text-neutral-200 group/chip"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span>{framework}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFramework(fIdx)}
                      className="p-0.5 text-neutral-400 hover:text-rose-500 transition-colors cursor-pointer"
                      title={`Remove ${framework}`}
                      aria-label={`Remove framework ${framework}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {/* Inline input to add framework */}
                <input
                  type="text"
                  value={newFramework}
                  onChange={(e) => setNewFramework(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFramework.trim()) {
                      e.preventDefault();
                      handleAddFramework(newFramework);
                    }
                  }}
                  placeholder="+ Add framework or model (Press Enter)..."
                  className="text-xs px-2.5 py-1 rounded-lg bg-neutral-50/80 dark:bg-white/[0.02] border border-dashed border-neutral-300 dark:border-white/15 text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:border-neutral-500 focus:bg-white dark:focus:bg-[#2C2C2E] transition-colors min-w-[200px]"
                  aria-label="Add theoretical framework"
                />
              </div>
            </div>
          );
        })()}

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
                <div className="p-3.5 sm:px-4 bg-neutral-100/60 dark:bg-white/[0.04] border-b border-neutral-200/60 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-bold flex items-center justify-center shrink-0">
                      {heading.number}
                    </span>
                    <span className="sr-only">{heading.title}</span>
                    <div className="relative flex-1 min-w-0 flex items-center">
                      <input
                        type="text"
                        value={heading.title}
                        onChange={(e) => {
                          const updated = updateMainHeadingTitle(structure, heading.id, e.target.value);
                          notifyChange(updated);
                        }}
                        placeholder="Main Heading Title"
                        aria-label={`Heading ${heading.number}: ${heading.title}`}
                        className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-neutral-100 bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-neutral-500 focus:outline-none py-0.5 truncate w-full pr-6"
                      />
                      <Edit2 className="w-3 h-3 text-neutral-400 absolute right-1 pointer-events-none opacity-40 group-hover/heading:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  {/* Heading Word Budget & Controls */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">
                      {heading.targetWordCount.toLocaleString()} words
                    </span>
                    <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500 tabular-nums hidden sm:inline">
                      (~{headingPercentage}%)
                    </span>

                    {/* Section Word Count Stepper & Input */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAdjustHeadingWords(heading.id, -50)}
                        className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-neutral-200/60 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                        title="Decrease section word budget by 50 words"
                        aria-label={`Decrease section ${heading.number} word count by 50`}
                      >
                        -50
                      </button>
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={0}
                          step={25}
                          value={heading.targetWordCount || ""}
                          onChange={(e) =>
                            handleExactHeadingWords(heading.id, parseInt(e.target.value, 10) || 0)
                          }
                          aria-label={`Word count for section ${heading.title}`}
                          className="w-16 bg-white dark:bg-[#2C2C2E] border border-neutral-200/90 dark:border-white/10 rounded px-1.5 py-0.5 text-right text-[11px] font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white pr-5 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="pointer-events-none absolute right-1 text-[9px] text-neutral-400">
                          w
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAdjustHeadingWords(heading.id, 50)}
                        className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-neutral-200/60 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                        title="Increase section word budget by 50 words"
                        aria-label={`Increase section ${heading.number} word count by 50`}
                      >
                        +50
                      </button>
                    </div>

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

                    {/* Research Blueprint Toggle */}
                    {/* Research Basis & Sources Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleHeadingBlueprint(heading.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                        expandedBlueprintHeadings[heading.id]
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-2xs"
                          : "bg-neutral-100 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200/70 dark:border-white/10"
                      }`}
                      title="View research basis and supporting scholarly sources"
                      aria-label={`Research basis for section ${heading.number}`}
                    >
                      <BookOpen className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                      <span className="hidden sm:inline">Research basis</span>
                      {(heading.scholarlySources || []).length > 0 && (
                        <span className="text-[10px] opacity-75 font-mono">
                          · {heading.scholarlySources?.length}
                        </span>
                      )}
                    </button>

                    {/* Add Subheading Button */}
                    <button
                      type="button"
                      onClick={() => handleCreateSubheading(heading.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-neutral-200/70 hover:bg-neutral-300 dark:bg-white/10 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                      title="Add a subheading to this section"
                      aria-label={`Add subheading to section ${heading.number}`}
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
                        aria-label={`Delete heading ${heading.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Main Heading Research Basis Drawer */}
                {expandedBlueprintHeadings[heading.id] && (
                  <div className="p-3.5 sm:p-4 bg-neutral-50/70 dark:bg-white/[0.02] border-b border-neutral-200/60 dark:border-white/5 space-y-3 animate-in fade-in duration-150">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Section {heading.number} Research Basis</span>
                      </span>
                      {heading.assignmentQuestionAddressed && (
                        <span className="px-2 py-0.5 rounded text-[10px] text-neutral-600 dark:text-neutral-300 bg-neutral-200/50 dark:bg-white/5 truncate max-w-sm">
                          Directly answers: {heading.assignmentQuestionAddressed}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {heading.purpose && (
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#2C2C2E] border border-neutral-200/70 dark:border-white/10 space-y-0.5">
                          <strong className="text-[10px] uppercase text-neutral-500 font-bold block">Purpose &amp; Objective</strong>
                          <p className="text-[11px] text-neutral-800 dark:text-neutral-200">{heading.purpose}</p>
                        </div>
                      )}
                      {heading.evidenceRequired && (
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#2C2C2E] border border-neutral-200/70 dark:border-white/10 space-y-0.5">
                          <strong className="text-[10px] uppercase text-neutral-500 font-bold block">Empirical Evidence Required</strong>
                          <p className="text-[11px] text-neutral-800 dark:text-neutral-200">{heading.evidenceRequired}</p>
                        </div>
                      )}
                      {heading.counterarguments && heading.counterarguments.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#2C2C2E] border border-neutral-200/70 dark:border-white/10 space-y-0.5">
                          <strong className="text-[10px] uppercase text-neutral-500 font-bold block">Competing Perspectives &amp; Debates</strong>
                          <p className="text-[11px] text-neutral-800 dark:text-neutral-200">{heading.counterarguments.join(" | ")}</p>
                        </div>
                      )}
                      {heading.expectedContribution && (
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#2C2C2E] border border-neutral-200/70 dark:border-white/10 space-y-0.5">
                          <strong className="text-[10px] uppercase text-neutral-500 font-bold block">Contribution to Thesis</strong>
                          <p className="text-[11px] text-neutral-800 dark:text-neutral-200">{heading.expectedContribution}</p>
                        </div>
                      )}
                    </div>

                    {/* Scholarly Sources */}
                    {heading.scholarlySources && heading.scholarlySources.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] uppercase font-bold text-neutral-500 dark:text-neutral-400 tracking-wider flex items-center gap-1">
                          <BookmarkCheck className="w-3 h-3 text-indigo-500" />
                          <span>Supporting Scholarly Sources ({heading.scholarlySources.length})</span>
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {heading.scholarlySources.map((src, sIdx) => (
                            <div
                              key={sIdx}
                              className="p-2 rounded-lg bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 shadow-2xs space-y-1"
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <span className="text-xs font-semibold text-neutral-900 dark:text-white line-clamp-1">
                                  {src.title}
                                </span>
                                {src.role && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 shrink-0">
                                    {src.role}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                {src.authors?.slice(0, 2).join(", ")} ({src.year}) • {src.journalOrPublisher || "Academic Press"}
                              </p>
                              {src.relevance && (
                                <p className="text-[10px] text-neutral-600 dark:text-neutral-300 italic line-clamp-2">
                                  "{src.relevance}"
                                </p>
                              )}
                              <span className="text-[9px] font-mono text-neutral-400 block pt-0.5">
                                Citation: {src.citation}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Subheadings Container */}
                <div className="p-3 sm:p-4 space-y-2.5">
                  {heading.subheadings.length === 0 ? (
                    <div className="py-4 px-3 text-center rounded-lg border border-dashed border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.01]">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                        No subheadings in this section yet.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleCreateSubheading(heading.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Subheading</span>
                      </button>
                    </div>
                  ) : (
                    heading.subheadings.map((sub, sIdx) => {
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
                              <div className="relative flex-1 min-w-0 flex items-center">
                                <input
                                  type="text"
                                  value={sub.title}
                                  onChange={(e) => {
                                    const updated = updateSubheadingTitle(structure, sub.id, e.target.value);
                                    notifyChange(updated);
                                  }}
                                  placeholder="Subheading Title"
                                  aria-label={`Subheading ${sub.numberStr}: ${sub.title}`}
                                  className="text-xs font-medium text-neutral-900 dark:text-neutral-100 bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-neutral-500 focus:outline-none py-0.5 truncate w-full pr-5"
                                />
                                <Edit2 className="w-2.5 h-2.5 text-neutral-400 absolute right-1 pointer-events-none opacity-30 group-hover/sub:opacity-100 transition-opacity" />
                              </div>
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
                                  className="w-20 bg-white dark:bg-[#2C2C2E] border border-neutral-200/90 dark:border-white/10 rounded-md px-2 py-1 text-right text-xs font-semibold text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white pr-6 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

                              {/* Research Basis toggle button */}
                              <button
                                type="button"
                                onClick={() => toggleSubheadingBlueprint(sub.id)}
                                className={`p-1 rounded text-xs transition-colors cursor-pointer ml-0.5 ${
                                  expandedBlueprintSubheadings[sub.id]
                                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10"
                                    : "text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                }`}
                                title="Research basis & supporting sources"
                                aria-label="Toggle Subheading Research Basis"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                              </button>

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
                              <button
                                type="button"
                                onClick={() => handleDeleteSubheading(sub.id)}
                                className="p-1 text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                                title="Delete subheading"
                                aria-label={`Delete subheading ${sub.title}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                        {/* H3 Arguments, Evidence & Focus Areas */}
                        <div className="pt-2 border-t border-neutral-200/50 dark:border-white/5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 tracking-wider flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              <span>H3 Specific Arguments &amp; Evidence Points ({(sub.keyPoints || []).length})</span>
                            </span>
                          </div>

                          {sub.keyPoints && sub.keyPoints.length > 0 && (
                            <div className="space-y-1 pl-2 border-l-2 border-blue-500/20">
                              {sub.keyPoints.map((point, pIdx) => (
                                <div key={pIdx} className="flex items-center gap-2 group/h3">
                                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono shrink-0">
                                    {sub.numberStr}.{pIdx + 1}
                                  </span>
                                  <input
                                    type="text"
                                    value={point}
                                    onChange={(e) => {
                                      const updated = updateKeyPoint(structure, sub.id, pIdx, e.target.value);
                                      notifyChange(updated);
                                    }}
                                    placeholder="H3 argument or focus point..."
                                    className="flex-1 text-xs py-0.5 px-1.5 rounded bg-transparent border border-transparent hover:border-neutral-200 dark:hover:border-white/10 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-white dark:focus:bg-[#2C2C2E] text-neutral-800 dark:text-neutral-200 transition-colors"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = removeKeyPoint(structure, sub.id, pIdx);
                                      notifyChange(updated);
                                    }}
                                    className="opacity-0 group-hover/h3:opacity-100 p-0.5 text-neutral-400 hover:text-rose-500 transition-opacity cursor-pointer"
                                    title="Remove H3 focus point"
                                    aria-label={`Remove H3 focus point ${point}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add H3 focus point input */}
                          <div className="flex items-center gap-1.5 pl-2 pt-0.5">
                            <input
                              type="text"
                              placeholder="+ Add H3 specific argument or evidence focus (Press Enter)..."
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                  const updated = addKeyPoint(structure, sub.id, e.currentTarget.value.trim());
                                  notifyChange(updated);
                                  e.currentTarget.value = "";
                                }
                              }}
                              className="text-[11px] py-1 px-2.5 rounded-md bg-white/70 dark:bg-white/5 border border-dashed border-neutral-300 dark:border-white/15 text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:border-blue-500 w-full"
                            />
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

                        {/* Subheading Research Basis Panel */}
                        {expandedBlueprintSubheadings[sub.id] && (
                          <div className="pt-2 border-t border-indigo-500/20 dark:border-indigo-500/10 space-y-2 animate-in fade-in duration-100 bg-indigo-500/[0.02] p-2.5 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wider flex items-center gap-1">
                                <BookOpen className="w-3 h-3" />
                                <span>{sub.numberStr} Research Basis</span>
                              </span>
                              {sub.assignmentQuestionAddressed && (
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                                  Addresses: {sub.assignmentQuestionAddressed}
                                </span>
                              )}
                            </div>

                            {sub.purpose && (
                              <p className="text-[11px] text-neutral-700 dark:text-neutral-300">
                                <strong>Analytical Focus: </strong>{sub.purpose}
                              </p>
                            )}

                            {sub.evidenceRequired && (
                              <p className="text-[11px] text-neutral-700 dark:text-neutral-300">
                                <strong>Evidence Required: </strong>{sub.evidenceRequired}
                              </p>
                            )}

                            {sub.scholarlySources && sub.scholarlySources.length > 0 && (
                              <div className="space-y-1 pt-1">
                                <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider block">
                                  Supporting Scholarly Sources:
                                </span>
                                <div className="space-y-1">
                                  {sub.scholarlySources.map((src, sIdx) => (
                                    <div
                                      key={sIdx}
                                      className="p-1.5 rounded bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 text-[10px] flex items-center justify-between gap-2"
                                    >
                                      <div className="truncate">
                                        <strong className="text-neutral-800 dark:text-neutral-200">{src.citation}</strong>
                                        <span className="text-neutral-500 ml-1.5 truncate">"{src.title}"</span>
                                      </div>
                                      {src.role && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                                          {src.role}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }))}
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
