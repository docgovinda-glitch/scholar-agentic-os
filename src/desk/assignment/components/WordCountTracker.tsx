import React from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";

export default function WordCountTracker({ compact = false }: { compact?: boolean }) {
  const { targetWordCount, currentWordCount, remainingWordCount, wordCountPercentage, outline } =
    useAssignmentWorkspace();

  const isOverLimit = currentWordCount > targetWordCount * 1.1;
  const isOptimal = currentWordCount >= targetWordCount * 0.9 && currentWordCount <= targetWordCount * 1.1;

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[color:var(--text-primary)]">{currentWordCount.toLocaleString()}</span>
          <span className="text-[color:var(--text-muted)]">/ {targetWordCount.toLocaleString()} words</span>
        </div>
        <div className="w-16 h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isOverLimit ? "bg-amber-500" : isOptimal ? "bg-emerald-500" : "bg-[color:var(--accent)]"
            }`}
            style={{ width: `${Math.min(100, wordCountPercentage)}%` }}
          />
        </div>
        <span className="text-[11px] font-bold text-[color:var(--text-secondary)]">{wordCountPercentage}%</span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📏</span>
          <h4 className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
            Word Count Budget Planner
          </h4>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isOverLimit
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : isOptimal
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
          }`}
        >
          {isOverLimit ? "⚠️ Exceeding Budget (+10%)" : isOptimal ? "✓ In Optimal Range" : "Writing in Progress"}
        </span>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
          <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Target</span>
          <span className="text-sm font-black text-[color:var(--text-primary)]">
            {targetWordCount.toLocaleString()}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
          <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Current Draft</span>
          <span className={`text-sm font-black ${isOptimal ? "text-emerald-500" : isOverLimit ? "text-amber-500" : "text-[color:var(--accent)]"}`}>
            {currentWordCount.toLocaleString()}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
          <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Remaining</span>
          <span className="text-sm font-black text-[color:var(--text-secondary)]">
            {remainingWordCount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] font-medium text-[color:var(--text-secondary)]">
          <span>Target Progress</span>
          <span>{wordCountPercentage}% completed</span>
        </div>
        <div className="w-full h-2.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isOverLimit ? "bg-amber-500" : isOptimal ? "bg-emerald-500" : "bg-[color:var(--accent)]"
            }`}
            style={{ width: `${Math.min(100, wordCountPercentage)}%` }}
          />
        </div>
      </div>

      {/* Section Allocations Preview */}
      {outline.length > 0 && (
        <div className="pt-2 border-t border-[color:var(--border-subtle)] space-y-1.5">
          <span className="text-[11px] font-semibold text-[color:var(--text-muted)] block">
            Section Allocations:
          </span>
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
            {outline.map((sec) => (
              <div key={sec.id} className="flex items-center justify-between text-xs py-0.5">
                <span className="text-[color:var(--text-secondary)] truncate max-w-[160px]">{sec.title}</span>
                <span className="text-[11px] font-medium text-[color:var(--text-muted)]">
                  {sec.currentWordCount || 0} / {sec.targetWordCount || 0} w
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
