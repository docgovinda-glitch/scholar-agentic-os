import React from "react";
import { ReviewUnit, ReviewUnitDecision } from "../../../domain/humanizer/types";

interface SentenceReviewListProps {
  reviewUnits: ReviewUnit[];
  onDecisionChange: (unitId: string, decision: ReviewUnitDecision) => void;
}

export default function SentenceReviewList({
  reviewUnits,
  onDecisionChange,
}: SentenceReviewListProps) {
  if (!reviewUnits || reviewUnits.length === 0) return null;

  const modifiedUnits = reviewUnits.filter((u) => u.status !== "UNCHANGED");

  return (
    <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200">
            Granular Sentence & Clause Review ({modifiedUnits.length} changes)
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Review individual sentence revisions or structural restructurings and accept/revert changes selectively.
          </p>
        </div>
      </div>

      <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
        {modifiedUnits.map((unit) => {
          const isAccepted = unit.decision === "ACCEPTED";
          const isRejected = unit.decision === "REJECTED";

          return (
            <div
              key={unit.unitId}
              data-testid={`review-unit-${unit.unitId}`}
              className={`p-3.5 rounded-xl border transition-all text-xs ${
                isRejected
                  ? "bg-slate-100/70 dark:bg-slate-900/70 border-slate-300 dark:border-slate-700 opacity-75"
                  : isAccepted
                  ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-500/30"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm"
              }`}
            >
              {/* Header Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                    {unit.mappingType === "ONE_TO_ONE"
                      ? "1:1 Sentence"
                      : unit.mappingType === "ONE_TO_MANY"
                      ? "1:N Split"
                      : unit.mappingType === "MANY_TO_ONE"
                      ? "N:1 Merge"
                      : "Restructured"}
                  </span>

                  {unit.hasProtectedTokens && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                      🔒 Protected Content
                    </span>
                  )}
                </div>

                {/* Accept / Revert Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onDecisionChange(unit.unitId, "ACCEPTED")}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                      isAccepted
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/20 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    Keep Humanized
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecisionChange(unit.unitId, "REJECTED")}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                      isRejected
                        ? "bg-rose-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/20 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    Keep Original
                  </button>
                </div>
              </div>

              {/* Source vs Candidate Text */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200/50 dark:border-slate-800/50">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Original Source:
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 font-serif leading-relaxed line-through opacity-70">
                    {unit.sourceText}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider block mb-1">
                    Humanized Revision:
                  </span>
                  <p className="text-slate-900 dark:text-slate-100 font-serif leading-relaxed font-medium">
                    {unit.candidateText}
                  </p>
                </div>
              </div>

              {/* Explanation Note */}
              {unit.explanation && (
                <p className="text-[10px] text-slate-400 mt-2 italic">{unit.explanation}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
