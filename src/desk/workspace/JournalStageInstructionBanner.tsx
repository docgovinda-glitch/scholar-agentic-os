import React, { useState } from "react";
import { Info, ChevronDown, ChevronUp, CheckCircle2, BookOpen, Sparkles } from "lucide-react";

export interface JournalStageInstructionBannerProps {
  milestoneTitle: string;
  stageLabel: string;
  description: string;
  instructions: string[];
  targetJournal?: string;
  citationStyle?: string;
  wordCountBudget?: string | number;
  rightAction?: React.ReactNode;
  tips?: string[];
}

export function JournalStageInstructionBanner({
  milestoneTitle,
  stageLabel,
  description,
  instructions,
  targetJournal,
  citationStyle,
  wordCountBudget,
  rightAction,
  tips,
}: JournalStageInstructionBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-2xl p-5 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              {milestoneTitle}
            </span>
            {targetJournal && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 border border-neutral-200/60 dark:border-white/10"
                title={`Target Venue: ${targetJournal}`}
              >
                <BookOpen className="w-3 h-3 text-neutral-400" />
                <span>Target Venue</span>
              </span>
            )}
            {citationStyle && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400">
                {citationStyle}
              </span>
            )}
            {wordCountBudget && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                Quota: {typeof wordCountBudget === "number" ? `${wordCountBudget.toLocaleString()}w` : wordCountBudget}
              </span>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            {stageLabel}
          </h2>

          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
            {description}
          </p>
        </div>

        {rightAction && (
          <div className="shrink-0 flex items-center gap-2">
            {rightAction}
          </div>
        )}
      </div>

      {/* Expandable Step-by-Step Instructions & Guidelines */}
      <div className="pt-2 border-t border-neutral-100 dark:border-white/5">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
        >
          <Info className="w-3.5 h-3.5 text-indigo-500" />
          <span>{isExpanded ? "Hide instructions & publication standards" : "View instructions & journal standards"}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {isExpanded && (
          <div className="mt-3 p-4 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5 space-y-3 animate-fade-in text-xs">
            <div>
              <div className="font-semibold text-neutral-800 dark:text-neutral-200 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Action Checklist:</span>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-neutral-600 dark:text-neutral-300">
                {instructions.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="font-mono text-[10px] w-4 h-4 rounded-full bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                      {idx + 1}
                    </span>
                    <span className="leading-tight">{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            {tips && tips.length > 0 && (
              <div className="pt-2 border-t border-neutral-200/50 dark:border-white/5">
                <div className="font-semibold text-indigo-600 dark:text-indigo-400 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Journal Reviewer Advice:</span>
                </div>
                <div className="space-y-1 text-neutral-500 dark:text-neutral-400 leading-relaxed text-[11px]">
                  {tips.map((tip, idx) => (
                    <p key={idx}>• {tip}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
