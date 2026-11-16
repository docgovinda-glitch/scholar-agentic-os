import type { AcademicLevel,AssignmentType } from "../types";
import React,{ useState } from "react";
import {
Sparkles,
RotateCcw,
Check,
AlertCircle,SlidersHorizontal,GripVertical
} from "lucide-react";
import { DndContext,closestCenter,DragEndEvent } from "@dnd-kit/core";
import { SortableContext,verticalListSortingStrategy,useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
AssignmentStructure
} from "../types";
import { generateDynamicAssignmentStructure } from "../services/dynamicStructure";
import { updateThesisStatement } from "../services/outlineEditing";
import { removeTargetFramework } from "../services/outlineEditing";
import { addTargetFramework } from "../services/outlineEditing";
import { balanceAroundHeading } from "../services/outlineEditing";
import { autoBalanceStructure } from "../services/outlineEditing";
import { distributeRemainingWords } from "../services/outlineEditing";
import { reorderSubheadings } from "../services/outlineEditing";
import { reorderHeadings } from "../services/outlineEditing";
import { adjustSubheadingWordCount } from "../services/outlineEditing";
import { removeSubheading } from "../services/outlineEditing";
import { addSubheading } from "../services/outlineEditing";
import { adjustHeadingWordCount } from "../services/outlineEditing";
import { removeMainHeading } from "../services/outlineEditing";
import { addMainHeading } from "../services/outlineEditing";
import { safeFormatLabel } from "../../../utils/briefExtractor";
import { StructureAddHeading } from "./structure/StructureAddHeading";
import { StructureHeadingCard } from "./structure/StructureHeadingCard";
import { StructureFrameworks } from "./structure/StructureFrameworks";

function SortableHeadingWrapper({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 1,
    position: isDragging ? ("relative" as const) : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="group/sortable relative">
      <div
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        className="absolute -left-2 sm:-left-3.5 top-4 p-0.5 cursor-grab active:cursor-grabbing text-[color:var(--text-muted)] hover:text-neutral-600 dark:hover:text-neutral-200 hidden sm:group-hover/sortable:flex items-center justify-center transition-colors bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded shadow-sm z-20"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      {children}
    </div>
  );
}

export interface DynamicStructurePlannerProps {
  structure: AssignmentStructure;
  targetWordCount: number;
  /** `balance: false` = the structure is already balanced; save it as given. */
  onStructureChange?: (structure: AssignmentStructure, opts?: { balance?: boolean }) => void;
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
  className = "",
}: DynamicStructurePlannerProps) {
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [expandedBlueprintHeadings, setExpandedBlueprintHeadings] = useState<Record<string, boolean>>({});
  const [expandedBlueprintSubheadings, setExpandedBlueprintSubheadings] = useState<Record<string, boolean>>({});
  const [newHeadingTitle, setNewHeadingTitle] = useState("");
  const [isAddingHeading, setIsAddingHeading] = useState(false);
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = structure.headings.findIndex((h) => h.id === active.id);
      const newIndex = structure.headings.findIndex((h) => h.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const updated = reorderHeadings(structure, oldIndex, newIndex);
        notifyChange(updated);
      }
    }
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

  // The edited section keeps exactly what the student set; the others make room.
  const notifyPinned = (updated: AssignmentStructure, headingId: string) => {
    const balanced = balanceAroundHeading(updated, headingId, targetWordCount);
    onStructureChange?.(balanced, { balance: false });
    onChange?.(balanced);
  };

  const handleAdjustHeadingWords = (headingId: string, delta: number) => {
    notifyPinned(adjustHeadingWordCount(structure, headingId, delta), headingId);
  };

  const handleExactHeadingWords = (headingId: string, words: number) => {
    notifyPinned(adjustHeadingWordCount(structure, headingId, { exact: words }), headingId);
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
      assignmentType: assignmentType as AssignmentType,
      academicLevel: academicLevel as AcademicLevel,
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
            <label className="text-xs font-semibold text-[color:var(--text-primary)] flex items-center gap-1.5">
              <span>Target Word Count & Section Allocations</span>
              <span className="text-rose-500 text-xs">*</span>
            </label>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              Structure v{structure.version || 1}
            </span>
            {isConfirmed && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Check className="w-2.5 h-2.5" />
                <span>Confirmed</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
            Dynamic Assignment Structure &amp; Word Allocation
          </p>
        </div>

        {/* Global Target Word Count Input & Stepper */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onTargetWordCountChange?.(Math.max(100, (Number(targetWordCount) || 2000) - 250))}
            aria-label="Decrease target word count"
            className="h-8 w-8 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-semibold text-sm shrink-0"
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
              className="w-32 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl px-3 py-1.5 text-right text-xs font-semibold text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white tabular-nums pr-12 shadow-2xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="e.g. 2000"
            />
            <span className="pointer-events-none absolute right-3 text-xs font-medium text-[color:var(--text-muted)]">
              words
            </span>
          </div>
          <button
            type="button"
            onClick={() => onTargetWordCountChange?.(Math.min(50000, (Number(targetWordCount) || 2000) + 250))}
            aria-label="Increase target word count"
            className="h-8 w-8 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-2xs font-semibold text-sm shrink-0"
            title="Increase by 250 words"
          >
            +
          </button>
        </div>
      </div>

      {/* Main Structure Workspace Card */}
      <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/50 p-4 sm:p-5 space-y-4">
        {/* Status Bar & Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[color:var(--border-subtle)]">
          <div className="flex items-center gap-2.5 flex-wrap text-xs">
            <span className="px-2.5 py-1 rounded-md bg-[color:var(--surface-sunken)]/60 font-mono text-[color:var(--text-secondary)] font-semibold">
              Target: {targetWordCount.toLocaleString()} words
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[color:var(--surface-sunken)]/60 font-mono text-[color:var(--text-secondary)] font-semibold">
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
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-neutral-300 transition-colors cursor-pointer shadow-2xs"
              title="Proportionally auto-balance all subheadings to equal target word count"
              aria-label="Auto-Balance"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Auto-Balance</span>
            </button>

            <button
              type="button"
              onClick={handleDistributeRemaining}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-neutral-300 transition-colors cursor-pointer shadow-2xs"
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-neutral-300 transition-colors cursor-pointer shadow-2xs"
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
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
              title="Reset to AI-generated analytical structure"
              aria-label="Reset AI Suggestions"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset AI Suggestions</span>
            </button>
          </div>
        </div>

        {/* Introduction & Core Working Thesis (tailored to writing tone) */}
        <div className="p-3.5 sm:px-4 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-purple-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                T
              </span>
              <h4 className="text-xs font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
                <span>Introduction &amp; Core Working Thesis</span>
                {writingTone && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 capitalize">
                    {safeFormatLabel(writingTone)} tone
                  </span>
                )}
              </h4>
            </div>
          </div>
          <textarea
            value={structure.thesisStatement || ""}
            onChange={(e) => {
              const updated = updateThesisStatement(structure, e.target.value);
              notifyChange(updated);
            }}
            placeholder="Core thesis statement or problem formulation tailored to your assignment..."
            rows={2}
            className="w-full text-xs p-2.5 rounded-lg bg-[color:var(--surface-inset)]/80 border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-y font-normal leading-relaxed"
          />
        </div>

        <StructureFrameworks handleAddFramework={handleAddFramework} handleRemoveFramework={handleRemoveFramework} newFramework={newFramework} setNewFramework={setNewFramework} structure={structure} />

        {/* Dynamic Main Headings & Subheadings List */}
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={structure.headings.map(h => h.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4 sm:pl-3">
              {structure.headings.map((heading, hIdx) => {
                const headingPercentage =
                  targetWordCount > 0
                    ? Math.round((heading.targetWordCount / targetWordCount) * 100)
                    : 0;

                return (
                  <SortableHeadingWrapper key={heading.id} id={heading.id}>
                    <StructureHeadingCard expandedBlueprintHeadings={expandedBlueprintHeadings} expandedBlueprintSubheadings={expandedBlueprintSubheadings} expandedNotes={expandedNotes} hIdx={hIdx} handleAdjustHeadingWords={handleAdjustHeadingWords} handleAdjustWords={handleAdjustWords} handleCreateSubheading={handleCreateSubheading} handleDeleteHeading={handleDeleteHeading} handleDeleteSubheading={handleDeleteSubheading} handleExactHeadingWords={handleExactHeadingWords} handleExactWords={handleExactWords} handleMoveHeading={handleMoveHeading} handleMoveSubheading={handleMoveSubheading} heading={heading} headingPercentage={headingPercentage} notifyChange={notifyChange} structure={structure} targetWordCount={targetWordCount} toggleHeadingBlueprint={toggleHeadingBlueprint} toggleNotes={toggleNotes} toggleSubheadingBlueprint={toggleSubheadingBlueprint} />
                  </SortableHeadingWrapper>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        <StructureAddHeading handleCreateHeading={handleCreateHeading} isAddingHeading={isAddingHeading} newHeadingTitle={newHeadingTitle} setIsAddingHeading={setIsAddingHeading} setNewHeadingTitle={setNewHeadingTitle} />
      </div>
    </div>
  );
}

export default DynamicStructurePlanner;
