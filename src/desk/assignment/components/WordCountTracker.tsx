import React from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";

export function WordCountBudgetSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-white/5 bg-neutral-900/60 text-xs animate-pulse">
        <div className="h-3 w-24 bg-neutral-800/60 rounded" />
        <div className="w-16 h-2 bg-neutral-800 rounded-full" />
        <div className="h-3 w-8 bg-neutral-800/60 rounded" />
      </div>
    );
  }
  return (
    <div className="p-4 rounded-xl border border-white/5 bg-neutral-900/80 flex flex-col gap-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3 w-40 bg-neutral-800/60 rounded" />
        <div className="h-4 w-20 bg-neutral-800/40 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="h-12 bg-neutral-800/40 rounded-lg" />
        <div className="h-12 bg-neutral-800/40 rounded-lg" />
        <div className="h-12 bg-neutral-800/40 rounded-lg" />
      </div>
      <div className="h-2 w-full bg-neutral-800/40 rounded-full" />
    </div>
  );
}

export default function WordCountTracker({ compact = false }: { compact?: boolean }) {
  const { targetWordCount, currentWordCount, remainingWordCount, wordCountPercentage, outline } =
    useAssignmentWorkspace();

  const isOverLimit = currentWordCount > targetWordCount * 1.1;
  const isOptimal = currentWordCount >= targetWordCount * 0.9 && currentWordCount <= targetWordCount * 1.1;

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-white/5 bg-neutral-900/80 text-xs text-neutral-200">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-neutral-100">{currentWordCount.toLocaleString()}</span>
          <span className="text-neutral-400">/ {targetWordCount.toLocaleString()} words</span>
        </div>
        <div className="w-16 h-2 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isOverLimit ? "bg-amber-500" : isOptimal ? "bg-emerald-500" : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(100, wordCountPercentage)}%` }}
          />
        </div>
        <span className="text-[11px] font-bold text-neutral-300">{wordCountPercentage}%</span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-white/5 bg-neutral-900/80 flex flex-col gap-3 text-neutral-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📏</span>
          <h4 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">
            Word Count Budget Planner
          </h4>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isOverLimit
              ? "bg-amber-500/15 text-amber-400"
              : isOptimal
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-blue-500/15 text-blue-400"
          }`}
        >
          {isOverLimit ? "⚠️ Exceeding Budget (+10%)" : isOptimal ? "✓ In Optimal Range" : "Writing in Progress"}
        </span>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2.5 rounded-lg bg-neutral-800/60 border border-white/5">
          <span className="text-[10px] uppercase font-bold text-neutral-400 block">Target</span>
          <span className="text-sm font-black text-neutral-100">
            {targetWordCount.toLocaleString()}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-neutral-800/60 border border-white/5">
          <span className="text-[10px] uppercase font-bold text-neutral-400 block">Current Draft</span>
          <span className={`text-sm font-black ${isOptimal ? "text-emerald-400" : isOverLimit ? "text-amber-400" : "text-blue-400"}`}>
            {currentWordCount.toLocaleString()}
          </span>
        </div>
        <div className="p-2.5 rounded-lg bg-neutral-800/60 border border-white/5">
          <span className="text-[10px] uppercase font-bold text-neutral-400 block">Remaining</span>
          <span className="text-sm font-black text-neutral-300">
            {remainingWordCount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] font-medium text-neutral-400">
          <span>Target Progress</span>
          <span>{wordCountPercentage}% completed</span>
        </div>
        <div className="w-full h-2.5 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isOverLimit ? "bg-amber-500" : isOptimal ? "bg-emerald-500" : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(100, wordCountPercentage)}%` }}
          />
        </div>
      </div>

      {/* Section Allocations Preview */}
      {outline.length > 0 && (
        <div className="pt-2 border-t border-white/5 space-y-1.5">
          <span className="text-[11px] font-semibold text-neutral-400 block">
            Section Allocations:
          </span>
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
            {outline.map((sec) => (
              <div key={sec.id} className="flex items-center justify-between text-xs py-0.5">
                <span className="text-neutral-300 truncate max-w-[160px]">{sec.title}</span>
                <span className="text-[11px] font-medium text-neutral-400">
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

export { WordCountTracker as WordCountBudgetPlanner };
