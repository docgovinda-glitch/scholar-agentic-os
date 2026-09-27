import React from "react";
import type { RubricScoreReport } from "../types";

export interface RubricComplianceCardProps {
  report: RubricScoreReport | null;
  isLoading?: boolean;
  onReRunAudit?: () => void;
}

export function RubricComplianceCard({
  report,
  isLoading = false,
  onReRunAudit,
}: RubricComplianceCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4 animate-pulse">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-4">
          <div className="h-5 w-44 bg-neutral-200 dark:bg-white/10 rounded" />
          <div className="h-6 w-24 bg-neutral-200 dark:bg-white/10 rounded-full" />
        </div>
        <div className="h-3 w-full bg-neutral-100 dark:bg-white/5 rounded-full" />
        <div className="space-y-3 pt-2">
          <div className="h-16 bg-neutral-100 dark:bg-white/5 rounded-xl" />
          <div className="h-16 bg-neutral-100 dark:bg-white/5 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-2xl p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-white/5 text-neutral-400 dark:text-neutral-500 mx-auto flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Rubric Evaluation Pending
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
            Evaluate your completed draft against the Phase 1 rubric criteria and university grade benchmarks.
          </p>
        </div>
        {onReRunAudit && (
          <button
            type="button"
            onClick={onReRunAudit}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>Run Rubric Audit</span>
          </button>
        )}
      </div>
    );
  }

  // Determine Grade Badge Color
  const grade = report.predictedGrade || "Upper Second (2:1)";
  const isFirstClass = grade.toLowerCase().includes("first");
  const isUpperSecond = grade.toLowerCase().includes("upper");
  const isLowerSecond = grade.toLowerCase().includes("lower");
  const isFail = grade.toLowerCase().includes("fail");

  const badgeColorClass = isFirstClass
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
    : isUpperSecond
    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
    : isLowerSecond
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
    : isFail
    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
    : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";

  return (
    <div className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-6">
      {/* Header with Predicted Grade & Readiness */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-neutral-400 dark:text-neutral-500">
              Assessment Report
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
            <span>Rubric Compliance Evaluator</span>
          </h2>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${badgeColorClass} flex items-center gap-1.5`}
            data-testid="predicted-grade-badge"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span>{grade}</span>
          </span>
        </div>
      </div>

      {/* Submission Readiness Gauge */}
      <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-neutral-600 dark:text-neutral-300">Submission Readiness Index</span>
          <span className="text-neutral-900 dark:text-white font-semibold tabular-nums">
            {report.readinessPercentage}% Ready
          </span>
        </div>
        <div className="w-full h-2.5 bg-neutral-200 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              report.readinessPercentage >= 80
                ? "bg-emerald-500"
                : report.readinessPercentage >= 60
                ? "bg-blue-500"
                : "bg-amber-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(5, report.readinessPercentage))}%` }}
          />
        </div>
        {report.summary && (
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-0.5 leading-relaxed">
            {report.summary}
          </p>
        )}
      </div>

      {/* Missing Requirements Alert Box */}
      {report.missingRequirements && report.missingRequirements.length > 0 && (
        <div
          className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 space-y-2"
          data-testid="missing-requirements-box"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span>Unaddressed Instructions / Action Items ({report.missingRequirements.length})</span>
          </div>
          <ul className="text-xs text-amber-800/90 dark:text-amber-200/90 space-y-1.5 pl-5 list-disc">
            {report.missingRequirements.map((req, idx) => (
              <li key={idx} className="leading-snug">{req}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Criteria Breakdown List */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Marking Rubric Criteria Breakdown
        </h3>
        <div className="space-y-3">
          {(report.criteria && report.criteria.length > 0
            ? report.criteria
            : Object.entries(report.criteriaFeedback || {}).map(([name, feedback], i) => ({
                criterion: name,
                score: 75,
                maxScore: 100,
                feedback,
                weightPercentage: Math.round(100 / Math.max(1, Object.keys(report.criteriaFeedback || {}).length)),
              }))
          ).map((crit, idx) => (
            <div
              key={crit.criterion || idx}
              className="p-4 rounded-xl border border-neutral-200/70 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.02] space-y-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {crit.criterion}
                  </span>
                  {crit.weightPercentage && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-neutral-200/60 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                      {crit.weightPercentage}% Weight
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900 dark:text-white font-mono tabular-nums">
                    {crit.score} / {crit.maxScore || 100}
                  </span>
                </div>
              </div>
              <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-[11.5px]">
                {crit.feedback}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Priority Fixes / Strengths */}
      {report.strengths && report.strengths.length > 0 && (
        <div className="pt-2 border-t border-neutral-100 dark:border-white/5 space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
            Observed Strengths
          </span>
          <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1 pl-4 list-disc">
            {report.strengths.map((str, idx) => (
              <li key={idx}>{str}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
