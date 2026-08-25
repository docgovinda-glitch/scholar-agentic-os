import React, { useState } from "react";
import type { ProposalStage, ProposalProjectData } from "./types";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";

const PROPOSAL_STAGES: Array<{ id: ProposalStage; label: string; icon: string; desc: string }> = [
  { id: "agency_rubric", label: "1. Agency & Rubric", icon: "🏛️", desc: "Funding mechanism, budget ceiling & guidelines" },
  { id: "specific_aims", label: "2. Specific Aims", icon: "🎯", desc: "1-Page high-stakes hypothesis & Aim 1-3 deliverables" },
  { id: "significance_innovation", label: "3. Significance & Innovation", icon: "💡", desc: "Critical deficit, 'Why Now?' & paradigm shift" },
  { id: "research_strategy", label: "4. Research Strategy", icon: "🔬", desc: "Preliminary data, methodology & pitfall mitigation" },
  { id: "timeline_workpackages", label: "5. Timeline & Work Packages", icon: "📅", desc: "Gantt milestones, deliverables & feasibility" },
  { id: "budget_justification", label: "6. Budget & Broader Impacts", icon: "💰", desc: "Line-item direct costs, personnel & data plan" },
  { id: "study_section_review", label: "7. Study Section Review", icon: "⚖️", desc: "Multi-reviewer scoring panel (NIH/NSF criteria)" },
];

export default function ProposalWorkspace({
  projectId,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  projectId: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  const [currentStage, setCurrentStage] = useState<ProposalStage>("specific_aims");
  const [proposalData, setProposalData] = useState<ProposalProjectData>({
    projectId,
    title: "Next-Generation Autonomous Verification of Empirical Scientific Literature",
    fundingAgency: "NSF / NIH Joint Informatics Program",
    mechanism: "R01 / CAREER Grant Track",
    targetBudgetUSD: 1250000,
    durationMonths: 36,
    overarchingHypothesis: "Bayesian multi-agent consensus protocols eliminate fabricated bibliographic references in automated synthesis pipelines.",
    specificAims: [
      "Aim 1: Construct a deterministic zero-hallucination citation verification engine with sub-second latency.",
      "Aim 2: Develop multi-agent peer review simulation pipelines modeling 5 distinct epistemic reviewer lenses.",
      "Aim 3: Conduct double-blind empirical trials across 1,000 biomedical review manuscripts.",
    ],
    significanceStatement: "Over $2.4B is lost annually to non-reproducible academic synthesis; our platform creates verifiable provenance trails.",
    innovationStatement: "First architecture to integrate real-time cryptographic vault indexing with non-Markovian agentic debate.",
  });

  // Study section simulation state
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResults, setReviewResults] = useState<any>(null);

  async function handleSimulateStudySection() {
    setReviewLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/proposal/study-section-simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: proposalData.title,
          specificAims: proposalData.specificAims,
          significance: proposalData.significanceStatement,
          agency: proposalData.fundingAgency,
        }),
      });
      const data = await res.json();
      setReviewResults(data);
    } catch (e) {
      console.error(e);
    } finally {
      setReviewLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-sans flex flex-col selection:bg-[color:var(--accent-subtle)]">
      {/* Top Bar */}
      <header className="h-14 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
              title="Back to Scholar Workspace"
            >
              ←
            </button>
          )}
          <div className="w-8 h-8 rounded-lg bg-[color:var(--accent)] text-white flex items-center justify-center">
            <ScholarCoreLogo size="sm" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[color:var(--text-primary)] truncate max-w-xs md:max-w-md">
                {proposalData.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-bold shrink-0">
                {proposalData.mechanism}
              </span>
            </div>
            <p className="text-[10px] text-[color:var(--text-muted)]">
              {proposalData.fundingAgency} · ${proposalData.targetBudgetUSD.toLocaleString()} Ceiling ({proposalData.durationMonths} Mo)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onOpenVault && (
            <button
              onClick={onOpenVault}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] transition-all cursor-pointer"
            >
              Vault
            </button>
          )}
          {onOpenAiAccess && (
            <button
              onClick={onOpenAiAccess}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] transition-all cursor-pointer"
            >
              AI Access
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Stage Rail */}
        <aside className="w-full md:w-72 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/50 p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto shrink-0">
          <div className="hidden md:block px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
            Grant Pipeline
          </div>
          {PROPOSAL_STAGES.map((s) => {
            const isActive = currentStage === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStage(s.id)}
                className={`w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2.5 cursor-pointer ${
                  isActive
                    ? "bg-[color:var(--accent-solid)] text-white shadow-xs"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-raised)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <span className="text-base shrink-0">{s.icon}</span>
                <div className="overflow-hidden">
                  <div className="font-bold truncate">{s.label}</div>
                  <div className={`text-[10px] truncate ${isActive ? "text-white/80" : "text-[color:var(--text-muted)]"}`}>
                    {s.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Center Stage Content */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl">
          {currentStage === "specific_aims" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                  Specific Aims Executive Page
                </h2>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                  The most critical page of your grant application. Sets the central hypothesis and concrete milestone deliverables.
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                <label className="text-xs font-bold text-[color:var(--text-primary)] block mb-1">
                  Central / Overarching Hypothesis
                </label>
                <textarea
                  rows={2}
                  value={proposalData.overarchingHypothesis}
                  onChange={(e) => setProposalData({ ...proposalData, overarchingHypothesis: e.target.value })}
                  className="w-full p-3 text-xs border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
                />
              </div>

              <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    Specific Aims (Milestone Deliverables)
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                    3 Aims Formulated
                  </span>
                </div>

                {proposalData.specificAims.map((aim, idx) => (
                  <div key={idx} className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-[color:var(--accent)] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-1">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={aim}
                      onChange={(e) => {
                        const next = [...proposalData.specificAims];
                        next[idx] = e.target.value;
                        setProposalData({ ...proposalData, specificAims: next });
                      }}
                      className="flex-1 px-3 py-2 text-xs border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStage === "study_section_review" && (
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                    Study Section Review Simulator (NIH / NSF Standard)
                  </h2>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                    Simulate a 3-member grant evaluation panel scoring against standard federal research criteria.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSimulateStudySection}
                  disabled={reviewLoading}
                  className="px-4 py-2 bg-[color:var(--accent-solid)] text-white rounded-xl text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {reviewLoading ? "Convening Review Panel…" : "Run Study Section Simulation →"}
                </button>
              </div>

              {reviewResults ? (
                <div className="flex flex-col gap-4">
                  <div className="p-4 rounded-2xl border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)]/40 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                        Overall Impact Verdict
                      </span>
                      <h4 className="text-base font-bold text-[color:var(--text-primary)] mt-0.5">
                        {reviewResults.overallImpactScore}
                      </h4>
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {reviewResults.recommendationForFunding}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reviewResults.criteria.map((c: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-[color:var(--text-primary)]">{c.criterion}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[color:var(--surface-sunken)] text-[color:var(--accent)]">
                            Score: {c.score} ({c.verdict})
                          </span>
                        </div>
                        <p className="text-xs text-[color:var(--text-secondary)] mb-3 leading-relaxed">
                          {c.critique}
                        </p>
                        <div className="bg-[color:var(--surface-sunken)] p-2.5 rounded-xl border border-[color:var(--border-subtle)] text-[11px] text-[color:var(--text-secondary)]">
                          <strong className="text-[color:var(--text-primary)]">Recommendation: </strong>
                          {c.recommendation}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center rounded-2xl border border-dashed border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                  <div className="w-12 h-12 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center mx-auto mb-3 text-xl">
                    ⚖️
                  </div>
                  <h4 className="text-sm font-bold text-[color:var(--text-primary)] mb-1">
                    Grant Review Simulator
                  </h4>
                  <p className="text-xs text-[color:var(--text-secondary)] max-w-md mx-auto mb-4">
                    Click "Run Study Section Simulation" to evaluate your proposal across Significance, Innovation, Approach, and Investigator feasibility.
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStage !== "specific_aims" && currentStage !== "study_section_review" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-bold text-[color:var(--text-primary)] capitalize">
                  {PROPOSAL_STAGES.find((s) => s.id === currentStage)?.label}
                </h2>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                  {PROPOSAL_STAGES.find((s) => s.id === currentStage)?.desc}
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed mb-4">
                  This section is calibrated against {proposalData.fundingAgency} grant requirements and word budget constraints.
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentStage("study_section_review")}
                  className="px-4 py-2 bg-[color:var(--accent-solid)] text-white text-xs font-bold rounded-xl hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs"
                >
                  Proceed to Study Section Review →
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
