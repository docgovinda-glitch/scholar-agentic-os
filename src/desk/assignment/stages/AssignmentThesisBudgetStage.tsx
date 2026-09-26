import React, { useState, useEffect, useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type {
  ThesisAndWordBudget,
  ThesisOption,
  WordBudgetSection,
} from "../types";

export default function AssignmentThesisBudgetStage() {
  const {
    projectId,
    ensurePersisted,
    question,
    assignmentType,
    academicLevel,
    targetWordCount,
    deconstruction,
    thesisBudget,
    setThesisBudget,
    advanceStage,
  } = useAssignmentWorkspace();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local state for thesis
  const [selectedThesisId, setSelectedThesisId] = useState<string>(
    thesisBudget?.selectedThesis ? "selected" : "synthesis"
  );
  const [customThesis, setCustomThesis] = useState<string>(
    thesisBudget?.selectedThesis || ""
  );
  const [thesisOptions, setThesisOptions] = useState<ThesisOption[]>(
    thesisBudget?.thesisOptions || []
  );

  // Local state for sections
  const [sections, setSections] = useState<WordBudgetSection[]>(
    thesisBudget?.sections || []
  );

  // If no thesis budget exists, automatically fetch from AI endpoint
  useEffect(() => {
    if (!thesisBudget && question) {
      handleGenerateBudget();
    }
  }, [thesisBudget, question]);

  const handleGenerateBudget = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const realId = await ensurePersisted();
      const res = await authedJsonFetch(
        `/api/projects/${realId}/assignment/thesis-budget`,
        "POST",
        {
          question,
          assignmentType,
          academicLevel,
          targetWordCount,
          deconstruction,
        }
      );
      if (!res.ok) throw new Error("Failed to formulate thesis and word budget");
      const data: ThesisAndWordBudget = await res.json();
      const optList: ThesisOption[] = data.thesisOptions || [];
      setThesisOptions(optList);
      setSections(data.sections || []);
      if (data.selectedThesis) {
        setCustomThesis(data.selectedThesis);
        const matched = optList.find((o: ThesisOption) => o.statement === data.selectedThesis);
        setSelectedThesisId(matched ? matched.id : "custom");
      }
      await setThesisBudget(data);
    } catch (err: any) {
      setError(err.message || "Failed to formulate thesis and word budget.");
    } finally {
      setIsLoading(false);
    }
  };

  // Live mathematical budget calculations
  const totalAllocated = useMemo(() => {
    return sections.reduce((sum, s) => sum + (Number(s.targetWordCount) || 0), 0);
  }, [sections]);

  const budgetDelta = totalAllocated - targetWordCount;
  const isBudgetExact = budgetDelta === 0;
  const isBudgetAcceptable = Math.abs(budgetDelta) <= Math.max(50, targetWordCount * 0.05);

  const handleSelectOption = (opt: ThesisOption) => {
    setSelectedThesisId(opt.id);
    setCustomThesis(opt.statement);
  };

  const handleSectionTargetChange = (sectionId: string, val: number) => {
    const updated = sections.map((s) => {
      if (s.id === sectionId) {
        const newTarget = Math.max(50, val);
        const percent = targetWordCount > 0 ? Math.round((newTarget / targetWordCount) * 100) : 0;
        return { ...s, targetWordCount: newTarget, targetPercent: percent };
      }
      return s;
    });
    setSections(updated);
  };

  const handleAutoRebalance = () => {
    if (sections.length === 0 || targetWordCount <= 0) return;
    // Standard academic formula: Intro ~10%, Conclusion ~10%, Body themes divided equally ~80%
    const introCount = Math.round(targetWordCount * 0.1);
    const conclusionCount = Math.round(targetWordCount * 0.1);
    const bodyTotal = targetWordCount - introCount - conclusionCount;
    const bodySections = sections.filter((s) => s.type === "body_theme");
    const countPerBody = bodySections.length > 0 ? Math.round(bodyTotal / bodySections.length) : bodyTotal;

    const rebalanced = sections.map((s) => {
      if (s.type === "introduction") {
        return { ...s, targetWordCount: introCount, targetPercent: 10 };
      }
      if (s.type === "conclusion") {
        return { ...s, targetWordCount: conclusionCount, targetPercent: 10 };
      }
      const pct = Math.round((countPerBody / targetWordCount) * 100);
      return { ...s, targetWordCount: countPerBody, targetPercent: pct };
    });

    setSections(rebalanced);
  };

  const handleAddTheme = () => {
    const themeIndex = sections.filter((s) => s.type === "body_theme").length + 1;
    const newTheme: WordBudgetSection = {
      id: `theme-${Date.now()}`,
      title: `Theme ${themeIndex}: New Argumentative Dimension`,
      type: "body_theme",
      targetWordCount: Math.round(targetWordCount * 0.2),
      currentWordCount: 0,
      targetPercent: 20,
      guidance: "Develop dialectical analysis with empirical evidence and counter-perspectives.",
      keyPoints: ["Central claim", "Theoretical grounding", "Counterargument"],
    };

    // Insert before conclusion
    const conclusionIdx = sections.findIndex((s) => s.type === "conclusion");
    if (conclusionIdx >= 0) {
      const copy = [...sections];
      copy.splice(conclusionIdx, 0, newTheme);
      setSections(copy);
    } else {
      setSections([...sections, newTheme]);
    }
  };

  const handleRemoveTheme = (id: string) => {
    setSections(sections.filter((s) => s.id !== id));
  };

  const handleSaveAndAdvance = async () => {
    const payload: ThesisAndWordBudget = {
      thesisOptions,
      selectedThesis: customThesis,
      totalTargetWords: targetWordCount,
      sections,
    };
    await setThesisBudget(payload);
    advanceStage("peel_matrix");
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 text-neutral-900 dark:text-neutral-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-neutral-200/80 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 mb-2">
            <span>Stage 02 • Thesis & Word Budget</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Thesis Formulation & Mathematical Word Budgeting
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            Establish a defensible argumentative stance and mathematically allocate target word counts.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerateBudget}
          disabled={isLoading}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-white/15 transition-all cursor-pointer flex items-center gap-2 shrink-0"
        >
          {isLoading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Regenerating...</span>
            </>
          ) : (
            <>
              <span>⚡ Regenerate AI Suggestions</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Part 1: Dialectical Thesis Selection */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-5">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/10 pb-3">
          <div>
            <h2 className="text-base font-semibold">1. Argumentative Thesis Statement</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              First-class essays require a distinct, contestable academic thesis rather than descriptive summaries.
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400">
            {assignmentType.replace(/_/g, " ").toUpperCase()}
          </span>
        </div>

        {/* 3 Thesis Options */}
        {thesisOptions.length > 0 && (
          <div className="grid grid-cols-1 gap-3">
            {thesisOptions.map((opt) => {
              const isSelected = selectedThesisId === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => handleSelectOption(opt)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? "border-neutral-900 dark:border-white bg-[#F8F9FA] dark:bg-[#2C2C2E] shadow-xs"
                      : "border-neutral-200/80 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 bg-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-200 dark:bg-white/10 text-neutral-800 dark:text-neutral-200">
                      {opt.direction || opt.stance || "Thesis Option"}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                      Stance: {opt.argumentativeStance || opt.stance || opt.rationale}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    "{opt.statement}"
                  </p>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                    Rationale: {opt.rationale}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Custom / Editable Active Thesis Field */}
        <div className="space-y-1.5 pt-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
            Active Thesis Statement (Click to customize or edit)
          </label>
          <textarea
            value={customThesis}
            onChange={(e) => {
              setCustomThesis(e.target.value);
              setSelectedThesisId("custom");
            }}
            rows={3}
            placeholder="Type or refine your central argumentative claim here..."
            className="w-full text-xs sm:text-sm p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:border-neutral-400 dark:focus:border-white/30 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Part 2: Mathematical Word Budgeting */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-white/10 pb-4">
          <div>
            <h2 className="text-base font-semibold">2. Mathematical Section Word Budget</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Standard academic architecture: Introduction (~10%), Body Themes (~75–80%), Conclusion (~10–15%).
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleAutoRebalance}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
            >
              ⚖️ Auto-Rebalance (10 / 80 / 10)
            </button>
            <button
              type="button"
              onClick={handleAddTheme}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 cursor-pointer"
            >
              + Add Theme
            </button>
          </div>
        </div>

        {/* Budget Health Bar */}
        <div className="p-4 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
              Total Word Count Allocation:
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm">
                {totalAllocated.toLocaleString()} / {targetWordCount.toLocaleString()} words
              </span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                  isBudgetExact
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : isBudgetAcceptable
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-red-500/15 text-red-600 dark:text-red-400"
                }`}
              >
                {isBudgetExact
                  ? "Exact Match"
                  : budgetDelta > 0
                  ? `+${budgetDelta} words over`
                  : `${budgetDelta} words under`}
              </span>
            </div>
          </div>

          {/* Visual Percentage Breakdown Bar */}
          <div className="w-full h-3 bg-neutral-200 dark:bg-white/10 rounded-full overflow-hidden flex">
            {sections.map((sec, idx) => {
              const pct = targetWordCount > 0 ? (sec.targetWordCount / targetWordCount) * 100 : 0;
              const colors = [
                "bg-blue-500",
                "bg-indigo-500",
                "bg-emerald-500",
                "bg-teal-500",
                "bg-amber-500",
                "bg-purple-500",
              ];
              const color = colors[idx % colors.length];
              return (
                <div
                  key={sec.id}
                  style={{ width: `${pct}%` }}
                  title={`${sec.title}: ${sec.targetWordCount} words (${Math.round(pct)}%)`}
                  className={`${color} h-full border-r border-white/20 dark:border-black/20 transition-all`}
                />
              );
            })}
          </div>
        </div>

        {/* Section List & Budget Controls */}
        <div className="space-y-4">
          {sections.map((section, index) => {
            const isTheme = section.type === "body_theme";
            return (
              <div
                key={section.id}
                className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-neutral-100 dark:bg-white/10 flex items-center justify-center text-xs font-mono font-bold text-neutral-600 dark:text-neutral-400">
                      0{index + 1}
                    </span>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSections(sections.map((s) => (s.id === section.id ? { ...s, title: val } : s)));
                      }}
                      className="text-xs sm:text-sm font-semibold bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-neutral-500 focus:outline-none py-0.5 px-1 rounded"
                    />
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/5 text-neutral-500">
                      {section.type.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={50}
                        max={10000}
                        step={25}
                        value={section.targetWordCount}
                        onChange={(e) => handleSectionTargetChange(section.id, Number(e.target.value))}
                        className="w-20 text-xs font-mono font-semibold p-1.5 rounded-lg bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 text-right tabular-nums focus:outline-none"
                      />
                      <span className="text-xs text-neutral-500">words</span>
                      <span className="text-xs font-mono text-neutral-400 ml-1">
                        ({Math.round((section.targetWordCount / (targetWordCount || 1)) * 100)}%)
                      </span>
                    </div>

                    {isTheme && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTheme(section.id)}
                        className="text-xs text-red-500 hover:text-red-700 p-1 cursor-pointer"
                        title="Delete this theme"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  {section.guidance}
                </p>

                {section.keyPoints && section.keyPoints.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {section.keyPoints.map((kp, kidx) => (
                      <span
                        key={kidx}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-[#F8F9FA] dark:bg-[#2C2C2E] text-neutral-600 dark:text-neutral-300 border border-neutral-200/60 dark:border-white/5"
                      >
                        • {kp}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Advance Action Footer */}
      <div className="p-6 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-base font-bold">Lock Thesis & Budget</h2>
          <p className="text-xs text-neutral-300 dark:text-neutral-600 mt-0.5">
            Proceed to Stage 3 to scaffold your arguments into the Point-Evidence-Explanation-Link (PEEL) matrix.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveAndAdvance}
          disabled={!customThesis.trim() || sections.length === 0}
          className="px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 transition-all cursor-pointer shrink-0 shadow-xs flex items-center gap-2"
        >
          <span>Save & Advance to PEEL Matrix</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
