import React, { useEffect, useMemo, useRef } from "react";
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

  const visiblePhases = useMemo(() => ASSIGNMENT_PHASES.map((p, idx) => ({ ...p, displayNumber: idx + 1 })), []);

  // A short fact per stage (no made-up percentages): what is there, not a score.
  const phaseFacts = useMemo<Record<AssignmentPhaseId, string>>(() => {
    const hasBrief = Boolean(question && question.trim().length > 10);
    const hasOutline = hasBrief && (structure?.headings?.length ?? 0) > 0;
    const report = submissionReport as { bandLabel?: string } | null;
    const checks = report?.bandLabel?.match(/^(\d+) of (\d+)/);
    return {
      extract: hasBrief ? "brief added" : "",
      understand: structure?.isConfirmed ? "confirmed" : hasOutline ? "outline ready" : "",
      sources: approvedSourceIds.length ? `${approvedSourceIds.length} approved` : "",
      drafting: currentWordCount > 0 ? `${Math.min(999, wordCountPercentage || 0)}% of words` : "",
      submission: checks ? `${checks[1]}/${checks[2]} checks` : "",
    };
  }, [structure, question, approvedSourceIds.length, wordCountPercentage, currentWordCount, submissionReport]);

  // On narrow screens the stepper scrolls sideways: keep the current stage in view.
  const activeStepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = activeStepRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }, [currentPhase]);

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
      className={`w-full bg-[color:var(--surface-raised)] border-b border-[color:var(--border-subtle)] px-3 pt-1 pb-2.5 sm:px-6 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-4 gap-y-2 shrink-0 transition-colors z-10 ${className}`}
      aria-label="Assignment Workflow Phases"
    >
      {/* Horizontal Progress Stepper. Below 640px it takes the whole row and the other
          stages shrink to their number, so all five fit on a phone without hidden scrolling. */}
      <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0">
        {visiblePhases.map((phase, idx) => {
          const isActive = currentPhase === phase.id;
          const status = phaseStatuses?.[phase.id] || (isActive ? "active" : "upcoming");
          const isCompleted = status === "completed";
          const formattedNumber = `0${phase.displayNumber}`;
          const fact = phaseFacts[phase.id];

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
                aria-label={`Phase ${phase.number}: ${phase.shortLabel}`}
                title={fact ? `${phase.shortLabel}: ${fact}` : phase.shortLabel}
                ref={isActive ? activeStepRef : undefined}
                aria-current={isActive ? "step" : undefined}
                className={`group flex items-center ${isActive ? "gap-2 px-3" : "gap-1 px-1.5 sm:gap-2 sm:px-3"} py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] shadow-xs font-semibold"
                    : isCompleted
                    ? "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
                    : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
                }`}
              >
                {/* Visual State: Number Badge / Completed Check / Active Indicator */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono shrink-0 transition-colors ${
                    isActive
                      ? "bg-white/20 text-white dark:bg-black/10 dark:text-neutral-900 font-bold"
                      : isCompleted
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold"
                      : "bg-[color:var(--surface-sunken)]/70 text-[color:var(--text-muted)]"
                  }`}
                >
                  <span>{formattedNumber}</span>
                </div>

                {/* Phase Icon */}
                <span className={isActive ? "text-white" : "hidden sm:inline text-[color:var(--text-muted)] group-hover:text-current"}>
                  {renderIcon(phase.iconKey, isActive)}
                </span>

                {/* Title & Percentage */}
                <div className={`${isActive ? "flex" : "hidden sm:flex"} items-center gap-1.5 truncate max-w-[130px] sm:max-w-none`}>
                  <span className="truncate">{phase.shortLabel}</span>
                  {isCompleted && <Check className="w-3 h-3 stroke-[2.5] shrink-0" aria-label="done" />}
                  {/* The current stage shows its fact; the others keep it in their tooltip, so the bar fits. */}
                  {fact && isActive && <span className="hidden md:inline text-xs tabular-nums opacity-90">{fact}</span>}
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
      <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-3 shrink-0 sm:ml-auto sm:pl-2 sm:border-l border-[color:var(--border-subtle)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2.5 text-right sm:text-left">
          <div className="flex items-center gap-1.5 text-xs tabular-nums">
            <span className="font-semibold text-[color:var(--text-primary)]">
              {currentWordCount.toLocaleString()}
            </span>
            <span className="text-[color:var(--text-muted)]">
              / {targetWordCount.toLocaleString()} words
            </span>
          </div>

          {/* Mini progress bar */}
          <div className="w-16 sm:w-24 h-1.5 bg-[color:var(--surface-inset)] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isOverLimit
                  ? "bg-amber-500"
                  : isOptimal
                  ? "bg-emerald-500"
                  : "bg-[color:var(--accent-solid)]"
              }`}
              style={{ width: `${Math.min(100, wordCountPercentage)}%` }}
            />
          </div>
        </div>

        {/* Percentage badge */}
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${
            isOverLimit
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : isOptimal
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]"
          }`}
        >
          {wordCountPercentage}%
        </span>
      </div>
    </nav>
  );
}
