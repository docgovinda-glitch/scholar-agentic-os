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
      <div className="rounded-2xl p-6 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs space-y-4 animate-pulse">
        <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-4">
          <div className="h-5 w-44 bg-[color:var(--surface-sunken)] rounded" />
          <div className="h-6 w-24 bg-[color:var(--surface-sunken)] rounded-full" />
        </div>
        <div className="h-3 w-full bg-[color:var(--surface-inset)] rounded-full" />
        <div className="space-y-3 pt-2">
          <div className="h-16 bg-[color:var(--surface-inset)] rounded-xl" />
          <div className="h-16 bg-[color:var(--surface-inset)] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-2xl p-6 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[color:var(--surface-inset)] text-[color:var(--text-muted)] mx-auto flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
            Not checked yet
          </h3>
          <p className="text-xs text-[color:var(--text-muted)] max-w-sm mx-auto">
            Check your draft against your brief: length, introduction, conclusion and what the question asks for.
          </p>
        </div>
        {onReRunAudit && (
          <button
            type="button"
            onClick={onReRunAudit}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>Check my draft</span>
          </button>
        )}
      </div>
    );
  }

  // Scholar does not predict marks: only checks that can be shown to be
  // true are listed (what is missing against the brief, and the brief's own
  // criteria). A grade band and readiness score used to be computed from
  // fixed numbers and shown as if they were an assessment.
  const criteria = (report.criteria ?? []).filter((c) => c.criterion);
  const missing = report.missingRequirements ?? [];

  return (
    <div className="rounded-2xl p-6 sm:p-7 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs space-y-5">
      <div className="space-y-1 border-b border-[color:var(--border-subtle)] pb-4">
        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">Checks against your brief</h2>
        <p className="text-xs text-[color:var(--text-muted)]">
          Scholar doesn&apos;t predict marks. These are things it can check; your marker decides the grade.
        </p>
      </div>

      {missing.length > 0 ? (
        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 space-y-2" data-testid="missing-requirements-box">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">To do before you submit ({missing.length})</div>
          <ul className="text-xs text-amber-800/90 dark:text-amber-200/90 space-y-1.5 pl-5 list-disc">
            {missing.map((req, idx) => (
              <li key={idx} className="leading-snug">{req}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-emerald-700 dark:text-emerald-400" data-testid="no-missing-requirements">
          Nothing missing that Scholar can check: length, introduction, conclusion and what the question asks for are covered.
        </p>
      )}

      {criteria.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">Marking criteria</h3>
          <ul className="space-y-1.5">
            {criteria.map((crit, idx) => (
              <li key={crit.criterion || idx} className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg bg-[color:var(--surface-inset)]/70 border border-[color:var(--border-subtle)]">
                <span className="text-[color:var(--text-primary)]">{crit.criterion}</span>
                {crit.weightPercentage ? <span className="text-xs text-[color:var(--text-muted)] shrink-0">{crit.weightPercentage}%</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onReRunAudit && (
        <button type="button" onClick={onReRunAudit} className="text-xs font-semibold underline text-[color:var(--text-secondary)] cursor-pointer">
          Check again
        </button>
      )}
    </div>
  );
}
