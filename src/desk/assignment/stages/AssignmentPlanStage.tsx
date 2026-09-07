import React, { useState, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type { ResearchPlan } from "../types";

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
      if (!res.ok) throw new Error("Failed to generate research plan");
      const data: ResearchPlan = await res.json();
      await setResearchPlan(data);
    } catch (err: any) {
      setError(err.message || "Failed to generate research plan");
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
