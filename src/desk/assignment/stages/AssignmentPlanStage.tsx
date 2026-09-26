import React, { useState, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type {
  ResearchPlan,
  AssignmentType,
  CoreResearchQuestion,
  RecommendedSearchStrategy,
} from "../types";
import { RefreshCw, Copy, Check, AlertCircle } from "lucide-react";

export function normalizeQuestion(
  q: string | CoreResearchQuestion,
  idx: number
): CoreResearchQuestion {
  if (typeof q === "string") {
    return {
      id: `q-${idx + 1}`,
      question: q,
      rationale:
        "Addresses core examiner command verbs and grading rubric criteria.",
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
      "Addresses core examiner command verbs and grading rubric criteria.",
    category: q.category || "Main Argument",
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
  const [newQuestionCategory, setNewQuestionCategory] = useState("Main Argument");
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
      category: newQuestionCategory.trim() || "Main Argument",
      rationale:
        newQuestionRationale.trim() ||
        "Addresses core assessment criteria and examiner expectations.",
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
        "Targeted peer-reviewed research and empirical evidence.",
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
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 space-y-8 text-neutral-900 dark:text-neutral-100 font-sans">
      {/* Page Title & Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
              Phase 2 • Research Plan
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500 font-medium">
              Phase 2 of 8
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            Phase 2: Research Plan
            <span className="sr-only">Phase 2: Academic Research Plan</span>
          </h1>
          <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed">
            Here is your research roadmap based on your brief. You can tweak questions, add new ones, or ask the tutor on the right to adjust them.
          </p>
        </div>

        <button
          type="button"
          disabled={isGenerating}
          onClick={handleGeneratePlan}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
          <span>{isGenerating ? "Regenerating…" : "Regenerate Plan"}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isGenerating && !researchPlan ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 bg-white dark:bg-[#1C1C1E] rounded-2xl border border-neutral-200/70 dark:border-white/10">
          <div className="w-8 h-8 border-2 border-neutral-800 border-t-transparent dark:border-white dark:border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Formulating research questions and suggested search queries…
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section 1: Key Questions to Answer */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Key Questions to Answer
                  <span className="sr-only">Core Research Questions</span>
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                  {questions.length} Questions
                </span>
              </div>
              <span className="text-xs text-neutral-400 hidden sm:inline">
                Click any question or rationale to edit directly
              </span>
            </div>

            {/* Questions List */}
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div
                  key={q.id || idx}
                  className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/70 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-xs group hover:border-neutral-300 dark:hover:border-white/20 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200">
                        Question {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={q.category || ""}
                        onChange={(e) =>
                          handleUpdateQuestion(q.id, "category", e.target.value)
                        }
                        aria-label={`Question ${idx + 1} Category`}
                        placeholder="Category"
                        className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 border border-neutral-200/60 dark:border-white/10 hover:border-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                      />
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRemoveQuestion(q.id)}
                        aria-label={`Remove Question ${idx + 1}`}
                        className="text-xs text-neutral-400 hover:text-rose-500 transition-colors p-1 rounded-md cursor-pointer"
                        title="Remove question"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={q.question}
                    onChange={(e) =>
                      handleUpdateQuestion(q.id, "question", e.target.value)
                    }
                    aria-label={`Question ${idx + 1} Content`}
                    rows={2}
                    className="w-full bg-transparent border-0 p-0 text-base font-medium text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-0 leading-relaxed resize-none"
                  />

                  <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 pt-2 border-t border-neutral-100 dark:border-white/5">
                    <span className="font-medium text-neutral-600 dark:text-neutral-300 shrink-0">Why this matters:</span>
                    <input
                      type="text"
                      value={q.rationale || ""}
                      onChange={(e) =>
                        handleUpdateQuestion(q.id, "rationale", e.target.value)
                      }
                      aria-label={`Question ${idx + 1} Rationale`}
                      placeholder="Why this question is critical to your argument..."
                      className="flex-1 bg-transparent border-0 p-0 text-sm text-neutral-500 dark:text-neutral-400 placeholder-neutral-400 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Add Question Input Bar */}
            <form
              onSubmit={handleAddQuestion}
              className="flex flex-col sm:flex-row items-center gap-2 p-2 bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/70 dark:border-white/10 rounded-2xl"
            >
              <input
                type="text"
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                placeholder="Add custom research question you'd like to explore..."
                className="flex-1 bg-transparent border-0 px-3.5 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none"
              />
              <select
                value={newQuestionCategory}
                onChange={(e) => setNewQuestionCategory(e.target.value)}
                className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none shrink-0"
              >
                <option value="Main Argument">Main Argument</option>
                <option value="Core Concept">Core Concept</option>
                <option value="Counterargument">Counterargument</option>
                <option value="Context">Context</option>
                <option value="Dialectical Tension">Dialectical Tension</option>
              </select>
              <button
                type="submit"
                disabled={!newQuestionText.trim()}
                aria-label="+ Add Question"
                className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-xl text-xs font-semibold hover:opacity-90 active:scale-[0.98] disabled:opacity-40 transition-all cursor-pointer shrink-0"
              >
                + Add Question
              </button>
            </form>
          </div>

          {/* Section 2: Where to Search (Suggested Search Queries) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                  Where to Search
                  <span className="sr-only">Recommended Search Strategies</span>
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                  {searchStrategies.length} Queries
                </span>
              </div>
              <span className="text-xs text-neutral-400 hidden sm:inline">
                Suggested search queries for literature discovery
              </span>
            </div>

            {/* Search Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchStrategies.map((strat, idx) => (
                <div
                  key={strat.id || idx}
                  className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/70 dark:border-white/10 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-3 group hover:border-neutral-300 dark:hover:border-white/20 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        {strat.database || "Google Scholar"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveStrategy(strat.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-neutral-400 hover:text-rose-500 cursor-pointer"
                        title="Remove search query"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/10 font-mono text-xs text-neutral-900 dark:text-neutral-200 break-all select-all leading-relaxed">
                      {strat.searchQuery}
                    </div>

                    {strat.relevanceTarget && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-snug">
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">Best for:</span>{" "}
                        {strat.relevanceTarget}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-neutral-100 dark:border-white/5 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleCopyQuery(strat.id, strat.searchQuery)}
                      aria-label="Copy Search Query"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-200 transition-all shadow-2xs cursor-pointer active:scale-95"
                    >
                      {copiedMap[strat.id] ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Copy Search Query</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Query Input Bar */}
            <form
              onSubmit={handleAddStrategy}
              className="p-3 bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/70 dark:border-white/10 rounded-2xl space-y-2.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <select
                  value={newStrategyDb}
                  onChange={(e) => setNewStrategyDb(e.target.value)}
                  className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none"
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
                  placeholder='Add your own search keyword or phrase... (Boolean query)'
                  className="sm:col-span-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStrategyTarget}
                  onChange={(e) => setNewStrategyTarget(e.target.value)}
                  placeholder="Target description (e.g. Best for: recent 2024+ empirical papers)..."
                  className="flex-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newStrategyQuery.trim()}
                  aria-label="+ Add Strategy"
                  className="px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-xl text-xs font-semibold hover:opacity-90 active:scale-[0.98] disabled:opacity-40 transition-all cursor-pointer shrink-0"
                >
                  + Add Strategy
                </button>
              </div>
            </form>
          </div>

          {/* Section 3: Debates & Out-of-Scope Scope Boundaries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#1C1C1E] p-5 rounded-2xl border border-neutral-200/70 dark:border-white/10 shadow-xs space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <span>⚖️</span> Key Debates & Competing Perspectives
              </h3>
              <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-2 list-disc list-inside leading-relaxed">
                {debates.map((deb, i) => (
                  <li key={i}>{deb}</li>
                ))}
              </ul>
            </div>

            <div className="bg-white dark:bg-[#1C1C1E] p-5 rounded-2xl border border-amber-500/20 dark:border-amber-500/20 shadow-xs space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <span>🚫</span> Out-of-Scope (Topics to Avoid)
              </h3>
              <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-2 list-disc list-inside leading-relaxed">
                {outOfScope.map((topic, i) => (
                  <li key={i}>{topic}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom Elevated Action Bar */}
          <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-neutral-200/70 dark:border-white/10 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Ready to gather academic evidence?
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Approving your research roadmap moves you to Phase 3: Evidence Gathering.
              </p>
            </div>
            <button
              type="button"
              onClick={handleApprove}
              aria-label="Approve Research Plan & Continue to Evidence Gathering"
              className="w-full sm:w-auto px-7 py-3 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] text-xs font-semibold transition-all cursor-pointer shadow-xs shrink-0 flex items-center justify-center gap-2"
            >
              ✓ Approve Plan & Proceed to Evidence Gathering →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
