import React from "react";

export type HumanizerProgressStage =
  | "parsing"
  | "protecting"
  | "claims"
  | "rewriting"
  | "auditing"
  | "retrying"
  | "finalizing";

interface PipelineProgressBarProps {
  stage: HumanizerProgressStage;
}

const STAGES: { id: HumanizerProgressStage; label: string }[] = [
  { id: "parsing", label: "Analyzing Document" },
  { id: "protecting", label: "Protecting Citations & Data" },
  { id: "claims", label: "Extracting Propositional Claims" },
  { id: "rewriting", label: "Humanizing Prose & Cadence" },
  { id: "auditing", label: "Multi-Auditor Verification" },
  { id: "finalizing", label: "Restoring & Finalizing" },
];

export default function PipelineProgressBar({ stage }: PipelineProgressBarProps) {
  const currentIndex = STAGES.findIndex((s) => s.id === stage);
  const isRetrying = stage === "retrying";

  return (
    <div
      data-testid="pipeline-progress-bar"
      className="p-4 mb-6 rounded-xl border border-indigo-200/60 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/50 via-slate-50/50 to-indigo-50/50 dark:from-indigo-950/20 dark:via-slate-900/30 dark:to-indigo-950/20 shadow-sm"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-ping" />
          <h4 className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">
            {isRetrying
              ? "Improving Draft After Quality Checks..."
              : STAGES[currentIndex]?.label || "Processing Pipeline..."}
          </h4>
        </div>
        <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
          {currentIndex >= 0 ? `${Math.min(100, Math.round(((currentIndex + 1) / STAGES.length) * 100))}%` : "In Progress"}
        </span>
      </div>

      {/* Progress Track */}
      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${Math.max(10, Math.min(100, ((currentIndex + 1) / STAGES.length) * 100))}%`,
          }}
        />
      </div>

      {/* Stage Labels */}
      <div className="grid grid-cols-6 gap-1 text-[10px] text-center text-slate-500 dark:text-slate-400">
        {STAGES.map((s, idx) => {
          const isDone = idx < currentIndex;
          const isActive = idx === currentIndex;
          return (
            <div
              key={s.id}
              className={`truncate font-medium transition-colors ${
                isActive
                  ? "text-indigo-600 dark:text-indigo-400 font-bold"
                  : isDone
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "opacity-40"
              }`}
            >
              {isDone ? "✓ " : ""}
              {s.label.split(" ")[0]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
