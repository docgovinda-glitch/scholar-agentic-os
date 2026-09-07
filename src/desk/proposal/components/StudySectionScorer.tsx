import React, { useState, useMemo } from "react";

export interface CriterionScore {
  criterion: "Significance" | "Investigator(s)" | "Innovation" | "Approach" | "Environment";
  r1: number; // 1-9
  r2: number;
  r3: number;
  weight: number;
  strengths: string[];
  weaknesses: string[];
  remedy: string;
}

export interface StudySectionScorerProps {
  proposalTitle: string;
  fundingAgency: string;
  mechanism: string;
  initialScores?: CriterionScore[];
  onExportSummary?: (summary: string) => void;
  className?: string;
}

const DEFAULT_CRITERIA: CriterionScore[] = [
  {
    criterion: "Significance",
    r1: 2,
    r2: 2,
    r3: 3,
    weight: 0.25,
    strengths: [
      "Addresses critical reproducibility crisis in automated biomedical synthesis.",
      "High clinical and computational impact across federated health archives.",
    ],
    weaknesses: ["Long-term institutional adoption roadmap could be more specific."],
    remedy: "Quantify annual dollar loss due to literature retraction in Aim 1 introduction.",
  },
  {
    criterion: "Investigator(s)",
    r1: 1,
    r2: 2,
    r3: 1,
    weight: 0.15,
    strengths: [
      "Principal Investigator has top-tier publication record in agentic knowledge architectures.",
      "Interdisciplinary co-investigators span Bayesian statistics and clinical informatics.",
    ],
    weaknesses: ["Postdoctoral training plan lacks explicit industry mentorship track."],
    remedy: "Add formal letters of collaboration with institutional computing clusters.",
  },
  {
    criterion: "Innovation",
    r1: 2,
    r2: 1,
    r3: 2,
    weight: 0.2,
    strengths: [
      "Novel integration of deterministic claim-evidence ledgers with multi-agent peer review.",
      "Sub-second verification latency breaks previous computational benchmarks.",
    ],
    weaknesses: ["Comparisons with closed commercial models need clear boundary definitions."],
    remedy: "Include benchmark matrix contrasting open Bayesian graphs with black-box models.",
  },
  {
    criterion: "Approach",
    r1: 3,
    r2: 4,
    r3: 3,
    weight: 0.3,
    strengths: [
      "Rigorous 3-phase randomized evaluation plan across 1,000 multi-domain manuscripts.",
      "Clear quantitative success metrics (p < 0.001 citation precision).",
    ],
    weaknesses: [
      "Contingency plan for handling paywalled literature parsing errors is underdeveloped.",
    ],
    remedy: "Expand Section 4.3 with explicit fallback heuristics for OCR artifact ingestion.",
  },
  {
    criterion: "Environment",
    r1: 1,
    r2: 1,
    r3: 2,
    weight: 0.1,
    strengths: [
      "World-class GPU cluster infrastructure and institutional library database access.",
    ],
    weaknesses: [],
    remedy: "Institutional environment is exceptional.",
  },
];

export default function StudySectionScorer({
  proposalTitle,
  fundingAgency,
  mechanism,
  initialScores = DEFAULT_CRITERIA,
  className = "",
}: StudySectionScorerProps) {
  const [criteria, setCriteria] = useState<CriterionScore[]>(initialScores);
  const [selectedCriterionIdx, setSelectedCriterionIdx] = useState(0);

  const updateScore = (idx: number, reviewer: "r1" | "r2" | "r3", value: number) => {
    const val = Math.max(1, Math.min(9, value));
    setCriteria((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [reviewer]: val };
      return copy;
    });
  };

  // Composite Calculations (NIH 10 - 90 Overall Impact Score)
  const scoreSummary = useMemo(() => {
    let totalWeightedScore = 0;
    criteria.forEach((c) => {
      const avg = (c.r1 + c.r2 + c.r3) / 3;
      totalWeightedScore += avg * c.weight;
    });

    const overallImpactScore = Math.round(totalWeightedScore * 10);
    const estimatedPercentile = Math.max(1, Math.min(99, Math.round((overallImpactScore - 10) * 1.15)));

    let paylineVerdict = "Likely Funded (Top 10%)";
    let verdictColor = "text-emerald-500 bg-emerald-500/15 border-emerald-500/30";

    if (overallImpactScore > 35) {
      paylineVerdict = "Revision Required (Outside Payline)";
      verdictColor = "text-rose-500 bg-rose-500/15 border-rose-500/30";
    } else if (overallImpactScore > 25) {
      paylineVerdict = "Competitive (Near Payline Cutoff)";
      verdictColor = "text-amber-500 bg-amber-500/15 border-amber-500/30";
    }

    return {
      overallImpactScore,
      estimatedPercentile,
      paylineVerdict,
      verdictColor,
    };
  }, [criteria]);

  const activeCriterion = criteria[selectedCriterionIdx] || criteria[0];

  return (
    <div
      className={`p-6 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-6 shadow-xs ${className}`}
      data-testid="study-section-scorer"
    >
      {/* Panel Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[color:var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">⚖️</span>
            <h3 className="text-sm font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
              Federal Grant Study Section Review Panel (NIH / NSF)
            </h3>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Mechanism: <strong className="text-[color:var(--text-primary)]">{mechanism}</strong> · Agency: {fundingAgency}
          </p>
        </div>

        {/* Composite Score Card */}
        <div className="flex items-center gap-3 bg-[color:var(--surface-sunken)] p-3 rounded-xl border border-[color:var(--border-subtle)]">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] block">
              Overall Impact Score
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-[color:var(--accent)]">
                {scoreSummary.overallImpactScore}
              </span>
              <span className="text-[11px] text-[color:var(--text-muted)]">/ 90 (~{scoreSummary.estimatedPercentile}th %)</span>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${scoreSummary.verdictColor}`}
          >
            {scoreSummary.paylineVerdict}
          </span>
        </div>
      </div>

      {/* Criteria Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Criteria List & Scoring Sliders */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <span className="text-xs font-bold text-[color:var(--text-primary)]">
            Core Federal Evaluation Criteria (1 = Exceptional, 9 = Poor)
          </span>

          <div className="space-y-2">
            {criteria.map((c, idx) => {
              const avg = ((c.r1 + c.r2 + c.r3) / 3).toFixed(1);
              const isSelected = idx === selectedCriterionIdx;
              return (
                <div
                  key={c.criterion}
                  onClick={() => setSelectedCriterionIdx(idx)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? "border-[color:var(--accent)] bg-[color:var(--surface-canvas)] shadow-xs"
                      : "border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/50 hover:bg-[color:var(--surface-canvas)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[color:var(--text-primary)]">{c.criterion}</span>
                      <span className="text-[10px] text-[color:var(--text-muted)] font-medium">({Math.round(c.weight * 100)}% wt)</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[color:var(--accent)]">
                      Avg: {avg}
                    </span>
                  </div>

                  {/* Reviewer Score Chips */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {(["r1", "r2", "r3"] as const).map((rKey, rIdx) => (
                      <div key={rKey} className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-[color:var(--text-muted)] font-semibold">R{rIdx + 1}:</span>
                        <input
                          type="number"
                          min={1}
                          max={9}
                          value={c[rKey]}
                          onChange={(e) => updateScore(idx, rKey, parseInt(e.target.value, 10) || 1)}
                          className="w-10 px-1.5 py-0.5 rounded border border-[color:var(--border-default)] bg-[color:var(--surface-input)] text-center font-mono font-bold text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Detailed Critique & Weakness Remediation */}
        <div className="lg:col-span-6 flex flex-col justify-between p-5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[color:var(--border-subtle)]">
              <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                Reviewer Critique: {activeCriterion.criterion}
              </span>
              <span className="text-[11px] text-[color:var(--text-muted)]">
                Composite Score: {((activeCriterion.r1 + activeCriterion.r2 + activeCriterion.r3) / 3).toFixed(1)} / 9
              </span>
            </div>

            {/* Strengths */}
            <div className="mb-4">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1.5">
                ✓ Noted Strengths:
              </span>
              <ul className="list-disc list-inside text-xs text-[color:var(--text-secondary)] space-y-1">
                {activeCriterion.strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>

            {/* Weaknesses */}
            {activeCriterion.weaknesses.length > 0 && (
              <div className="mb-4">
                <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 block mb-1.5">
                  ⚠️ Primary Concerns / Deficits:
                </span>
                <ul className="list-disc list-inside text-xs text-[color:var(--text-secondary)] space-y-1">
                  {activeCriterion.weaknesses.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Actionable Revision Strategy */}
          <div className="p-3.5 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] mt-4">
            <span className="text-[11px] font-bold text-[color:var(--text-primary)] block mb-1">
              💡 Actionable Revision Roadmap:
            </span>
            <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
              {activeCriterion.remedy}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
