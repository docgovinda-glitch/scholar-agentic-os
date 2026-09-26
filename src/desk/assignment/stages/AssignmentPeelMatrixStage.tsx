import React, { useState, useEffect, useMemo } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type { PeelMatrixData, PeelTheme } from "../types";

export default function AssignmentPeelMatrixStage() {
  const {
    projectId,
    ensurePersisted,
    question,
    assignmentType,
    academicLevel,
    targetWordCount,
    thesisBudget,
    peelMatrix,
    setPeelMatrix,
    advanceStage,
  } = useAssignmentWorkspace();

  const [isLoading, setIsLoading] = useState(false);
  const [draftingThemeId, setDraftingThemeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active theme tab
  const [activeThemeId, setActiveThemeId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"peel_blocks" | "full_draft">("peel_blocks");

  // Local state for PEEL data
  const [localThemes, setLocalThemes] = useState<PeelTheme[]>(
    peelMatrix?.themes || []
  );
  const [introDraft, setIntroDraft] = useState<string>(
    peelMatrix?.introductionDraft || ""
  );
  const [conclusionDraft, setConclusionDraft] = useState<string>(
    peelMatrix?.conclusionDraft || ""
  );

  // Initialize active theme
  useEffect(() => {
    if (localThemes.length > 0 && (!activeThemeId || !localThemes.some((t) => t.id === activeThemeId))) {
      setActiveThemeId(localThemes[0].id);
    }
  }, [localThemes, activeThemeId]);

  // If no PEEL matrix exists, initialize from AI endpoint or thesis budget
  useEffect(() => {
    if (!peelMatrix && (thesisBudget || question)) {
      handleGenerateMatrix();
    }
  }, [peelMatrix, thesisBudget, question]);

  const handleGenerateMatrix = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const realId = await ensurePersisted();
      const res = await authedJsonFetch(
        `/api/projects/${realId}/assignment/peel-matrix`,
        "POST",
        {
          question,
          assignmentType,
          academicLevel,
          targetWordCount,
          thesis: thesisBudget?.selectedThesis,
          sections: thesisBudget?.sections,
        }
      );
      if (!res.ok) throw new Error("Failed to generate PEEL argument matrix");
      const data: PeelMatrixData = await res.json();
      setLocalThemes(data.themes || []);
      setIntroDraft(data.introductionDraft || "");
      setConclusionDraft(data.conclusionDraft || "");
      if (data.themes?.[0]) {
        setActiveThemeId(data.themes[0].id);
      }
      await setPeelMatrix(data);
    } catch (err: any) {
      setError(err.message || "Failed to generate PEEL matrix.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleThemeFieldChange = (
    themeId: string,
    field: keyof PeelTheme,
    val: string
  ) => {
    const updated = localThemes.map((t) => {
      if (t.id === themeId) {
        const themeCopy = { ...t, [field]: val };
        // compute theme words
        const allText = `${themeCopy.point || ""} ${themeCopy.evidence || ""} ${themeCopy.explanation || ""} ${themeCopy.counterargument || ""} ${themeCopy.rebuttal || ""} ${themeCopy.link || ""}`;
        const words = allText.trim() ? allText.trim().split(/\s+/).filter(Boolean).length : 0;
        return { ...themeCopy, currentWords: words, currentWordCount: words };
      }
      return t;
    });
    setLocalThemes(updated);
  };

  const handleSynthesizeThemeDraft = async (theme: PeelTheme) => {
    setDraftingThemeId(theme.id);
    try {
      const realId = await ensurePersisted();
      const themeWordsTarget = theme.targetWords || theme.targetWordCount || 350;
      const prompt = `Synthesize a rigorous, first-class academic paragraph based on this PEEL scaffolding:
Point: ${theme.point}
Evidence: ${theme.evidence}
Explanation: ${theme.explanation}
Counter-Argument: ${theme.counterargument}
Rebuttal: ${theme.rebuttal}
Link: ${theme.link}
Target word count: ${themeWordsTarget} words. Write high-standard prose with scholarly tone.`;

      const res = await authedJsonFetch(
        `/api/projects/${realId}/assignment/tutor-chat`,
        "POST",
        {
          message: prompt,
          mode: "prose",
          stage: "peel_matrix",
          academicLevel,
          assignmentType,
          question,
          targetWordCount: themeWordsTarget,
        }
      );
      if (!res.ok) throw new Error("Failed to synthesize theme draft");
      const data = await res.json();
      const draftedText = data.reply || "";

      const updated = localThemes.map((t) => {
        if (t.id === theme.id) {
          const words = draftedText.trim().split(/\s+/).filter(Boolean).length;
          return { ...t, draftContent: draftedText, currentWords: words, currentWordCount: words };
        }
        return t;
      });
      setLocalThemes(updated);
      await saveState(updated, introDraft, conclusionDraft);
    } catch (err: any) {
      alert(`Synthesis error: ${err.message}`);
    } finally {
      setDraftingThemeId(null);
    }
  };

  const saveState = async (
    themesToSave: PeelTheme[],
    intro: string,
    conclusion: string
  ) => {
    const totalWords =
      themesToSave.reduce((sum, t) => sum + (t.currentWords || t.currentWordCount || 0), 0) +
      (intro.trim() ? intro.trim().split(/\s+/).filter(Boolean).length : 0) +
      (conclusion.trim() ? conclusion.trim().split(/\s+/).filter(Boolean).length : 0);

    const payload: PeelMatrixData = {
      themes: themesToSave,
      introductionDraft: intro,
      conclusionDraft: conclusion,
      totalWordCount: totalWords,
    };
    await setPeelMatrix(payload);
  };

  // Word count totals
  const totalMatrixWords = useMemo(() => {
    const themeWords = localThemes.reduce((sum, t) => {
      const text = t.draftContent || `${t.point || ""} ${t.evidence || ""} ${t.explanation || ""} ${t.counterargument || ""} ${t.rebuttal || ""} ${t.link || ""}`;
      return sum + (text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0);
    }, 0);
    const introW = introDraft.trim() ? introDraft.trim().split(/\s+/).filter(Boolean).length : 0;
    const concW = conclusionDraft.trim() ? conclusionDraft.trim().split(/\s+/).filter(Boolean).length : 0;
    return themeWords + introW + concW;
  }, [localThemes, introDraft, conclusionDraft]);

  const activeTheme = localThemes.find((t) => t.id === activeThemeId) || localThemes[0];

  const handleSaveAndAdvance = async () => {
    await saveState(localThemes, introDraft, conclusionDraft);
    advanceStage("citations");
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 text-neutral-900 dark:text-neutral-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-neutral-200/80 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 mb-2">
            <span>Stage 03 • PEEL Argument Matrix</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Dialectical PEEL Argument Scaffolding
          </h1>
          <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
            Build First-Class body themes with Point, Evidence, Explanation, Counterargument, and Link blocks.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGenerateMatrix}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-white/15 transition-all cursor-pointer flex items-center gap-2"
          >
            {isLoading ? "Generating..." : "⚡ Scaffold AI Matrix"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Word Count Overview Strip */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Total PEEL Matrix Draft Words:
          </span>
          <span className="text-sm font-mono font-bold">
            {totalMatrixWords.toLocaleString()} / {targetWordCount.toLocaleString()}
          </span>
          <span className="text-xs font-mono text-neutral-400">
            ({Math.min(100, Math.round((totalMatrixWords / (targetWordCount || 1)) * 100))}%)
          </span>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10">
          <button
            type="button"
            onClick={() => setViewMode("peel_blocks")}
            className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              viewMode === "peel_blocks"
                ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white font-semibold shadow-xs"
                : "text-neutral-600 dark:text-neutral-400"
            }`}
          >
            PEEL Blocks Matrix
          </button>
          <button
            type="button"
            onClick={() => setViewMode("full_draft")}
            className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              viewMode === "full_draft"
                ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white font-semibold shadow-xs"
                : "text-neutral-600 dark:text-neutral-400"
            }`}
          >
            Draft Prose View
          </button>
        </div>
      </div>

      {/* Theme Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {localThemes.map((theme, idx) => {
          const isActive = activeThemeId === theme.id;
          const words = theme.draftContent
            ? theme.draftContent.trim().split(/\s+/).filter(Boolean).length
            : `${theme.point} ${theme.evidence} ${theme.explanation} ${theme.counterargument} ${theme.rebuttal} ${theme.link}`
                .trim()
                .split(/\s+/)
                .filter(Boolean).length;

          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setActiveThemeId(theme.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition-all flex items-center gap-2 border ${
                isActive
                  ? "bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white border-neutral-300 dark:border-white/20 shadow-xs"
                  : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border-transparent hover:bg-neutral-200/60 dark:hover:bg-white/10"
              }`}
            >
              <span className="w-5 h-5 rounded-md bg-neutral-200 dark:bg-white/10 flex items-center justify-center text-[10px] font-mono">
                0{idx + 1}
              </span>
              <span className="max-w-[160px] truncate">{theme.themeTitle}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-white/5 text-neutral-500">
                {words}w
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Theme Editor */}
      {activeTheme && (
        <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Theme Scaffold
                </span>
                <span className="text-xs text-neutral-400">•</span>
                <span className="text-xs font-mono text-neutral-500">
                  Budget: {activeTheme.targetWords || activeTheme.targetWordCount || 350} words
                </span>
              </div>
              <input
                type="text"
                value={activeTheme.themeTitle}
                onChange={(e) => handleThemeFieldChange(activeTheme.id, "themeTitle", e.target.value)}
                className="text-lg font-bold bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-neutral-500 focus:outline-none mt-1 w-full"
              />
            </div>

            <button
              type="button"
              onClick={() => handleSynthesizeThemeDraft(activeTheme)}
              disabled={draftingThemeId === activeTheme.id}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 cursor-pointer shrink-0 transition-all flex items-center gap-1.5 shadow-xs"
            >
              {draftingThemeId === activeTheme.id ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Drafting Prose...</span>
                </>
              ) : (
                <>
                  <span>✍️ Synthesize Full Draft Prose</span>
                </>
              )}
            </button>
          </div>

          {viewMode === "peel_blocks" ? (
            <div className="space-y-5">
              {/* Point */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  P — Point (Topic Claim & Thesis Alignment)
                </label>
                <textarea
                  value={activeTheme.point}
                  onChange={(e) => handleThemeFieldChange(activeTheme.id, "point", e.target.value)}
                  rows={2}
                  placeholder="State the central argumentative claim of this section clearly..."
                  className="w-full text-xs sm:text-sm p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:border-neutral-400 dark:focus:border-white/30 focus:outline-none transition-all"
                />
              </div>

              {/* Evidence */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  E — Evidence (Empirical Findings & Scholarly Citations)
                </label>
                <textarea
                  value={activeTheme.evidence}
                  onChange={(e) => handleThemeFieldChange(activeTheme.id, "evidence", e.target.value)}
                  rows={3}
                  placeholder="Provide supporting empirical evidence, statistical data, and peer-reviewed citations..."
                  className="w-full text-xs sm:text-sm p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:border-neutral-400 dark:focus:border-white/30 focus:outline-none transition-all"
                />
              </div>

              {/* Explanation */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  E — Explanation & Critical Analysis (Unpack the Mechanism)
                </label>
                <textarea
                  value={activeTheme.explanation}
                  onChange={(e) => handleThemeFieldChange(activeTheme.id, "explanation", e.target.value)}
                  rows={3}
                  placeholder="Explain why this evidence supports your point and critically evaluate methodological limitations..."
                  className="w-full text-xs sm:text-sm p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:border-neutral-400 dark:focus:border-white/30 focus:outline-none transition-all"
                />
              </div>

              {/* Dialectical Counter-Argument & Rebuttal (2-Column First Class Feature) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    ★ Counter-Argument (Opposing Scholarly View)
                  </label>
                  <textarea
                    value={activeTheme.counterargument}
                    onChange={(e) => handleThemeFieldChange(activeTheme.id, "counterargument", e.target.value)}
                    rows={3}
                    placeholder="What would an opposing theorist or dissenting school argue against this point?"
                    className="w-full text-xs p-3 rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    ★ Rebuttal / Nuance (Synthesis)
                  </label>
                  <textarea
                    value={activeTheme.rebuttal}
                    onChange={(e) => handleThemeFieldChange(activeTheme.id, "rebuttal", e.target.value)}
                    rows={3}
                    placeholder="How do you rebut or nuance their claim to uphold your central thesis?"
                    className="w-full text-xs p-3 rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 focus:outline-none"
                  />
                </div>
              </div>

              {/* Link */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  L — Link (Synthesis Back to Thesis & Transition)
                </label>
                <textarea
                  value={activeTheme.link}
                  onChange={(e) => handleThemeFieldChange(activeTheme.id, "link", e.target.value)}
                  rows={2}
                  placeholder="Connect this analysis back to the core question and segue smoothly to the next theme..."
                  className="w-full text-xs sm:text-sm p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:border-neutral-400 dark:focus:border-white/30 focus:outline-none transition-all"
                />
              </div>
            </div>
          ) : (
            /* Full Prose Draft View */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Academic Prose Output</span>
                <span>
                  {activeTheme.draftContent
                    ? `${activeTheme.draftContent.trim().split(/\s+/).filter(Boolean).length} words`
                    : "Not yet drafted"}
                </span>
              </div>
              <textarea
                value={activeTheme.draftContent || ""}
                onChange={(e) => handleThemeFieldChange(activeTheme.id, "draftContent", e.target.value)}
                rows={12}
                placeholder="Drafted academic prose for this theme will appear here. You can also write or edit directly..."
                className="w-full text-sm leading-relaxed p-4 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:border-neutral-400 dark:focus:border-white/30 focus:outline-none transition-all font-serif"
              />
            </div>
          )}
        </div>
      )}

      {/* Introduction & Conclusion Accordion */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Introduction Framing (~10%)
            </h2>
            <span className="text-xs font-mono text-neutral-400">
              {introDraft.trim() ? introDraft.trim().split(/\s+/).filter(Boolean).length : 0}w
            </span>
          </div>
          <textarea
            value={introDraft}
            onChange={(e) => setIntroDraft(e.target.value)}
            rows={5}
            placeholder="Context hook, scope definition, central thesis statement, and road map..."
            className="w-full text-xs p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:outline-none"
          />
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              Conclusion Synthesis (~10%)
            </h2>
            <span className="text-xs font-mono text-neutral-400">
              {conclusionDraft.trim() ? conclusionDraft.trim().split(/\s+/).filter(Boolean).length : 0}w
            </span>
          </div>
          <textarea
            value={conclusionDraft}
            onChange={(e) => setConclusionDraft(e.target.value)}
            rows={5}
            placeholder="Re-statement of thesis, synthesis of main dialectical insights, broader implications..."
            className="w-full text-xs p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:outline-none"
          />
        </div>
      </div>

      {/* Footer / Advance */}
      <div className="p-6 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-base font-bold">Lock PEEL Matrix & Progress</h2>
          <p className="text-xs text-neutral-300 dark:text-neutral-600 mt-0.5">
            Advance to Stage 4 to ground claims with verified peer-reviewed citations and reference entries.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveAndAdvance}
          className="px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer shrink-0 shadow-xs flex items-center gap-2"
        >
          <span>Continue to Academic Grounding</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
