import React, { useMemo } from "react";
import {
  FileText,
  Brain,
  Library,
  PenTool,
  CheckCircle2,
  ChevronRight,
  Check,
} from "lucide-react";
import {
  ASSIGNMENT_PHASES,
  type AssignmentPhaseId,
} from "../types";
import { useAssignmentWorkspace } from "../AssignmentContext";

export default function AssignmentStageNavigation({
  className = "",
  onSelectPhase,
  onSelectStage,
}: {
  className?: string;
  onSelectPhase?: (phase: AssignmentPhaseId) => void;
  onSelectStage?: () => void;
}) {
  const {
    currentPhase,
    setPhase,
    phaseStatuses,
    currentWordCount,
    targetWordCount,
    wordCountPercentage,
    structure,
    question,
    approvedSourceIds = [],
    submissionReport,
  } = useAssignmentWorkspace();

  const isOverLimit = currentWordCount > targetWordCount * 1.1;
  const isOptimal =
    currentWordCount >= targetWordCount * 0.9 &&
    currentWordCount <= targetWordCount * 1.1;

  // Global Progress Percentages for each phase
  const phasePercentages = useMemo(() => {
    const hasBrief = Boolean(question && question.trim().length > 10);
    const p1 = hasBrief ? 100 : question?.trim() ? 50 : 25;
    const p2 = structure?.isConfirmed ? 100 : structure ? 75 : hasBrief ? 50 : 0;
    const p3 = Math.min(100, Math.round((approvedSourceIds.length / 4) * 100));
    const p4 = Math.min(100, wordCountPercentage || 0);
    const p5 = submissionReport ? 100 : 0;
    return {
      extract: p1,
      understand: p2,
      sources: p3,
      drafting: p4,
      submission: p5,
    };
  }, [structure, question, approvedSourceIds.length, wordCountPercentage, submissionReport]);

  const renderIcon = (iconKey: string, isActive: boolean) => {
    const iconProps = { className: "w-3.5 h-3.5 shrink-0" };
    switch (iconKey) {
      case "FileText":
        return <FileText {...iconProps} />;
      case "Brain":
        return <Brain {...iconProps} />;
      case "Library":
        return <Library {...iconProps} />;
      case "PenTool":
        return <PenTool {...iconProps} />;
      case "CheckCircle2":
        return <CheckCircle2 {...iconProps} />;
      default:
        return <FileText {...iconProps} />;
    }
  };

  return (
    <nav
      className={`w-full bg-white dark:bg-[#1C1C1E] border-b border-neutral-200/80 dark:border-white/10 px-4 pt-1 pb-2.5 sm:px-6 flex items-center justify-between gap-4 shrink-0 transition-colors z-10 ${className}`}
      aria-label="Assignment Workflow Phases"
    >
      {/* Horizontal 5-Phase Progress Stepper */}
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0">
        {ASSIGNMENT_PHASES.map((phase, idx) => {
          const isActive = currentPhase === phase.id;
          const status = phaseStatuses?.[phase.id] || (isActive ? "active" : "upcoming");
          const isCompleted = status === "completed" || phasePercentages[phase.id] === 100;
          const formattedNumber = `0${phase.number}`;
          const progressPct = phasePercentages[phase.id];

          return (
            <React.Fragment key={phase.id}>
              {idx > 0 && (
                <div
                  className="hidden sm:flex items-center text-neutral-300 dark:text-neutral-600 px-0.5 select-none"
                  aria-hidden="true"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setPhase(phase.id);
                  onSelectPhase?.(phase.id);
                  onSelectStage?.();
                }}
                aria-label={`Phase ${phase.number}: ${phase.shortLabel}${phase.id === "extract" ? " · Phase 1: Understand" : ""}${phase.id === "sources" ? " · Phase 2: Sources" : ""}${phase.id === "drafting" ? " · Phase 3: Drafting" : ""}${phase.id === "submission" ? " · Phase 4: Submission" : ""}`}
                aria-current={isActive ? "step" : undefined}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs font-semibold"
                    : isCompleted
                    ? "bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5"
                }`}
              >
                {/* Visual State: Number Badge / Completed Check / Active Indicator */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono shrink-0 transition-colors ${
                    isActive
                      ? "bg-white/20 text-white dark:bg-black/10 dark:text-neutral-900 font-bold"
                      : isCompleted
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold"
                      : "bg-neutral-200/70 dark:bg-white/10 text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  ) : (
                    <span>{formattedNumber}</span>
                  )}
                </div>

                {/* Phase Icon */}
                <span className={isActive ? "text-white dark:text-neutral-900" : "text-neutral-400 dark:text-neutral-500 group-hover:text-current"}>
                  {renderIcon(phase.iconKey, isActive)}
                </span>

                {/* Title & Percentage */}
                <div className="flex items-center gap-1.5 truncate max-w-[130px] sm:max-w-none">
                  <span className="truncate">{phase.shortLabel}</span>
                  <span className={`text-[10px] font-mono tabular-nums ${
                    isActive ? "opacity-90" : "opacity-60"
                  }`}>
                    {progressPct}%
                  </span>
                </div>

                {/* Active Pulse Dot */}
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-600 shrink-0 animate-pulse ml-0.5" />
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Right-Aligned Live Word Budget Progress Indicator */}
      <div className="flex items-center gap-3 shrink-0 ml-auto pl-2 border-l border-neutral-200/80 dark:border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2.5 text-right sm:text-left">
          <div className="flex items-center gap-1.5 text-xs tabular-nums">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              {currentWordCount.toLocaleString()}
            </span>
            <span className="text-neutral-400 dark:text-neutral-500">
              / {targetWordCount.toLocaleString()} words
            </span>
          </div>

          {/* Mini progress bar */}
          <div className="w-16 sm:w-24 h-1.5 bg-neutral-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isOverLimit
                  ? "bg-amber-500"
                  : isOptimal
                  ? "bg-emerald-500"
                  : "bg-neutral-900 dark:bg-white"
              }`}
              style={{ width: `${Math.min(100, wordCountPercentage)}%` }}
            />
          </div>
        </div>

        {/* Percentage badge */}
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums ${
            isOverLimit
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : isOptimal
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300"
          }`}
        >
          {wordCountPercentage}%
        </span>
      </div>
    </nav>
  );
}
