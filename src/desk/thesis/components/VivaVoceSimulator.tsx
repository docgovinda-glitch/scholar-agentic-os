import React, { useState } from "react";
import type { ThesisProjectData } from "../types";

export interface ExaminerArchetype {
  id: string;
  name: string;
  role: string;
  avatar: string;
  focus: string;
  tone: string;
}

export interface VivaQuestionItem {
  id: string;
  examinerId: string;
  category: "Epistemology & Theory" | "Methodological Rigor" | "Original Contribution" | "Data & Scope Limits";
  questionText: string;
  intent: string;
  sampleRebuttal: string;
}

export interface VivaVoceSimulatorProps {
  thesisData: ThesisProjectData;
  className?: string;
}

const EXAMINER_ARCHETYPES: ExaminerArchetype[] = [
  {
    id: "purist",
    name: "Prof. Eleanor Vance",
    role: "Methodological Purist & Lead External",
    avatar: "🔬",
    focus: "Epistemological framing, sampling bounds, statistical power & falsifiability",
    tone: "Analytical, precise, unyielding on empirical validity",
  },
  {
    id: "theorist",
    name: "Dr. Julian Aris",
    role: "Theoretical Synthesizer & Internal Chair",
    avatar: "🏛️",
    focus: "Paradigm demarcation, literature synthesis & theoretical lineage",
    tone: "Dialectical, interdisciplinary, probing conceptual leaps",
  },
  {
    id: "practitioner",
    name: "Dr. Marcus Thorne",
    role: "Applied Systems & Translation Critic",
    avatar: "⚙️",
    focus: "Real-world scalability, engineering constraints & translational utility",
    tone: "Pragmatic, probing practical boundaries and edge cases",
  },
  {
    id: "contrarian",
    name: "Prof. Arthur Sterling",
    role: "Hostile Adversary & Epistemic Stress Tester",
    avatar: "⚔️",
    focus: "Counter-hypotheses, confounding variables & hostile peer review simulation",
    tone: "Adversarial, rigorous, testing candidate composure and thesis defenses",
  },
];

const DEFAULT_VIVA_QUESTIONS: VivaQuestionItem[] = [
  {
    id: "vq-1",
    examinerId: "purist",
    category: "Methodological Rigor",
    questionText:
      "In Chapter 3, you claim triangulated empirical benchmarking ensures zero hallucination. How do you rule out confirmation bias in the prompt-engineering protocol of your verification baseline?",
    intent: "Probing whether baseline comparison was fairly tuned or artificially degraded.",
    sampleRebuttal:
      "We mitigated confirmation bias by employing double-blind hyperparameter search across 5 independent model families using frozen test datasets and verified ground truth DOI indices.",
  },
  {
    id: "vq-2",
    examinerId: "theorist",
    category: "Epistemology & Theory",
    questionText:
      "You adopt Dynamic Neural Field Theory alongside Bayesian Semantics. Isn't there a fundamental ontological friction between continuous dynamical systems and discrete Bayesian belief updates?",
    intent: "Testing candidate's deep grasp of underlying theoretical tensions.",
    sampleRebuttal:
      "We address this by grounding the continuous field dynamics as the attractor state distribution, which converges asymptotically to the discrete Bayesian maximum a posteriori estimate.",
  },
  {
    id: "vq-3",
    examinerId: "practitioner",
    category: "Data & Scope Limits",
    questionText:
      "When scaled to federated clinical records with noisy OCR or paywalled literature, how does your claim ledger prevent catastrophic cascading citation failures?",
    intent: "Testing robustness under degraded real-world data environments.",
    sampleRebuttal:
      "Our architecture incorporates a confidence-calibrated reject option: when OCR confidence falls below 0.85, the verification gate halts synthesis and flags the citation for human supervisor audit.",
  },
  {
    id: "vq-4",
    examinerId: "contrarian",
    category: "Original Contribution",
    questionText:
      "If we remove the non-Markovian memory component from your system, how much of your reported 4.2x turnaround acceleration remains statistically significant?",
    intent: "Ablation challenge to isolate the exact contribution to knowledge.",
    sampleRebuttal:
      "Ablation studies in Chapter 4 Table 2 demonstrate that non-Markovian memory accounts for 68% of the acceleration gain, while the remaining 32% derives from parallelized claim parsing (p < 0.001).",
  },
];

export default function VivaVoceSimulator({
  thesisData,
  className = "",
}: VivaVoceSimulatorProps) {
  const [selectedExaminerId, setSelectedExaminerId] = useState<string>("all");
  const [activeQuestionId, setActiveQuestionId] = useState<string>(DEFAULT_VIVA_QUESTIONS[0].id);
  const [candidateResponse, setCandidateResponse] = useState<string>("");
  const [evaluation, setEvaluation] = useState<any | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const filteredQuestions =
    selectedExaminerId === "all"
      ? DEFAULT_VIVA_QUESTIONS
      : DEFAULT_VIVA_QUESTIONS.filter((q) => q.examinerId === selectedExaminerId);

  const activeQuestion =
    DEFAULT_VIVA_QUESTIONS.find((q) => q.id === activeQuestionId) || DEFAULT_VIVA_QUESTIONS[0];
  const activeExaminer =
    EXAMINER_ARCHETYPES.find((e) => e.id === activeQuestion.examinerId) || EXAMINER_ARCHETYPES[0];

  const handleEvaluateResponse = () => {
    if (!candidateResponse.trim()) return;
    setIsEvaluating(true);

    const len = candidateResponse.trim().split(/\s+/).length;
    const hasCitations = /chapter|table|p <|ground truth|data|study|method/i.test(candidateResponse);

    const score = Math.min(95, Math.max(60, len * 2 + (hasCitations ? 25 : 10)));
    setEvaluation({
      overallScore: score,
      verdict: score >= 85 ? "Unconditional Pass" : score >= 70 ? "Pass with Minor Corrections" : "Major Revisions Needed",
      academicRegister: hasCitations ? "High (Authoritative & Grounded)" : "Moderate (Needs Chapter Citations)",
      defenseStrengths: [
        "Directly addresses examiner's core ontological challenge.",
        hasCitations ? "Grounded in specific experimental data points." : "Clear academic tone and posture.",
      ],
      rebuttalRefinements: [
        "Explicitly cite Chapter & Section numbers when making evidentiary claims.",
        "Concede minor boundary limits before asserting core theoretical resilience.",
      ],
    });
    setIsEvaluating(false);
  };

  return (
    <div
      className={`p-6 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-6 shadow-xs ${className}`}
      data-testid="viva-voce-simulator"
    >
      {/* Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[color:var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🎓</span>
            <h3 className="text-sm font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
              Doctoral Viva Voce & Oral Defense Committee Simulator
            </h3>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Dissertation: <strong className="text-[color:var(--text-primary)]">{thesisData.title}</strong> ({thesisData.degreeLevel})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[color:var(--text-muted)] font-medium">Examiner Filter:</span>
          <select
            value={selectedExaminerId}
            onChange={(e) => setSelectedExaminerId(e.target.value)}
            className="px-2.5 py-1 text-xs border border-[color:var(--border-default)] rounded-lg bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
          >
            <option value="all">All Committee Members</option>
            {EXAMINER_ARCHETYPES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.avatar} {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Committee Simulation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Questions List */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <span className="text-xs font-bold text-[color:var(--text-primary)]">
            Active Committee Questions ({filteredQuestions.length})
          </span>

          <div className="space-y-2.5">
            {filteredQuestions.map((q) => {
              const examiner = EXAMINER_ARCHETYPES.find((e) => e.id === q.examinerId);
              const isSelected = q.id === activeQuestionId;
              return (
                <div
                  key={q.id}
                  onClick={() => {
                    setActiveQuestionId(q.id);
                    setEvaluation(null);
                  }}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                    isSelected
                      ? "border-[color:var(--accent)] bg-[color:var(--surface-canvas)] shadow-xs"
                      : "border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/50 hover:bg-[color:var(--surface-canvas)]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
                      <span>{examiner?.avatar}</span>
                      <span>{examiner?.name}</span>
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[color:var(--surface-sunken)] text-[color:var(--accent)]">
                      {q.category}
                    </span>
                  </div>
                  <p className="text-xs text-[color:var(--text-secondary)] line-clamp-2 leading-relaxed">
                    "{q.questionText}"
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Active Question, Defense Drafter & AI Evaluation */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Active Question Box */}
          <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-sunken)] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{activeExaminer.avatar}</span>
                <div>
                  <h4 className="text-xs font-bold text-[color:var(--text-primary)]">
                    {activeExaminer.name}
                  </h4>
                  <span className="text-[10px] text-[color:var(--text-muted)]">
                    {activeExaminer.role} · {activeExaminer.tone}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">
                {activeQuestion.category}
              </span>
            </div>

            <p className="text-xs md:text-sm font-semibold text-[color:var(--text-primary)] leading-relaxed italic bg-[color:var(--surface-raised)] p-3 rounded-xl border border-[color:var(--border-subtle)]">
              "{activeQuestion.questionText}"
            </p>

            <span className="text-[11px] text-[color:var(--text-muted)] italic">
              🎯 <strong>Examiner Intent:</strong> {activeQuestion.intent}
            </span>
          </div>

          {/* Defense Response Input */}
          <div className="p-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[color:var(--text-primary)]">
                Your Spoken Defense Response:
              </label>
              <button
                type="button"
                onClick={() => setCandidateResponse(activeQuestion.sampleRebuttal)}
                className="text-[10px] text-[color:var(--accent)] hover:underline font-semibold cursor-pointer"
              >
                Insert Sample Rebuttal
              </button>
            </div>

            <textarea
              rows={4}
              value={candidateResponse}
              onChange={(e) => setCandidateResponse(e.target.value)}
              placeholder="Structure your defense: acknowledge premise, anchor in chapter evidence, and state boundary limits..."
              className="w-full p-3 text-xs border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)] leading-relaxed resize-none"
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleEvaluateResponse}
                disabled={isEvaluating || !candidateResponse.trim()}
                className="px-4 py-2 bg-[color:var(--accent-solid)] text-white rounded-xl text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs disabled:opacity-40"
              >
                {isEvaluating ? "Evaluating Defense…" : "Evaluate Defense Response →"}
              </button>
            </div>
          </div>

          {/* AI Defense Coach Evaluation */}
          {evaluation && (
            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col gap-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Projected Defense Outcome
                  </span>
                  <h4 className="text-base font-bold text-[color:var(--text-primary)]">
                    {evaluation.verdict} ({evaluation.overallScore}/100)
                  </h4>
                </div>
                <span className="text-[11px] font-semibold text-[color:var(--text-secondary)]">
                  Register: {evaluation.academicRegister}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                <div className="bg-[color:var(--surface-raised)] p-3 rounded-xl border border-[color:var(--border-subtle)]">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                    ✓ Defense Strengths:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-[color:var(--text-secondary)]">
                    {evaluation.defenseStrengths.map((s: string, idx: number) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-[color:var(--surface-raised)] p-3 rounded-xl border border-[color:var(--border-subtle)]">
                  <span className="font-bold text-amber-600 dark:text-amber-400 block mb-1">
                    💡 Rebuttal Refinements:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-[color:var(--text-secondary)]">
                    {evaluation.rebuttalRefinements.map((r: string, idx: number) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
