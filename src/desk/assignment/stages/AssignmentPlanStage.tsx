import React, { useState, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type { ResearchPlan, AssignmentType } from "../types";

export function generateAdaptiveResearchPlan(
  type: AssignmentType,
  question: string,
  academicLevel: string,
  analysis?: any
): ResearchPlan {
  const qClean = question?.trim() || "Academic coursework brief";
  const concepts = analysis?.keyConcepts?.length > 0 ? analysis.keyConcepts : ["Theoretical Foundation", "Empirical Analysis", "Critical Evaluation"];

  let coreQuestions: string[] = [];
  let debates: string[] = [];
  let evidenceTypes: string[] = [];
  let searchStrategies: string[] = [];
  let outOfScope: string[] = [];

  switch (type) {
    case "case_study":
      coreQuestions = [
        `What are the critical strategic challenges and root causes facing the organization in "${qClean.slice(0, 80)}"?`,
        "How do internal operational and cultural capabilities compare against external industry competitive pressures?",
        "Which strategic alternative generates the greatest sustainable competitive advantage and financial viability?",
      ];
      debates = [
        "Operational efficiency vs disruptive strategic innovation",
        "Short-term profitability vs long-term sustainable stakeholder value",
        "Internal restructuring vs external market expansion",
      ];
      evidenceTypes = [
        "Company financial statements and annual reports (10-K / annual filings)",
        "Industry market research reports (Gartner, Statista, IBISWorld)",
        "Peer-reviewed strategic management case analyses (HBR, Strategic Management Journal)",
      ];
      searchStrategies = [
        `"${concepts[0] || 'strategic positioning'}" AND "case study" AND "market performance"`,
        "competitive advantage AND industry disruption AND corporate governance",
        "strategic implementation roadmap AND operational risk mitigation",
      ];
      outOfScope = [
        "Broad macroeconomic history unrelated to the immediate industry context",
        "Unverified consumer opinions or generic blog commentary without audited financial data",
      ];
      break;

    case "report":
    case "business_assignment":
      coreQuestions = [
        `What are the terms of reference and primary operational findings regarding "${qClean.slice(0, 80)}"?`,
        "What empirical and organizational evidence substantiates the observed performance gaps?",
        "What prioritized, SMART recommendations should executive management implement?",
      ];
      debates = [
        "Cost reduction vs quality enhancement in process re-engineering",
        "Centralized regulatory compliance vs agile operational autonomy",
        "Capital expenditure feasibility vs expected return on investment (ROI)",
      ];
      evidenceTypes = [
        "Organizational benchmarks and operational key performance indicators (KPIs)",
        "Regulatory standards, industry codes of practice, and government whitepapers",
        "Empirical management research and peer-reviewed business publications",
      ];
      searchStrategies = [
        `"${concepts[0] || 'operational management'}" AND "benchmarking" AND "empirical findings"`,
        "best practices AND performance metrics AND policy compliance",
        "SMART recommendations AND organizational change implementation",
      ];
      outOfScope = [
        "Abstract philosophical conjecture unsupported by empirical organizational data",
        "Unfocused historical chronologies that do not serve the immediate terms of reference",
      ];
      break;

    case "reflection":
      coreQuestions = [
        `How did my personal and professional competencies manifest during the encounter in "${qClean.slice(0, 80)}"?`,
        "What cognitive assumptions or emotional responses influenced my decision-making process?",
        "How do established reflective models (e.g., Gibbs, Schön) explain my practice, and what concrete behavioral changes will I adopt?",
      ];
      debates = [
        "Intuitive clinical/professional judgment vs rigid protocol adherence",
        "Self-awareness of unconscious bias vs objective standards of practice",
        "Individual agency vs systemic institutional constraints",
      ];
      evidenceTypes = [
        "Reflective frameworks and educational theories (Gibbs, Schön, Kolb, Johns)",
        "Professional codes of ethics and disciplinary competency standards",
        "Peer-reviewed literature on reflective practice and professional development",
      ];
      searchStrategies = [
        "\"Gibbs reflective cycle\" AND professional development AND critical evaluation",
        "reflective practice AND clinical reasoning OR ethical decision-making",
        "transformative learning theory AND practice competency standards",
      ];
      outOfScope = [
        "Merely descriptive storytelling or diary logs lacking critical analytical depth",
        "External blame deflection without critical self-examination",
      ];
      break;

    case "lab_report":
      coreQuestions = [
        `What are the fundamental physical/chemical/biological mechanisms underlying "${qClean.slice(0, 80)}"?`,
        "Did empirical measurements corroborate or refute the established testable hypotheses?",
        "What systematic, instrument, and random errors influenced experimental precision, and how can they be mitigated?",
      ];
      debates = [
        "Theoretical model predictions vs empirical measurement anomalies",
        "Calibration precision vs environmental perturbation effects",
        "Statistical significance (p-values) vs practical physical relevance",
      ];
      evidenceTypes = [
        "Primary empirical laboratory datasets and instrument logs",
        "Peer-reviewed scientific methodology standards and protocol literature",
        "Authoritative physical/chemical/biological reference constants and values",
      ];
      searchStrategies = [
        `"${concepts[0] || 'experimental methodology'}" AND "empirical results" AND error analysis`,
        "standard protocol AND experimental uncertainty AND statistical validation",
        "peer-reviewed experimental calibration AND measurement error models",
      ];
      outOfScope = [
        "Subjective or speculative commentary without empirical mathematical backing",
        "Uncalibrated raw data tables dumped without statistical summaries or graphs",
      ];
      break;

    default: // Standard academic essays
      coreQuestions = [
        `What are the primary theoretical arguments and empirical evidence surrounding "${qClean.slice(0, 80)}"?`,
        "How do competing scholarly perspectives interpret the central tension or causal mechanism?",
        "What evidence-grounded thesis best withstands critical counterargument and scrutiny?",
      ];
      debates = [
        "Orthodox foundational theory vs revisionist critical interpretations",
        "Quantitative empirical models vs qualitative interpretive frameworks",
        "Universal theoretical claims vs context-specific historical realities",
      ];
      evidenceTypes = [
        "Peer-reviewed academic journal articles from leading field publications",
        "Seminal scholarly monographs and university press publications",
        "Audited institutional empirical data and meta-analyses",
      ];
      searchStrategies = [
        `"${concepts[0] || 'core theory'}" AND "critical evaluation" AND "scholarly debate"`,
        `"${concepts[1] || 'empirical evidence'}" AND theoretical frameworks AND ${academicLevel}`,
        "systematic review AND counterarguments AND contemporary synthesis",
      ];
      outOfScope = [
        "Non-academic opinion pieces, Wikipedia entries, and unverified blogs",
        "Tangential background details that do not directly address the prompt's command verbs",
      ];
      break;
  }

  return {
    coreQuestions,
    mainConcepts: concepts,
    keyDebates: debates,
    evidenceTypesNeeded: evidenceTypes,
    searchStrategies,
    outOfScopeTopics: outOfScope,
    approvedByUser: true,
  };
}

export default function AssignmentPlanStage() {
  const {
    projectId,
    question,
    academicLevel,
    assignmentType,
    analysis,
    researchPlan,
    setResearchPlan,
    advanceStage,
  } = useAssignmentWorkspace();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable local state
  const [questions, setQuestions] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [debates, setDebates] = useState<string[]>([]);
  const [evidenceTypes, setEvidenceTypes] = useState<string[]>([]);
  const [searchStrategies, setSearchStrategies] = useState<string[]>([]);
  const [outOfScope, setOutOfScope] = useState<string[]>([]);

  useEffect(() => {
    if (researchPlan) {
      setQuestions(researchPlan.coreQuestions || []);
      setConcepts(researchPlan.mainConcepts || []);
      setDebates(researchPlan.keyDebates || []);
      setEvidenceTypes(researchPlan.evidenceTypesNeeded || []);
      setSearchStrategies(researchPlan.searchStrategies || []);
      setOutOfScope(researchPlan.outOfScopeTopics || []);
    } else {
      handleGeneratePlan();
    }
  }, [researchPlan]);

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await authedJsonFetch(`/api/projects/${projectId}/assignment/plan`, "POST", {
        question,
        academicLevel,
        assignmentType,
        analysis,
      });
      if (!res.ok) throw new Error("Failed to generate research plan from server");
      const data: ResearchPlan = await res.json();
      await setResearchPlan(data);
    } catch (err: any) {
      console.warn("Using resilient adaptive research plan generator:", err);
      const adaptivePlan = generateAdaptiveResearchPlan(
        assignmentType,
        question,
        academicLevel,
        analysis
      );
      await setResearchPlan(adaptivePlan);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprove = async () => {
    const updated: ResearchPlan = {
      coreQuestions: questions,
      mainConcepts: concepts,
      keyDebates: debates,
      evidenceTypesNeeded: evidenceTypes,
      searchStrategies: searchStrategies,
      outOfScopeTopics: outOfScope,
      approvedByUser: true,
    };
    await setResearchPlan(updated);
    advanceStage("research");
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header Banner */}
      <div className="border-b border-[color:var(--border-subtle)] pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🗺️</span>
            <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
              Phase 2: Academic Research Plan
            </h2>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)]">
            A targeted research strategy tailored to your assignment question and academic level.
          </p>
        </div>

        <button
          type="button"
          disabled={isGenerating}
          onClick={handleGeneratePlan}
          className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-semibold hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
        >
          {isGenerating ? "Regenerating…" : "🔄 Regenerate Plan"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {isGenerating && !researchPlan ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-3">
          <div className="w-8 h-8 border-3 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-[color:var(--text-secondary)]">
            Assignment Research Agent formulating research questions and search strategies…
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Core Research Questions */}
          <div className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                <span>❓ Core Questions to Answer</span>
              </h3>
              <span className="text-[11px] text-[color:var(--text-muted)]">
                Must be answered to satisfy the grading rubric
              </span>
            </div>

            <div className="space-y-2">
              {questions.map((q, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[color:var(--accent)] shrink-0">Q{idx + 1}.</span>
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => {
                      const copy = [...questions];
                      copy[idx] = e.target.value;
                      setQuestions(copy);
                    }}
                    className="flex-1 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[color:var(--text-primary)]"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Key Debates & Concepts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] space-y-2">
              <h4 className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
                <span>⚖️ Scholarly Debates & Contested Points</span>
              </h4>
              <ul className="text-xs text-[color:var(--text-secondary)] space-y-1.5 list-disc list-inside">
                {debates.map((deb, i) => (
                  <li key={i}>{deb}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] space-y-2">
              <h4 className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
                <span>📚 Foundational Concepts & Theories</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {concepts.map((conc, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-[color:var(--text-primary)]"
                  >
                    {conc}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Search Strategy & Scope Control */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] space-y-2">
              <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <span>🔍 Recommended Search Strategies & Queries</span>
              </h4>
              <ul className="text-xs text-[color:var(--text-secondary)] space-y-1">
                {searchStrategies.map((strat, i) => (
                  <li key={i} className="font-mono text-[11px] bg-[color:var(--surface-raised)] p-1.5 rounded border border-[color:var(--border-subtle)]">
                    {strat}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 space-y-2">
              <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <span>🚫 Out-of-Scope Topics (Do Not Research)</span>
              </h4>
              <ul className="text-xs text-[color:var(--text-secondary)] space-y-1 list-disc list-inside">
                {outOfScope.map((topic, i) => (
                  <li key={i}>{topic}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Approve Banner */}
          <div className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-[color:var(--accent)]">
                Ready to gather academic evidence?
              </h4>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Approve your research plan to activate the Assignment Research Agent & query your Knowledge Vault.
              </p>
            </div>
            <button
              type="button"
              onClick={handleApprove}
              className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs"
            >
              ✓ Approve Plan & Start Researching →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
