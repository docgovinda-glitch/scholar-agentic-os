import React, { useState, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type {
  ResearchPlan,
  AssignmentType,
  CoreResearchQuestion,
  RecommendedSearchStrategy,
} from "../types";

export function normalizeQuestion(
  q: string | CoreResearchQuestion,
  idx: number
): CoreResearchQuestion {
  if (typeof q === "string") {
    return {
      id: `q-${idx + 1}`,
      question: q,
      rationale:
        "Dialectical inquiry addressing the examiner command verbs and grading rubric criteria.",
      category:
        idx === 0
          ? "Theoretical Foundation"
          : idx === 1
          ? "Dialectical Tension"
          : "Empirical Reality",
    };
  }
  return {
    id: q.id || `q-${idx + 1}`,
    question: q.question,
    rationale:
      q.rationale ||
      "Dialectical inquiry addressing the examiner command verbs and grading rubric criteria.",
    category: q.category || "Research Focus",
  };
}

export function normalizeStrategy(
  s: string | RecommendedSearchStrategy,
  idx: number
): RecommendedSearchStrategy {
  if (typeof s === "string") {
    return {
      id: `strat-${idx + 1}`,
      database: idx % 2 === 0 ? "Google Scholar" : "JSTOR / Scopus",
      searchQuery: s,
      relevanceTarget:
        "Peer-reviewed academic journal publications and authoritative empirical evidence.",
    };
  }
  return {
    id: s.id || `strat-${idx + 1}`,
    database: s.database || "Google Scholar",
    searchQuery: s.searchQuery,
    relevanceTarget:
      s.relevanceTarget ||
      "Peer-reviewed academic journal publications and authoritative empirical evidence.",
  };
}

export function generateAdaptiveResearchPlan(
  type: AssignmentType,
  question: string,
  academicLevel: string,
  analysis?: any
): ResearchPlan {
  const qClean = question?.trim() || "Academic coursework brief";
  const concepts =
    analysis?.keyConcepts?.length > 0
      ? analysis.keyConcepts
      : ["Theoretical Foundation", "Empirical Analysis", "Critical Evaluation"];

  let coreQuestions: CoreResearchQuestion[] = [];
  let debates: string[] = [];
  let evidenceTypes: string[] = [];
  let searchStrategies: RecommendedSearchStrategy[] = [];
  let outOfScope: string[] = [];

  switch (type) {
    case "case_study":
      coreQuestions = [
        {
          id: "q-1",
          question: `What are the critical strategic challenges and root causes facing the organization in "${qClean.slice(0, 80)}"?`,
          category: "Root Cause Diagnostics",
          rationale: "Addresses internal organizational vulnerabilities and industry context.",
        },
        {
          id: "q-2",
          question: "How do internal operational capabilities compare against external competitive industry pressures?",
          category: "Competitive Dynamics",
          rationale: "Balances resource-based view against external Porterian market forces.",
        },
        {
          id: "q-3",
          question: "Which strategic alternative generates the greatest sustainable competitive advantage and financial viability?",
          category: "Strategic Feasibility",
          rationale: "Synthesizes quantitative metrics and qualitative feasibility to defend recommendations.",
        },
      ];
      debates = [
        "Operational efficiency vs disruptive strategic innovation",
        "Short-term profitability vs long-term sustainable stakeholder value",
        "Internal restructuring vs external market expansion",
      ];
      evidenceTypes = [
        "Company financial statements and annual filings (10-K / annual reports)",
        "Industry market research reports (Gartner, Statista, IBISWorld)",
        "Peer-reviewed strategic management case studies (HBR, Strategic Management Journal)",
      ];
      searchStrategies = [
        {
          id: "strat-1",
          database: "Google Scholar",
          searchQuery: `"${concepts[0] || "strategic positioning"}" AND "case study" AND "market performance"`,
          relevanceTarget: "Benchmarking empirical case studies and performance data.",
        },
        {
          id: "strat-2",
          database: "JSTOR / Scopus",
          searchQuery: `"competitive advantage" AND "industry disruption" AND "corporate governance"`,
          relevanceTarget: "Peer-reviewed strategic models and theoretical underpinnings.",
        },
        {
          id: "strat-3",
          database: "CrossRef",
          searchQuery: `"strategic implementation roadmap" AND "operational risk mitigation"`,
          relevanceTarget: "Implementation frameworks and risk assessment literature.",
        },
      ];
      outOfScope = [
        "Broad macroeconomic history unrelated to the immediate industry context",
        "Unverified consumer opinions or generic blog commentary without audited financial data",
      ];
      break;

    case "report":
    case "business_assignment":
      coreQuestions = [
        {
          id: "q-1",
          question: `What are the terms of reference and primary operational findings regarding "${qClean.slice(0, 80)}"?`,
          category: "Terms of Reference",
          rationale: "Establishes institutional parameters and diagnostic baseline.",
        },
        {
          id: "q-2",
          question: "What empirical and organizational evidence substantiates the observed performance gaps?",
          category: "Empirical Grounding",
          rationale: "Requires hard data, metrics, and institutional benchmarks.",
        },
        {
          id: "q-3",
          question: "What prioritized, SMART recommendations should executive management implement?",
          category: "Actionable Synthesis",
          rationale: "Delivers executive-ready, prioritized interventions with risk controls.",
        },
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
        {
          id: "strat-1",
          database: "Google Scholar",
          searchQuery: `"${concepts[0] || "operational management"}" AND "benchmarking" AND "empirical findings"`,
          relevanceTarget: "Operational standards and empirical performance metrics.",
        },
        {
          id: "strat-2",
          database: "ScienceDirect / Scopus",
          searchQuery: `"best practices" AND "performance metrics" AND "policy compliance"`,
          relevanceTarget: "Audited institutional compliance and governance literature.",
        },
        {
          id: "strat-3",
          database: "JSTOR",
          searchQuery: `"SMART recommendations" AND "organizational change implementation"`,
          relevanceTarget: "Change management and implementation frameworks.",
        },
      ];
      outOfScope = [
        "Abstract philosophical conjecture unsupported by empirical organizational data",
        "Unfocused historical chronologies that do not serve the immediate terms of reference",
      ];
      break;

    default: // Standard academic essays
      coreQuestions = [
        {
          id: "q-1",
          question: `What are the primary theoretical arguments and empirical evidence surrounding "${qClean.slice(0, 80)}"?`,
          category: "Theoretical Foundation",
          rationale: "Directly addresses core command verbs and foundational concepts.",
        },
        {
          id: "q-2",
          question: "How do competing scholarly perspectives interpret the central tension or causal mechanism?",
          category: "Dialectical Tension",
          rationale: "Synthesizes rival schools of thought to avoid one-sided descriptive bias.",
        },
        {
          id: "q-3",
          question: "What evidence-grounded thesis best withstands critical counterargument and scrutiny?",
          category: "Critical Synthesis",
          rationale: "Substantiates an academically defensible thesis backed by empirical proof.",
        },
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
        {
          id: "strat-1",
          database: "Google Scholar",
          searchQuery: `"${concepts[0] || "core theory"}" AND "critical evaluation" AND "scholarly debate"`,
          relevanceTarget: "Seminal papers on primary theoretical debates.",
        },
        {
          id: "strat-2",
          database: "JSTOR / Scopus",
          searchQuery: `"${concepts[1] || "empirical evidence"}" AND "theoretical frameworks" AND ${academicLevel}`,
          relevanceTarget: "Empirical studies calibrated to the chosen academic level.",
        },
        {
          id: "strat-3",
          database: "CrossRef / Web of Science",
          searchQuery: `"systematic review" AND "counterarguments" AND "contemporary synthesis"`,
          relevanceTarget: "High-level synthesis and competing dialectical viewpoints.",
        },
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
    isLoading,
  } = useAssignmentWorkspace();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable local state
  const [questions, setQuestions] = useState<CoreResearchQuestion[]>([]);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [debates, setDebates] = useState<string[]>([]);
  const [evidenceTypes, setEvidenceTypes] = useState<string[]>([]);
  const [searchStrategies, setSearchStrategies] = useState<
    RecommendedSearchStrategy[]
  >([]);
  const [outOfScope, setOutOfScope] = useState<string[]>([]);

  // New item inputs
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionCategory, setNewQuestionCategory] =
    useState("Dialectical Tension");
  const [newQuestionRationale, setNewQuestionRationale] = useState("");

  const [newStrategyDb, setNewStrategyDb] = useState("Google Scholar");
  const [newStrategyQuery, setNewStrategyQuery] = useState("");
  const [newStrategyTarget, setNewStrategyTarget] = useState("");

  // Copy feedback state: map strategy id -> boolean
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});

  // Synchronize whenever researchPlan changes (including via Socratic Tutor patch)
  useEffect(() => {
    if (isLoading) return;

    if (researchPlan) {
      setQuestions(
        (researchPlan.coreQuestions || []).map((q, idx) =>
          normalizeQuestion(q, idx)
        )
      );
      setConcepts(researchPlan.mainConcepts || []);
      setDebates(researchPlan.keyDebates || []);
      setEvidenceTypes(researchPlan.evidenceTypesNeeded || []);
      setSearchStrategies(
        (researchPlan.searchStrategies || []).map((s, idx) =>
          normalizeStrategy(s, idx)
        )
      );
      setOutOfScope(researchPlan.outOfScopeTopics || []);
    } else {
      handleGeneratePlan();
    }
  }, [researchPlan, isLoading]);

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await authedJsonFetch(
        `/api/projects/${projectId}/assignment/plan`,
        "POST",
        {
          question,
          academicLevel,
          assignmentType,
          analysis,
        }
      );
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

  const handleCopyQuery = async (id: string, query: string) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopiedMap((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopiedMap((prev) => ({ ...prev, [id]: false }));
      }, 2000);
    } catch {
      // Fallback
      setCopiedMap((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopiedMap((prev) => ({ ...prev, [id]: false }));
      }, 2000);
    }
  };

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;
    const newQ: CoreResearchQuestion = {
      id: `q-${Date.now()}`,
      question: newQuestionText.trim(),
      category: newQuestionCategory.trim() || "Targeted Inquiry",
      rationale:
        newQuestionRationale.trim() ||
        "Custom dialectical question formulated to address assessment criteria.",
    };
    const updated = [...questions, newQ];
    setQuestions(updated);
    setNewQuestionText("");
    setNewQuestionRationale("");
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleUpdateQuestion = (
    id: string,
    field: keyof CoreResearchQuestion,
    value: string
  ) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const handleAddStrategy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStrategyQuery.trim()) return;
    const newStrat: RecommendedSearchStrategy = {
      id: `strat-${Date.now()}`,
      database: newStrategyDb.trim() || "Google Scholar",
      searchQuery: newStrategyQuery.trim(),
      relevanceTarget:
        newStrategyTarget.trim() ||
        "Targeted peer-reviewed research and scholarly evidence.",
    };
    const updated = [...searchStrategies, newStrat];
    setSearchStrategies(updated);
    setNewStrategyQuery("");
    setNewStrategyTarget("");
  };

  const handleRemoveStrategy = (id: string) => {
    setSearchStrategies((prev) => prev.filter((s) => s.id !== id));
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

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8 flex items-center justify-center text-neutral-400 text-sm">
        <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-800 dark:border-white/20 dark:border-t-white rounded-full animate-spin mr-3" />
        Loading Phase 2 Academic Research Plan...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-8 space-y-8 text-neutral-900 dark:text-neutral-100">
      {/* Header Banner matching Phase 1 Card Style */}
      <div className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Plan One · Dialectical Strategy
              </span>
              <span className="text-[10px] font-mono text-neutral-400">
                Phase 2 of 8
              </span>
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white tracking-tight">
              Phase 2: Academic Research Plan
            </h2>
            <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              Dialectical Core Research Questions and Boolean Search Strategies tailored to your brief.
            </p>
          </div>

          <button
            type="button"
            disabled={isGenerating}
            onClick={handleGeneratePlan}
            className="self-start sm:self-center px-3.5 py-1.5 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-100 dark:bg-white/5 text-xs font-medium hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer text-neutral-700 dark:text-neutral-300"
          >
            {isGenerating ? "Regenerating…" : "🔄 Regenerate Plan"}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {isGenerating && !researchPlan ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Formulating dialectical research questions and boolean queries…
            </p>
          </div>
        ) : (
          <div className="space-y-8 pt-2">
            {/* 1. Core Research Questions (Editable Cards) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    Core Research Questions
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 border border-neutral-200/70 dark:border-white/10">
                    {questions.length} Questions
                  </span>
                </div>
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  Editable · Addressed in final draft
                </span>
              </div>

              {/* Question Cards List */}
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.02] hover:border-neutral-300 dark:hover:border-white/20 transition-all space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          Q{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={q.category || ""}
                          onChange={(e) =>
                            handleUpdateQuestion(q.id, "category", e.target.value)
                          }
                          aria-label={`Question ${idx + 1} Category`}
                          placeholder="Category"
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(q.id)}
                        className="text-[11px] text-neutral-400 hover:text-rose-500 transition-colors cursor-pointer px-1.5 py-0.5"
                        title="Remove question"
                      >
                        ✕ Remove
                      </button>
                    </div>

                    <textarea
                      value={q.question}
                      onChange={(e) =>
                        handleUpdateQuestion(q.id, "question", e.target.value)
                      }
                      aria-label={`Question ${idx + 1} Content`}
                      rows={2}
                      className="w-full bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-lg p-2.5 text-xs text-neutral-900 dark:text-neutral-100 font-medium focus:outline-none focus:border-emerald-500/50 transition-all leading-relaxed resize-y"
                    />

                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span className="shrink-0 font-medium text-neutral-400">💡 Rationale:</span>
                      <input
                        type="text"
                        value={q.rationale || ""}
                        onChange={(e) =>
                          handleUpdateQuestion(q.id, "rationale", e.target.value)
                        }
                        aria-label={`Question ${idx + 1} Rationale`}
                        placeholder="Examiner rubric rationale..."
                        className="flex-1 bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-emerald-500/50 text-[11px] text-neutral-600 dark:text-neutral-300 focus:outline-none py-0.5 italic"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Inline Add Question Input Bar */}
              <form
                onSubmit={handleAddQuestion}
                className="p-3.5 rounded-xl border border-dashed border-neutral-300 dark:border-white/15 bg-neutral-50/50 dark:bg-white/[0.01] space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                    placeholder="Add custom research question (e.g. How does the EU AI Act regulate automated decision systems?)..."
                    className="flex-1 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-emerald-500/50"
                  />
                  <select
                    value={newQuestionCategory}
                    onChange={(e) => setNewQuestionCategory(e.target.value)}
                    className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none shrink-0"
                  >
                    <option value="Dialectical Tension">Dialectical Tension</option>
                    <option value="Theoretical Foundation">Theoretical Foundation</option>
                    <option value="Empirical Reality">Empirical Reality</option>
                    <option value="Policy & Synthesis">Policy & Synthesis</option>
                    <option value="Methodological Limits">Methodological Limits</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!newQuestionText.trim()}
                    className="px-3.5 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shrink-0"
                  >
                    + Add Question
                  </button>
                </div>
              </form>
            </div>

            {/* 2. Recommended Search Strategies (Cards with 1-Click Copy) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                    Recommended Search Strategies
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 border border-neutral-200/70 dark:border-white/10">
                    {searchStrategies.length} Queries
                  </span>
                </div>
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  Boolean syntax · Ready for literature discovery
                </span>
              </div>

              {/* Strategy Cards List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {searchStrategies.map((strat, idx) => (
                  <div
                    key={strat.id || idx}
                    className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.02] flex flex-col justify-between gap-2.5 hover:border-neutral-300 dark:hover:border-white/20 transition-all"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          {strat.database || "Database"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStrategy(strat.id)}
                          className="text-[10px] text-neutral-400 hover:text-rose-500 transition-colors cursor-pointer"
                          title="Remove strategy"
                        >
                          ✕ Remove
                        </button>
                      </div>

                      <div className="p-2.5 rounded-lg bg-neutral-100/80 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 font-mono text-[11px] text-neutral-900 dark:text-neutral-200 break-all select-all leading-relaxed">
                        {strat.searchQuery}
                      </div>

                      {strat.relevanceTarget && (
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                          <span className="font-medium text-neutral-600 dark:text-neutral-300">Target:</span>{" "}
                          {strat.relevanceTarget}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyQuery(strat.id, strat.searchQuery)}
                      className="w-full py-1.5 rounded-lg border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] hover:bg-neutral-100 dark:hover:bg-white/10 text-xs font-semibold text-neutral-800 dark:text-neutral-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedMap[strat.id] ? (
                        <>
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <span>📋</span>
                          <span>Copy Search Query</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>

              {/* Inline Add Strategy Input Bar */}
              <form
                onSubmit={handleAddStrategy}
                className="p-3.5 rounded-xl border border-dashed border-neutral-300 dark:border-white/15 bg-neutral-50/50 dark:bg-white/[0.01] space-y-2.5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={newStrategyDb}
                    onChange={(e) => setNewStrategyDb(e.target.value)}
                    className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none"
                  >
                    <option value="Google Scholar">Google Scholar</option>
                    <option value="JSTOR">JSTOR</option>
                    <option value="Scopus">Scopus</option>
                    <option value="CrossRef">CrossRef</option>
                    <option value="PubMed">PubMed</option>
                    <option value="Web of Science">Web of Science</option>
                  </select>

                  <input
                    type="text"
                    value={newStrategyQuery}
                    onChange={(e) => setNewStrategyQuery(e.target.value)}
                    placeholder='Boolean query (e.g. "AI ethics" AND "governance")...'
                    className="sm:col-span-2 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newStrategyTarget}
                    onChange={(e) => setNewStrategyTarget(e.target.value)}
                    placeholder="Relevance target note (e.g. Peer-reviewed empirical case studies 2020-2025)..."
                    className="flex-1 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-blue-500/50"
                  />
                  <button
                    type="submit"
                    disabled={!newStrategyQuery.trim()}
                    className="px-3.5 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shrink-0"
                  >
                    + Add Strategy
                  </button>
                </div>
              </form>
            </div>

            {/* 3. Scholarly Debates & Out-of-Scope Scope Boundaries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.02] space-y-2">
                <h4 className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <span>⚖️</span> Scholarly Debates & Contested Points
                </h4>
                <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1.5 list-disc list-inside">
                  {debates.map((deb, i) => (
                    <li key={i}>{deb}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <span>🚫</span> Out-of-Scope Topics (Do Not Research)
                </h4>
                <ul className="text-xs text-amber-800/80 dark:text-amber-300/80 space-y-1.5 list-disc list-inside">
                  {outOfScope.map((topic, i) => (
                    <li key={i}>{topic}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 4. Primary Approval & Continue Button */}
            <div className="p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  Ready to gather academic literature and evidence?
                </h4>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  Approve your research plan to activate Phase 3: Research & Literature Discovery.
                </p>
              </div>
              <button
                type="button"
                onClick={handleApprove}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs self-start sm:self-center shrink-0"
              >
                Approve Research Plan & Continue →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
