import React, { useMemo, useState } from "react";

export type StudySectionCriterion = "Significance" | "Investigator(s)" | "Innovation" | "Approach" | "Environment";

export const STUDY_SECTION_CRITERIA: readonly StudySectionCriterion[] = [
  "Significance",
  "Investigator(s)",
  "Innovation",
  "Approach",
  "Environment",
];

export interface CriterionSelfScore {
  criterion: StudySectionCriterion;
  /** 1 = exceptional … 9 = poor (NIH scale); null until the user scores it. */
  score: number | null;
  notes: string;
}

export interface StudySectionScorerProps {
  proposalTitle: string;
  fundingAgency: string;
  mechanism: string;
  className?: string;
}

/** Mean of the scored criteria, or null when none is scored. Pure, for tests. */
export function meanCriterionScore(rows: CriterionSelfScore[]): number | null {
  const scored = rows.map((r) => r.score).filter((s): s is number => typeof s === "number");
  if (scored.length === 0) return null;
  return scored.reduce((a, b) => a + b, 0) / scored.length;
}

/**
 * Self-review worksheet: the user scores their own proposal against the five
 * review criteria and notes why. It starts blank and computes only the mean of
 * what the user entered. It shows no Overall Impact score, percentile or payline
 * verdict: those come from a real panel and cannot be derived from these numbers.
 */
export default function StudySectionScorer({
  proposalTitle,
  fundingAgency,
  mechanism,
  className = "",
}: StudySectionScorerProps) {
  const [rows, setRows] = useState<CriterionSelfScore[]>(() =>
    STUDY_SECTION_CRITERIA.map((criterion) => ({ criterion, score: null, notes: "" }))
  );

  const mean = useMemo(() => meanCriterionScore(rows), [rows]);
  const scoredCount = rows.filter((r) => r.score !== null).length;

  const update = (idx: number, patch: Partial<CriterionSelfScore>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  return (
    <div
      className={`p-6 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-6 shadow-xs ${className}`}
      data-testid="study-section-scorer"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[color:var(--border-subtle)]">
        <div>
          <h3 className="text-sm font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
            Self-review worksheet
          </h3>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            {proposalTitle || "Untitled proposal"}
            {fundingAgency ? ` · ${fundingAgency}` : ""}
            {mechanism ? ` · ${mechanism}` : ""}
          </p>
        </div>

        <div className="bg-[color:var(--surface-sunken)] p-3 rounded-xl border border-[color:var(--border-subtle)]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] block">
            Mean of your criterion scores
          </span>
          <span className="text-2xl font-black font-mono text-[color:var(--accent)]" data-testid="self-score-mean">
            {mean === null ? "—" : mean.toFixed(1)}
          </span>
          <span className="text-[11px] text-[color:var(--text-muted)] block">
            {scoredCount} of {rows.length} scored · not an official impact score
          </span>
        </div>
      </div>

      <p className="text-xs text-[color:var(--text-secondary)]">
        Score each criterion 1 (exceptional) to 9 (poor), the way reviewers will, and note the strengths and
        weaknesses you see.
      </p>

      <div className="flex flex-col gap-3">
        {rows.map((row, idx) => (
          <div
            key={row.criterion}
            className="p-4 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] grid grid-cols-1 md:grid-cols-12 gap-3"
          >
            <label className="md:col-span-3 flex flex-col gap-1.5 text-xs font-bold text-[color:var(--text-primary)]">
              {row.criterion}
              <input
                type="number"
                min={1}
                max={9}
                value={row.score ?? ""}
                aria-label={`${row.criterion} score`}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  update(idx, { score: Number.isFinite(n) ? Math.max(1, Math.min(9, n)) : null });
                }}
                className="w-16 px-2 py-1 rounded border border-[color:var(--border-default)] bg-[color:var(--surface-input)] text-center font-mono text-xs"
              />
            </label>
            <label className="md:col-span-9 flex flex-col gap-1.5 text-xs text-[color:var(--text-secondary)]">
              Strengths and weaknesses
              <textarea
                rows={2}
                value={row.notes}
                aria-label={`${row.criterion} notes`}
                onChange={(e) => update(idx, { notes: e.target.value })}
                className="w-full p-2 text-xs border border-[color:var(--border-control)] rounded-lg bg-[color:var(--surface-input)] text-[color:var(--text-primary)] resize-none"
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
