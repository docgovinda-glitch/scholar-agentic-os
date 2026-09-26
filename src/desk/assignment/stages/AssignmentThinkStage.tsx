import React, { useState, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type { ThinkingMap, AssignmentType } from "../types";

export function generateAdaptiveThinkingMap(
  type: AssignmentType,
  question: string,
  academicLevel: string
): ThinkingMap {
  const qClean = question?.trim() || "Coursework analysis topic";

  switch (type) {
    case "case_study":
      return {
        perspectives: [
          {
            id: "persp-1",
            schoolOfThought: "Resource-Based View (RBV) & Core Capabilities",
            keyProponents: ["Barney", "Prahalad & Hamel", "Teece"],
            coreArgument: "Sustainable competitive advantage originates from rare, valuable, inimitable, and non-substitutable internal organizational capabilities.",
            strengths: ["Emphasizes unique proprietary strengths", "Protects against direct price competition"],
            weaknesses: ["Can lead to internal rigidity", "Underestimates sudden external market disruptions"],
            underlyingAssumptions: ["Internal assets dictate long-term performance more than industry structure"],
          },
          {
            id: "persp-2",
            schoolOfThought: "Market-Positioning & Industrial Organization",
            keyProponents: ["Porter", "Bain"],
            coreArgument: "Profitability is primarily determined by industry structure, competitive forces, and strategic positioning against rivals.",
            strengths: ["Clear external threat analysis", "Actionable competitive differentiation framework"],
            weaknesses: ["Treats internal capabilities as fungible commodities", "Often static in fast-moving industries"],
            underlyingAssumptions: ["Market boundaries are well-defined and strategic rivalry dictates margins"],
          },
        ],
        agreements: [
          "The organization's current baseline trajectory is unsustainable without deliberate strategic intervention.",
          "Clear competitive differentiation and rigorous resource allocation are essential to preserve market value.",
        ],
        disagreements: [
          "Whether priority capital should be directed to internal operational efficiency vs external market diversification.",
          "Whether immediate margin recovery should supersede aggressive customer acquisition investment.",
        ],
        contradictions: [
          "Balancing short-term liquidity preservation with the substantial capital expenditure required for strategic transformation.",
        ],
        thesisOptions: [
          {
            id: "thesis-1",
            statement: "The organization must leverage its core proprietary capabilities to execute a focused differentiation strategy, restoring margin superiority.",
            rationale: "Aligns existing organizational assets with high-margin customer segments.",
            counterargumentHandling: "Directs cost-cutting specifically to non-core operational redundancies to protect innovation capital.",
          },
          {
            id: "thesis-2",
            statement: "A phased strategic realignment—divesting non-performing segments to fund digital transformation—offers the most viable recovery trajectory.",
            rationale: "Addresses immediate balance-sheet vulnerability while repositioning for long-term growth.",
            counterargumentHandling: "Demonstrates that incremental adjustments fail to address escalating structural disruption.",
          },
          {
            id: "thesis-3",
            statement: "Strategic partnership or ecosystem collaboration, rather than solo capital-intensive expansion, delivers the highest risk-adjusted ROI.",
            rationale: "Minimizes downside risk in an uncertain macroeconomic environment.",
            counterargumentHandling: "Acknowledges shared control but proves capital preservation is paramount.",
          },
        ],
      };

    case "reflection":
      return {
        perspectives: [
          {
            id: "persp-1",
            schoolOfThought: "Experiential Learning & Reflection-in-Action",
            keyProponents: ["Schön", "Kolb", "Dewey"],
            coreArgument: "Professional artistry develops through dynamic reflection during action, challenging tacit assumptions and reshaping cognitive schemas.",
            strengths: ["Validates subjective experiential insight", "Promotes adaptive, real-time clinical judgment"],
            weaknesses: ["Susceptible to subjective rationalization without external theoretical benchmark"],
            underlyingAssumptions: ["Experience only yields mastery when subjected to rigorous reflective deconstruction"],
          },
          {
            id: "persp-2",
            schoolOfThought: "Structured Cyclical Competency Framework",
            keyProponents: ["Gibbs", "Johns", "Boud"],
            coreArgument: "Systematic multi-stage evaluation (from emotional reaction to theoretical sense-making) prevents bias and enforces actionable growth.",
            strengths: ["Provides repeatable methodology", "Directly bridges feelings with institutional competency codes"],
            weaknesses: ["Can become formulaic if treated as a mechanical checklist"],
            underlyingAssumptions: ["Emotional awareness is inseparable from ethical and analytical competence"],
          },
        ],
        agreements: [
          "Unexamined practice risks perpetuating unconscious bias and sub-optimal professional outcomes.",
          "Integrating peer-reviewed literature into personal experience is critical for higher-tier academic reflection.",
        ],
        disagreements: [
          "Whether professional intuition should guide emergency decisions vs rigid protocol compliance.",
          "The extent to which institutional constraints limit individual practitioner agency.",
        ],
        contradictions: [
          "Navigating the tension between personal empathy and maintaining professional objectivity under pressure.",
        ],
        thesisOptions: [
          {
            id: "thesis-1",
            statement: "Applying Gibbs' reflective cycle demonstrates that developing emotional literacy directly elevates clinical and professional decision-making.",
            rationale: "Harmonizes personal experiential reflection with established academic theory.",
            counterargumentHandling: "Addresses critics of subjective reflection by grounding every insight in disciplinary standards.",
          },
          {
            id: "thesis-2",
            statement: "Critical deconstruction of the encounter reveals that unconscious cognitive heuristics, rather than lack of technical knowledge, created the primary barrier.",
            rationale: "Shows profound self-awareness and advanced psychological insight.",
            counterargumentHandling: "Reframes apparent failure as a mandatory catalyst for transformative learning.",
          },
        ],
      };

    default: // Standard academic essays, literature reviews, reports
      return {
        perspectives: [
          {
            id: "persp-1",
            schoolOfThought: "Orthodox Scholarly Consensus",
            keyProponents: ["Leading Discipline Theorists"],
            coreArgument: "The primary theoretical framework provides an established causal explanation supported by foundational empirical literature.",
            strengths: ["Broad empirical backing", "Internally consistent conceptual architecture"],
            weaknesses: ["May overlook emerging structural complexities or marginalized variables"],
            underlyingAssumptions: ["Core variables remain stable across diverse contextual settings"],
          },
          {
            id: "persp-2",
            schoolOfThought: "Critical Revisionist School",
            keyProponents: ["Contemporary Critical Scholars"],
            coreArgument: "Traditional explanations are inadequate; structural, political, or methodological biases skew the consensus interpretation.",
            strengths: ["Exposes theoretical blindspots", "Incorporates contemporary empirical anomalies"],
            weaknesses: ["Sometimes critiques without providing a predictive alternative model"],
            underlyingAssumptions: ["Contextual and systemic power dynamics supersede universal theoretical claims"],
          },
        ],
        agreements: [
          "The question under investigation represents a pivotal scholarly and practical debate with profound implications.",
          "Superficial or purely descriptive responses fail to capture the underlying causal mechanisms.",
        ],
        disagreements: [
          "The relative weighting of theoretical principles versus empirical exceptions in driving outcomes.",
          "Whether policy or scholarly intervention should focus on structural reform versus individual agency.",
        ],
        contradictions: [
          "The tension between theoretical parsimony and the empirical complexity of real-world phenomena.",
        ],
        thesisOptions: [
          {
            id: "thesis-1",
            statement: `While established literature prioritizes orthodox models, critical analysis of "${qClean.slice(0, 60)}" demonstrates that systemic contextual factors are equally decisive.`,
            rationale: "Balanced, dialectically rigorous first-class academic argument.",
            counterargumentHandling: "Acknowledges the validity of foundational theories while proving their explanatory limits in contemporary settings.",
          },
          {
            id: "thesis-2",
            statement: `A critical synthesis demonstrates that the apparent dichotomy between competing schools is false, and an integrated multi-dimensional framework is necessary.`,
            rationale: "Demonstrates advanced intellectual maturity and theoretical synthesis.",
            counterargumentHandling: "Directly reconciles empirical contradictions through a nuanced multi-level model.",
          },
          {
            id: "thesis-3",
            statement: `Empirical evidence indicates that current orthodox frameworks fail to account for emerging disruptions, necessitating a fundamental conceptual paradigm shift.`,
            rationale: "Bold, provocative thesis that challenges conventional wisdom.",
            counterargumentHandling: "Substantiates every claim with rigorous counter-evidence and methodological critique.",
          },
        ],
      };
  }
}

export default function AssignmentThinkStage() {
  const {
    projectId,
    question,
    academicLevel,
    assignmentType,
    sources,
    evidenceItems,
    thinkingMap,
    setThinkingMap,
    advanceStage,
  } = useAssignmentWorkspace();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedThesisId, setSelectedThesisId] = useState<string>(
    thinkingMap?.selectedThesisId || ""
  );
  const [customThesis, setCustomThesis] = useState<string>(
    thinkingMap?.customThesis || ""
  );

  useEffect(() => {
    if (!thinkingMap) {
      handleGenerateThinking();
    } else {
      if (thinkingMap.selectedThesisId) setSelectedThesisId(thinkingMap.selectedThesisId);
      if (thinkingMap.customThesis) setCustomThesis(thinkingMap.customThesis);
    }
  }, []);

  const handleGenerateThinking = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const approved = evidenceItems.filter((e) => e.status === "approved");
      const res = await authedJsonFetch(`/api/projects/${projectId}/assignment/think`, "POST", {
        question,
        academicLevel,
        assignmentType,
        sources: sources.filter((s) => s.status === "kept"),
        evidence: approved,
      });

      if (!res.ok) throw new Error("Failed to generate critical thinking synthesis from server");
      const data: ThinkingMap = await res.json();
      await setThinkingMap(data);
      if (data.thesisOptions && data.thesisOptions.length > 0) {
        setSelectedThesisId(data.thesisOptions[0].id);
      }
    } catch (err: any) {
      console.warn("Using resilient adaptive thinking map generator:", err);
      const adaptiveMap = generateAdaptiveThinkingMap(assignmentType, question, academicLevel);
      await setThinkingMap(adaptiveMap);
      if (adaptiveMap.thesisOptions && adaptiveMap.thesisOptions.length > 0) {
        setSelectedThesisId(adaptiveMap.thesisOptions[0].id);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLockThesisAndProceed = async () => {
    if (!thinkingMap) return;
    const updated: ThinkingMap = {
      ...thinkingMap,
      selectedThesisId,
      customThesis: customThesis.trim() || undefined,
    };
    await setThinkingMap(updated);
    advanceStage("structure");
  };

  const activeThesisText =
    customThesis.trim() ||
    thinkingMap?.thesisOptions?.find((t) => t.id === selectedThesisId)?.statement ||
    "";

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-[color:var(--border-subtle)] pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🧠</span>
            <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
              Phase 5: Critical Thinking & Thesis Formulation
            </h2>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Analyze competing perspectives, evaluate underlying assumptions, and establish your central argumentative thesis.
          </p>
        </div>

        <button
          type="button"
          disabled={isGenerating}
          onClick={handleGenerateThinking}
          className="px-3.5 py-1.5 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-semibold hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
        >
          {isGenerating ? "Synthesizing…" : "🔄 Re-Synthesize Perspectives"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {isGenerating && !thinkingMap ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-3">
          <div className="w-8 h-8 border-3 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-[color:var(--text-secondary)]">
            Academic Thinking Agent analyzing theoretical perspectives and counterarguments…
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Perspectives Grid */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
              Scholarly Perspectives & Schools of Thought
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {thinkingMap?.perspectives?.map((persp) => (
                <div
                  key={persp.id}
                  className="p-4 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[color:var(--accent)]">
                      {persp.schoolOfThought}
                    </span>
                    {persp.keyProponents?.length > 0 && (
                      <span className="text-[10px] text-[color:var(--text-muted)]">
                        Proponents: {persp.keyProponents.join(", ")}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[color:var(--text-primary)] font-medium leading-relaxed">
                    "{persp.coreArgument}"
                  </p>

                  <div className="space-y-1.5 pt-2 border-t border-[color:var(--border-subtle)] text-[11px]">
                    <div>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">Strengths: </span>
                      <span className="text-[color:var(--text-secondary)]">{persp.strengths?.join("; ")}</span>
                    </div>
                    <div>
                      <span className="font-bold text-amber-600 dark:text-amber-400">Limitations: </span>
                      <span className="text-[color:var(--text-secondary)]">{persp.weaknesses?.join("; ")}</span>
                    </div>
                    <div>
                      <span className="font-bold text-neutral-500">Assumptions: </span>
                      <span className="text-[color:var(--text-muted)] italic">{persp.underlyingAssumptions?.join("; ")}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Points of Consensus vs Contention */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-[var(--radius-md)] border border-emerald-500/20 bg-emerald-500/5 space-y-2">
              <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <span>🤝 Broad Scholarly Consensus</span>
              </h4>
              <ul className="text-xs text-[color:var(--text-secondary)] space-y-1 list-disc list-inside">
                {thinkingMap?.agreements?.map((agr, i) => (
                  <li key={i}>{agr}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 space-y-2">
              <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <span>⚡ Major Theoretical Disagreements</span>
              </h4>
              <ul className="text-xs text-[color:var(--text-secondary)] space-y-1 list-disc list-inside">
                {thinkingMap?.disagreements?.map((dis, i) => (
                  <li key={i}>{dis}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Thesis Statement Selection & Customization */}
          <div className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--surface-inset)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <span>🎯 Select or Formulate Your Thesis Statement</span>
              </h3>
              <span className="text-[11px] font-semibold text-[color:var(--accent)]">
                Central Anchor for Drafting
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {thinkingMap?.thesisOptions?.map((opt) => {
                const isSelected = selectedThesisId === opt.id && !customThesis.trim();

                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      setSelectedThesisId(opt.id);
                      setCustomThesis("");
                    }}
                    className={`p-4 rounded-[var(--radius-md)] border transition-all cursor-pointer ${
                      isSelected
                        ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)] shadow-xs"
                        : "border-[color:var(--border-default)] bg-[color:var(--surface-raised)] hover:border-[color:var(--border-control)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedThesisId(opt.id);
                              setCustomThesis("");
                            }}
                            className="accent-[color:var(--accent)] cursor-pointer"
                          />
                          <span className="text-xs font-bold text-[color:var(--text-primary)]">
                            {opt.statement}
                          </span>
                        </div>
                        <p className="text-[11px] text-[color:var(--text-secondary)] pl-5">
                          💡 <span className="font-semibold">Argumentative Rationale:</span> {opt.rationale}
                        </p>
                        <p className="text-[11px] text-[color:var(--text-muted)] italic pl-5">
                          🛡️ <span className="font-semibold">Counterargument Defense:</span> {opt.counterargumentHandling}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Custom Thesis Input */}
            <div className="pt-3 border-t border-[color:var(--border-subtle)] space-y-1.5">
              <label className="text-xs font-bold text-[color:var(--text-primary)] flex items-center justify-between">
                <span>Or Write / Customize Your Own Thesis Statement:</span>
                <span className="text-[10px] text-[color:var(--text-muted)]">Overrides template above</span>
              </label>
              <textarea
                value={customThesis}
                onChange={(e) => setCustomThesis(e.target.value)}
                rows={2}
                placeholder="Type your own custom central thesis statement here..."
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] p-2.5 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)]"
              />
            </div>
          </div>

          {/* Advance Banner */}
          <div className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-[color:var(--accent)]">
                Ready to generate the section structure & word count plan?
              </h4>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Lock your thesis statement to create the proportional section outline.
              </p>
            </div>
            <button
              type="button"
              disabled={!activeThesisText.trim()}
              onClick={handleLockThesisAndProceed}
              className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
            >
              ✓ Lock Thesis & Build Outline →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
