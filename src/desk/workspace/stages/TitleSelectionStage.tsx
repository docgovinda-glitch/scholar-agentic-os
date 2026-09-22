import React, { useState, useEffect, useMemo } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { saveIntakeAnswers, executeAgenticLLM } from "../../api";
import {
  buildTitlePrompts,
  buildTitlePolishPrompt,
  generateLocalTitleFallback,
  type TitleItem,
} from "../agentPrompts/titlePrompts";
import { parseJsonFromLlm } from "../../../utils/jsonParser";
import { AllAiResourcesExhaustedModal } from "../../aiAccess/AllAiResourcesExhaustedModal";
import { executeTitleLockAndProceed } from "../titleLockContract";
import { useOptionalResearchWorkspace } from "../ResearchContext";

export default function TitleSelectionStage({
  stage,
  projectId,
  project: propProject,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project?: ProjectView;
  onSaved?: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const workspace = useOptionalResearchWorkspace();
  const project = propProject || workspace?.project;
  const setProject = onSaved || workspace?.setProject || (() => {});

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [results, setResults] = useState<TitleItem[] | null>(() => {
    if (project?.answers?.["generated_titles"]) {
      try {
        const parsed = JSON.parse(project.answers["generated_titles"]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return null;
  });

  const [error, setError] = useState<string | null>(null);
  const [exhaustedReason, setExhaustedReason] = useState<string | null>(null);
  const [showExhaustedModal, setShowExhaustedModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isTitleLocked = project?.answers?.["title_locked"] === "true";
  const [selectedTitleText, setSelectedTitleText] = useState(project?.answers?.["working_title"] || "");
  const [customTitleInput, setCustomTitleInput] = useState("");
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Extract grounding context from Stage 1 & Stage 4
  const anchorGapTitle =
    project?.answers?.["selected_gap_title"] ||
    project?.answers?.["anchor_gap_id"] ||
    project?.answers?.["selected_gap"] ||
    "";

  const targetJournal =
    project?.answers?.["target_journal"] ||
    project?.answers?.["journal"] ||
    "";

  const supportingGapsCount = useMemo(() => {
    try {
      const raw = project?.answers?.["selected_gaps"];
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length > 1) return parsed.length - 1;
    } catch (_) {}
    return 0;
  }, [project?.answers]);

  useEffect(() => {
    if (project?.answers?.["working_title"] && !selectedTitleText) {
      setSelectedTitleText(project.answers["working_title"]);
    }
  }, [project?.answers?.["working_title"]]);

  // Word and character metrics
  const titleMetrics = useMemo(() => {
    const text = selectedTitleText.trim();
    const wordCount = text ? text.split(/\s+/).length : 0;
    const charCount = text.length;
    // Ideal scholarly indexing: 10–15 words, < 100 characters
    const isWordOptimal = wordCount >= 8 && wordCount <= 18;
    const isLengthOptimal = charCount > 0 && charCount <= 120;
    return { wordCount, charCount, isWordOptimal, isLengthOptimal };
  }, [selectedTitleText]);

  const startTitleGeneration = async (customDirective?: string) => {
    setIsProcessing(true);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `> title.generate() — synthesizing anchored research gap & domain archetype...`,
      },
      {
        id: Date.now().toString() + "2",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: anchorGapTitle
          ? `> grounding.anchor() — "${anchorGapTitle.slice(0, 60)}..."`
          : `> grounding.anchor() — using active research definition`,
      },
    ]);

    try {
      const { systemPrompt, userPrompt } = buildTitlePrompts({
        projectAnswers: project?.answers || {},
        targetJournal: targetJournal || undefined,
        customStyle: customDirective,
      });

      const rawText = await executeAgenticLLM(
        systemPrompt,
        userPrompt,
        "reasoning",
        () => {
          setLogs((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.message.startsWith("> Agent Reasoning")) return prev;
            return [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "info",
                message: "> Agent Reasoning [synthesizing archetypal academic titles]...",
              },
            ];
          });
        },
        (failoverEvt) => {
          if (failoverEvt.userMessage) {
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "warning",
                message: `⚠️ ${failoverEvt.userMessage}`,
              },
            ]);
          }
        }
      );

      const parsedData = parseJsonFromLlm(rawText);
      let data: TitleItem[] = parsedData && Array.isArray(parsedData.data) ? parsedData.data : [];

      if (data.length === 0) {
        data = generateLocalTitleFallback({
          projectAnswers: project?.answers || {},
          targetJournal: targetJournal || undefined,
          customStyle: customDirective,
        });
      }

      setResults(data);

      try {
        const updated = await saveIntakeAnswers(projectId, {
          generated_titles: JSON.stringify(data),
          current_stage: "title_selection",
        });
        setProject(updated);
      } catch (saveErr) {
        console.warn("[TitleSelectionStage] Failed to persist answers:", saveErr);
      }

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ Generated ${data.length} academic title proposals tailored to your research gap.`,
        },
      ]);
    } catch (err: any) {
      const errMsg = err.message || "Failed to generate titles.";

      const fallbackTitles = generateLocalTitleFallback({
        projectAnswers: project?.answers || {},
        targetJournal: targetJournal || undefined,
        customStyle: customDirective,
      });

      setResults(fallbackTitles);

      try {
        const updated = await saveIntakeAnswers(projectId, {
          generated_titles: JSON.stringify(fallbackTitles),
          current_stage: "title_selection",
        });
        setProject(updated);
      } catch (saveErr) {
        console.warn("[TitleSelectionStage] Failed to persist fallback titles:", saveErr);
      }

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "fallback",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "warning",
          message: `ℹ️ Local synthesis activated (${errMsg}): ${fallbackTitles.length} publication-grade title proposals generated.`,
        },
        {
          id: Date.now().toString() + "done2",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ Title proposals ready for evaluation and adoption.`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectTitle = (item: TitleItem) => {
    const full = item.subtitle_text ? `${item.title_text}: ${item.subtitle_text}` : item.title_text;
    setSelectedTitleText(full);
    setIsCustomMode(false);

    saveIntakeAnswers(projectId, {
      working_title: full,
      title: full,
      title_rationale: item.rationale || "",
      current_stage: "title_selection",
    }).then((updated) => setProject(updated)).catch(() => {});
  };

  const handleApplyPolish = async (goal: "shorten" | "rigor" | "journal") => {
    if (!selectedTitleText.trim()) return;
    setIsPolishing(true);
    setError(null);

    setLogs((prev) => [
      ...prev,
      {
        id: Date.now().toString() + "polish",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `> title.polish(${goal}) — optimizing title impact...`,
      },
    ]);

    try {
      const { systemPrompt, userPrompt } = buildTitlePolishPrompt(
        selectedTitleText,
        goal,
        targetJournal || undefined
      );

      const rawText = await executeAgenticLLM(
        systemPrompt,
        userPrompt,
        "simple",
        undefined,
        undefined
      );

      const parsedData = parseJsonFromLlm(rawText);
      const polished: TitleItem[] = parsedData && Array.isArray(parsedData.data) ? parsedData.data : [];

      if (polished.length > 0) {
        const combined = [...polished, ...(results || [])];
        setResults(combined);
        setLogs((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "polish-done",
            timestamp: new Date().toLocaleTimeString([], { hour12: false }),
            level: "success",
            message: `✓ Generated ${polished.length} refined title options.`,
          },
        ]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to polish title.");
    } finally {
      setIsPolishing(false);
    }
  };

  const handleProceedToFinalize = async () => {
    if (!selectedTitleText.trim()) {
      setError("Please select or enter a title before advancing.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated = await saveIntakeAnswers(projectId, {
        working_title: selectedTitleText.trim(),
        current_stage: "title_selection",
      });
      setProject(updated);
      if (onAdvance) {
        onAdvance("title_lock");
      }
    } catch (err: any) {
      setError(err.message || "Failed to save title.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLockTitleAndProceed = async () => {
    if (!selectedTitleText.trim()) {
      setError("Please select or enter a title before locking.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await executeTitleLockAndProceed({
        projectId,
        title: selectedTitleText,
        existingAnswers: project?.answers,
        onSaved: setProject,
        onAdvance: (dest) => onAdvance?.(dest),
      });

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "lock",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ Title officially locked: "${selectedTitleText.trim()}". Proceeding to Evidence extraction.`,
        },
      ]);
    } catch (err: any) {
      setError(err.message || "Failed to lock title.");
    } finally {
      setIsSaving(false);
    }
  };

  const getArchetypeTheme = (archetype?: string) => {
    switch (archetype?.toLowerCase()) {
      case "declarative":
        return {
          icon: "🎯",
          label: "Declarative",
          bg: "bg-[color:var(--surface-inset)]",
          border: "border-[color:var(--border-default)]",
          text: "text-[color:var(--text-primary)]",
        };
      case "compound":
        return {
          icon: "⚡",
          label: "Colon Compound",
          bg: "bg-[color:var(--surface-inset)]",
          border: "border-[color:var(--border-default)]",
          text: "text-[color:var(--text-primary)]",
        };
      case "methodological":
        return {
          icon: "🔬",
          label: "Methodological",
          bg: "bg-[color:var(--surface-inset)]",
          border: "border-[color:var(--border-default)]",
          text: "text-[color:var(--text-primary)]",
        };
      case "inquisitive":
        return {
          icon: "❓",
          label: "Inquisitive",
          bg: "bg-[color:var(--surface-inset)]",
          border: "border-[color:var(--border-default)]",
          text: "text-[color:var(--text-primary)]",
        };
      default:
        return {
          icon: "✍️",
          label: "Scholarly",
          bg: "bg-[color:var(--surface-inset)]",
          border: "border-[color:var(--border-default)]",
          text: "text-[color:var(--text-primary)]",
        };
    }
  };

  if (!def) return <div className="p-8 text-[color:var(--text-muted)]">Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      {/* 1. Header & Stage Control Bar */}
      <div className="shrink-0 px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-b border-[color:var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between bg-[color:var(--surface-raised)] z-10 gap-3 sm:gap-4 shadow-2xs">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] font-black shadow-xs shrink-0">
            05
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[color:var(--text-primary)]">
                {def.number}. {def.label}
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]">
                Phase I: Foundation
              </span>
            </div>
            <p className="text-xs text-[color:var(--text-muted)] mt-0.5 line-clamp-1 sm:line-clamp-none">
              Generate, evaluate, and adopt publication-grade academic research titles anchored in your selected voids.
            </p>
          </div>
        </div>

        {/* Global Header Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-2.5 flex-wrap">
          {selectedTitleText && (
            <button
              type="button"
              onClick={handleProceedToFinalize}
              disabled={isSaving || !selectedTitleText.trim()}
              className="px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
            >
              <span>Review & Finalize Title (Stage 6)</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {(selectedTitleText || isTitleLocked) && (
            <button
              type="button"
              onClick={isTitleLocked ? () => onAdvance?.("vault_sources") : handleLockTitleAndProceed}
              disabled={isSaving || (!selectedTitleText.trim() && !isTitleLocked)}
              className="px-4 sm:px-5 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <span>
                {isSaving ? "Locking..." : isTitleLocked ? "Proceed to Evidence (Phase II) →" : "Lock Title & Advance"}
              </span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Scrollable Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Grounding Context Strip */}
          {(anchorGapTitle || targetJournal) && (
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-[color:var(--text-secondary)]">Grounding Foundation:</span>
                {anchorGapTitle && (
                  <span className="px-2.5 py-1 rounded-md bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] font-semibold flex items-center gap-1.5 max-w-md truncate">
                    <span>👑</span>
                    <span className="truncate">{anchorGapTitle}</span>
                  </span>
                )}
                {supportingGapsCount > 0 && (
                  <span className="px-2 py-1 rounded-md bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-semibold">
                    +{supportingGapsCount} Supporting
                  </span>
                )}
                {targetJournal && (
                  <span className="px-2.5 py-1 rounded-md bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]">
                    🏛️ Venue: <strong className="text-[color:var(--text-primary)]">{targetJournal}</strong>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onAdvance?.("gap_selection")}
                className="text-[11px] font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
              >
                ← Change Selected Gaps
              </button>
            </div>
          )}

          {/* Initial Prompt Hero State */}
          {results === null && !isProcessing && (
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl p-10 text-center shadow-sm space-y-4 my-8">
              <div className="w-14 h-14 rounded-2xl bg-[color:var(--accent-subtle)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] flex items-center justify-center mx-auto text-2xl font-black shadow-xs">
                ✍️
              </div>
              <h3 className="text-lg font-bold text-[color:var(--text-primary)]">
                Synthesize Publication-Ready Titles
              </h3>
              <p className="text-xs text-[color:var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                Scholar Agent will frame 4 distinct academic title archetypes (Declarative, Methodological, Colon Compound, and Inquisitive) anchored in your selected gaps.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => startTitleGeneration()}
                  className="px-6 py-3 rounded-full bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-[color:var(--text-inverse)] font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>✦</span> Generate Title Proposals
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomMode(true)}
                  className="px-5 py-3 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] font-bold text-xs transition-all cursor-pointer"
                >
                  Write Custom Title
                </button>
              </div>
            </div>
          )}

          {/* Processing Banner */}
          {isProcessing && (
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-xl p-4 flex items-center justify-between shadow-2xs animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-[color:var(--accent)] animate-ping" />
                <div>
                  <p className="text-xs font-bold text-[color:var(--text-primary)]">
                    Synthesizing Title Proposals...
                  </p>
                  <p className="text-[11px] text-[color:var(--text-secondary)]">
                    Analyzing target journal guidelines, research gap mechanics, and scholarly framing archetypes.
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-[color:var(--accent)] font-bold">Active Agent Stream</span>
            </div>
          )}

          {/* Terminal Box */}
          <AgentTerminal
            logs={logs}
            isProcessing={isProcessing || isPolishing}
            agentName="Title_Generator"
          />

          {/* Error Alert */}
          {error && (
            <div className="p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-xs flex items-center justify-between">
              <span>⚠️ {error}</span>
              <button
                type="button"
                onClick={() => startTitleGeneration()}
                className="px-3 py-1 bg-[color:var(--state-danger)] text-white text-xs font-bold rounded-full hover:opacity-90 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Active Working Title Editor / Lock Box */}
          {(selectedTitleText || results || isCustomMode) && (
            <div className="bg-[color:var(--surface-raised)] border-2 border-[color:var(--accent)] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                  <span>✦</span> Active Manuscript Working Title
                </span>

                {/* Metrics Pill */}
                <div className="flex items-center gap-3 text-xs">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    titleMetrics.isWordOptimal
                      ? "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border-[color:var(--state-success)]"
                      : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]"
                  }`}>
                    {titleMetrics.wordCount} words {titleMetrics.isWordOptimal ? "✓ Optimal" : "(Ideal: 10–15)"}
                  </span>
                  <span className="text-[11px] text-[color:var(--text-muted)]">
                    {titleMetrics.charCount} chars
                  </span>
                </div>
              </div>

              <textarea
                value={selectedTitleText}
                onChange={(e) => setSelectedTitleText(e.target.value)}
                disabled={isTitleLocked || isSaving}
                rows={2}
                placeholder="Select a proposal below or craft your custom title..."
                className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] focus:border-[color:var(--accent)] rounded-xl p-4 text-base font-bold text-[color:var(--text-primary)] focus:outline-none transition-colors disabled:opacity-80"
              />

              {/* Title Polish Actions */}
              {!isTitleLocked && selectedTitleText.trim() && (
                <div className="pt-1 flex items-center justify-between flex-wrap gap-2 text-xs border-t border-[color:var(--border-subtle)]">
                  <span className="text-[11px] font-bold text-[color:var(--text-secondary)]">
                    1-Click Editorial Polish:
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleApplyPolish("shorten")}
                      disabled={isPolishing}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[color:var(--surface-base)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      ⚡ Shorten for Impact
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPolish("rigor")}
                      disabled={isPolishing}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[color:var(--surface-base)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      🎓 Scholarly Rigor
                    </button>
                    {targetJournal && (
                      <button
                        type="button"
                        onClick={() => handleApplyPolish("journal")}
                        disabled={isPolishing}
                        className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[color:var(--surface-base)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        🏛️ Align to {targetJournal}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Candidate Titles Grid / Cards */}
          {results && results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider">
                  Candidate Title Proposals ({results.length} Generated)
                </h3>
                <button
                  type="button"
                  onClick={() => startTitleGeneration()}
                  disabled={isProcessing}
                  className="text-xs font-semibold text-[color:var(--accent)] hover:underline cursor-pointer disabled:opacity-50"
                >
                  🔄 Regenerate Variations
                </button>
              </div>

              <div className="space-y-3">
                {results.map((item, idx) => {
                  const fullTitle = item.subtitle_text ? `${item.title_text}: ${item.subtitle_text}` : item.title_text;
                  const isSelected = selectedTitleText.trim().toLowerCase() === fullTitle.trim().toLowerCase();
                  const theme = getArchetypeTheme(item.archetype);

                  return (
                    <div
                      key={item.id || idx}
                      onClick={() => !isTitleLocked && handleSelectTitle(item)}
                      className={`rounded-2xl p-5 shadow-2xs transition-all cursor-pointer border select-none space-y-2.5 ${
                        isSelected
                          ? "bg-[color:var(--surface-raised)] border-[color:var(--accent)] ring-2 ring-[color:var(--accent)]/30"
                          : "bg-[color:var(--surface-raised)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${theme.bg} ${theme.text} border ${theme.border}`}>
                            {theme.icon} {theme.label} Archetype
                          </span>
                          {isSelected && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] border border-[color:var(--border-control)]">
                              ✓ Adopted
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isTitleLocked) handleSelectTitle(item);
                          }}
                          disabled={isTitleLocked}
                          className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)]"
                              : "bg-[color:var(--surface-base)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)]"
                          }`}
                        >
                          {isSelected ? "Adopted" : "Adopt Title"}
                        </button>
                      </div>

                      <h4 className="text-base font-bold text-[color:var(--text-primary)] leading-snug">
                        {item.title_text}
                        {item.subtitle_text && (
                          <span className="block text-sm font-semibold text-[color:var(--text-secondary)] mt-0.5">
                            {item.subtitle_text}
                          </span>
                        )}
                      </h4>

                      {item.rationale && (
                        <p className="text-xs text-[color:var(--text-muted)] leading-relaxed pt-1 border-t border-[color:var(--border-subtle)]">
                          <strong className="text-[color:var(--text-secondary)]">Editorial Rationale: </strong>
                          {item.rationale}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Title Input Drawer */}
          {isCustomMode && (
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl p-5 shadow-2xs space-y-3">
              <label className="block text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider">
                Compose Custom Manuscript Title
              </label>
              <input
                type="text"
                value={customTitleInput}
                onChange={(e) => setCustomTitleInput(e.target.value)}
                placeholder="Type your complete academic research title here..."
                className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg p-3 text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsCustomMode(false)}
                  className="px-4 py-2 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (customTitleInput.trim()) {
                      setSelectedTitleText(customTitleInput.trim());
                      setIsCustomMode(false);
                      saveIntakeAnswers(projectId, {
                        working_title: customTitleInput.trim(),
                        current_stage: "title_selection",
                      }).then((p) => setProject(p)).catch(() => {});
                    }
                  }}
                  className="px-5 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer"
                >
                  Use Custom Title
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resource Exhausted Modal */}
      {showExhaustedModal && (
        <AllAiResourcesExhaustedModal
          isOpen={showExhaustedModal}
          onClose={() => setShowExhaustedModal(false)}
          onOpenAiSettings={() => {
            setShowExhaustedModal(false);
            window.location.hash = "#/ai-access";
          }}
          reason={exhaustedReason || undefined}
        />
      )}
    </div>
  );
}
