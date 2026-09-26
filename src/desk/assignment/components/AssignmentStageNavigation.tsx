import React from "react";
import { ASSIGNMENT_STAGES, type StageStatus } from "../types";
import { useAssignmentWorkspace } from "../AssignmentContext";

export default function AssignmentStageNavigation({
  className = "",
  onSelectStage,
}: {
  className?: string;
  onSelectStage?: () => void;
}) {
  const { currentStage, stageStatuses, setStage } = useAssignmentWorkspace();

  return (
    <nav
      className={`flex flex-col h-full bg-[#F4F4F5] dark:bg-[#1C1C1E] border-r border-neutral-200/80 dark:border-white/10 text-neutral-800 dark:text-neutral-200 ${className}`}
      aria-label="Assignment Workflow Stages"
    >
      {/* Stepper Timeline Header */}
      <div className="px-4 py-3.5 border-b border-neutral-200/80 dark:border-white/10 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Workflow
        </span>
        <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
          {ASSIGNMENT_STAGES.length} Stages
        </span>
      </div>

      {/* Progressive Stepper Timeline */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {ASSIGNMENT_STAGES.map((stage) => {
          const isActive = currentStage === stage.id;
          const status = stageStatuses[stage.id];
          const isCompleted = status === "completed";
          const isLocked = status === "locked";

          return (
            <button
              key={stage.id}
              type="button"
              disabled={isLocked}
              onClick={() => {
                setStage(stage.id);
                onSelectStage?.();
              }}
              aria-label={`Phase ${stage.number}: ${stage.shortLabel}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer group ${
                isActive
                  ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold border border-neutral-200/80 dark:border-white/10"
                  : isLocked
                  ? "opacity-40 cursor-not-allowed text-neutral-400 dark:text-neutral-600 border border-transparent"
                  : "hover:bg-neutral-200/50 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 border border-transparent"
              }`}
            >
              {/* Stepper Node Indicator */}
              <div className="flex items-center justify-center shrink-0">
                {isActive ? (
                  <span className="w-5 h-5 rounded-full bg-neutral-900 dark:bg-white flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-neutral-900" />
                  </span>
                ) : isCompleted ? (
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                ) : (
                  <span className="w-5 h-5 rounded-full bg-neutral-200/70 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 flex items-center justify-center text-[10px] font-mono font-medium">
                    0{stage.number}
                  </span>
                )}
              </div>

              {/* Title & Step Number */}
              <div className="min-w-0 flex-1 flex items-center justify-between gap-1.5">
                <span className={`text-xs truncate ${isActive ? "font-semibold" : "font-medium"}`}>
                  {stage.shortLabel}
                </span>
                <span className="sr-only">Phase {stage.number}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 dark:bg-white shrink-0 animate-pulse" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
