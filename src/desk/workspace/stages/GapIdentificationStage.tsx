import React, { useState, useEffect, useMemo } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { executeAgenticLLM, saveIntakeAnswers } from "../../api";
import { useOptionalResearchWorkspace } from "../ResearchContext";
import type { ProjectView } from "../../types";
import {
  buildGapPrompts,
  type GapItem,
} from "../agentPrompts/gapPrompts";
import { parseJsonFromLlm } from "../../../utils/jsonParser";
import { AllAiResourcesExhaustedModal } from "../../aiAccess/AllAiResourcesExhaustedModal";

export type { GapItem };

export default function GapIdentificationStage({
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
  const [error, setError] = useState<string | null>(null);
  const [exhaustedReason, setExhaustedReason] = useState<string | null>(null);
  const [showExhaustedModal, setShowExhaustedModal] = useState(false);

  const [gaps, setGaps] = useState<GapItem[] | null>(() => {
    if (project?.answers?.["identified_gaps"]) {
      try {
        const parsed = JSON.parse(project.answers["identified_gaps"]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return null;
  });

  const [expandedGapId, setExpandedGapId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFocusModal, setShowFocusModal] = useState(false);
  const [focusAreaInput, setFocusAreaInput] = useState("");

  // Custom gap form state
  const [customGap, setCustomGap] = useState<{
    title: string;
    gap_type: "empirical" | "theoretical" | "methodological" | "knowledge";
    description: string;
    why_it_matters: string;
    proposed_approach: string;
    importance_score: number;
    feasibility_score: number;
  }>({
    title: "",
    gap_type: "empirical",
    description: "",
    why_it_matters: "",
    proposed_approach: "",
    importance_score: 90,
    feasibility_score: 85,
  });

  useEffect(() => {
    if (project?.answers?.["identified_gaps"] && !gaps) {
      try {
        const parsed = JSON.parse(project.answers["identified_gaps"]);
        if (Array.isArray(parsed) && parsed.length > 0) setGaps(parsed);
      } catch (_) {}
    }
  }, [project?.answers]);

  // Typology Distribution calculation
  const typologyDistribution = useMemo(() => {
    if (!gaps) return { empirical: 0, theoretical: 0, methodological: 0, knowledge: 0 };
    return gaps.reduce(
      (acc, g) => {
        const type = g.gap_type?.toLowerCase() as keyof typeof acc;
        if (acc[type] !== undefined) acc[type] += 1;
        else acc.empirical += 1;
        return acc;
      },
      { empirical: 0, theoretical: 0, methodological: 0, knowledge: 0 }
    );
  }, [gaps]);

  const startAnalysis = async (customFocus?: string) => {
    setIsProcessing(true);
    setError(null);
    setShowFocusModal(false);

    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `> literature.review.synthesis()`,
      },
      {
        id: Date.now().toString() + "2",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "success",
        message: `✓ literature corpus loaded from Stage 2`,
      },
      {
        id: Date.now().toString() + "3",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: customFocus
          ? `> gap.detect() — targeting focus area: "${customFocus}"...`
          : `> gap.detect() — evaluating novelty, boundary conditions & theoretical tensions...`,
      },
    ]);

    try {
      const workingTitle = project?.answers?.["working_title"] || "Untitled Research";
      const researchArea = project?.answers?.["research_area"] || "the field";

      // 1. Build prompts directly on client
      const { systemPrompt, userPrompt } = buildGapPrompts({
        workingTitle,
        researchArea,
        projectAnswers: project?.answers || {},
        focusArea: customFocus,
      });

      // 2. Execute via client AI resource pool
      const rawText = await executeAgenticLLM(
        systemPrompt,
        userPrompt,
        "reasoning",
        (chunk) => {
          setLogs((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.message.startsWith("> Agent Reasoning")) return prev;
            return [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "info",
                message: "> Agent Reasoning [synthesizing research voids]...",
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

      // 3. Parse JSON from LLM output
      const parsedData = parseJsonFromLlm(rawText);
      const data: GapItem[] = parsedData && Array.isArray(parsedData.data) ? parsedData.data : [];

      // Fallback normalization if title is missing in older model outputs
      const normalizedGaps = data.map((g, idx) => ({
        ...g,
        id: g.id || `gap-${Date.now()}-${idx}`,
        title: g.title || `${(g.gap_type || "Research").toUpperCase()} GAP ${idx + 1}`,
        status: g.status || "identified",
        importance_score: g.importance_score || 85,
        feasibility_score: g.feasibility_score || 80,
      }));

      setGaps(normalizedGaps);

      // 4. Immediate discrete checkpoint persistence
      try {
        const updated = await saveIntakeAnswers(projectId, {
          identified_gaps: JSON.stringify(normalizedGaps),
          current_stage: "gap_identification",
        });
        setProject(updated);
      } catch (saveErr) {
        console.warn("[GapIdentificationStage] Failed to persist answers:", saveErr);
      }

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done1",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "info",
          message: `> gap.rank()`,
        },
        {
          id: Date.now().toString() + "done2",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ ${normalizedGaps.length} high-potential research gaps identified and ranked against literature.`,
        },
      ]);
    } catch (err: any) {
      const errMsg = err.message || "Failed to identify research gaps.";
      setError(errMsg);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "err",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "error",
          message: `❌ ${errMsg}`,
        },
      ]);

      if (errMsg.includes("No AI providers") || errMsg.includes("unavailable") || errMsg.includes("exhausted")) {
        setExhaustedReason(errMsg);
        setShowExhaustedModal(true);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Add custom manual gap
  const handleAddCustomGap = () => {
    if (!customGap.title.trim() || !customGap.description.trim()) {
      setError("Please provide a Title and Description for the custom gap.");
      return;
    }

    const newGapItem: GapItem = {
      id: "gap-custom-" + Date.now(),
      title: customGap.title.trim(),
      gap_type: customGap.gap_type,
      description: customGap.description.trim(),
      why_it_matters: customGap.why_it_matters.trim() || undefined,
      proposed_approach: customGap.proposed_approach.trim() || undefined,
      importance_score: Number(customGap.importance_score) || 90,
      feasibility_score: Number(customGap.feasibility_score) || 85,
      status: "identified",
    };

    const updated = gaps ? [newGapItem, ...gaps] : [newGapItem];
    setGaps(updated);

    saveIntakeAnswers(projectId, {
      identified_gaps: JSON.stringify(updated),
      current_stage: "gap_identification",
    }).then((p) => setProject(p)).catch(() => {});

    // Reset and close
    setCustomGap({
      title: "",
      gap_type: "empirical",
      description: "",
      why_it_matters: "",
      proposed_approach: "",
      importance_score: 90,
      feasibility_score: 85,
    });
    setShowAddModal(false);
  };

  // Dismiss a candidate gap
  const handleDismissGap = (gapId: string) => {
    if (!gaps) return;
    const updated = gaps.filter((g) => g.id !== gapId);
    setGaps(updated);

    saveIntakeAnswers(projectId, {
      identified_gaps: JSON.stringify(updated),
      current_stage: "gap_identification",
    }).then((p) => setProject(p)).catch(() => {});
  };

  const getTypeTheme = (type: string) => {
    switch (type?.toLowerCase()) {
      case "empirical":
        return {
          icon: "🔬",
          label: "Empirical Gap",
          bg: "bg-[color:var(--surface-inset)]",
          border: "border-[color:var(--border-default)]",
          text: "text-[color:var(--text-primary)]",
        };
      case "theoretical":
        return {
          icon: "📐",
          label: "Theoretical Gap",
          bg: "bg-[color:var(--surface-inset)]",
          border: "border-[color:var(--border-default)]",
          text: "text-[color:var(--text-primary)]",
        };
      case "methodological":
        return {
          icon: "⚙️",
          label: "Methodological Gap",
          bg: "bg-[color:var(--surface-inset)]",
          border: "border-[color:var(--border-default)]",
          text: "text-[color:var(--text-primary)]",
        };
      case "knowledge":
      default:
        return {
          icon: "💡",
          label: "Knowledge Gap",
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
      <div className="shrink-0 p-6 pb-4 border-b border-[color:var(--border-subtle)] flex flex-wrap justify-between items-center bg-[color:var(--surface-raised)] z-10 gap-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] font-black shadow-xs">
            03
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-[color:var(--text-primary)]">
                {def.number}. {def.label}
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]">
                Phase I: Foundation
              </span>
            </div>
            <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
              Systematic AI identification and ranking of theoretical, empirical, and methodological knowledge gaps.
            </p>
          </div>
        </div>

        {/* Global Header Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Custom Gap</span>
          </button>

          {gaps !== null && gaps.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowFocusModal(true)}
                disabled={isProcessing}
                className="px-3.5 py-2 rounded-full bg-[color:var(--surface-inset)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <span>✦</span>
                <span>Targeted Focus Scan</span>
              </button>

              <button
                type="button"
                onClick={() => onAdvance?.("gap_selection")}
                className="px-5 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span>Review & Select Gaps</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Main Scrollable Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Initial Empty Hero State */}
        {gaps === null && !isProcessing && (
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl p-10 text-center max-w-xl mx-auto my-12 shadow-sm space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[color:var(--accent-subtle)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] flex items-center justify-center mx-auto text-2xl font-black shadow-xs">
              🎯
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">
              Discover High-Impact Research Gaps
            </h3>
            <p className="text-xs text-[color:var(--text-secondary)] max-w-md mx-auto leading-relaxed">
              Scholar Agent will systematically test your literature corpus against your research definition to identify empirical contradictions, methodological flaws, and theoretical voids.
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => startAnalysis()}
                className="px-6 py-3 rounded-full bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-[color:var(--text-inverse)] font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                <span>🔍</span> Run Gap Identification
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="px-5 py-3 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] font-bold text-xs transition-all cursor-pointer"
              >
                + Add Custom Gap
              </button>
            </div>
          </div>
        )}

        {/* Processing Notification */}
        {isProcessing && (
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-xl p-4 flex items-center justify-between shadow-2xs animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[color:var(--accent)] animate-ping" />
              <div>
                <p className="text-xs font-bold text-[color:var(--text-primary)]">
                  Gap Identification in Progress...
                </p>
                <p className="text-[11px] text-[color:var(--text-secondary)]">
                  Evaluating literature coverage, identifying contradictions, and ranking importance and feasibility metrics.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-[color:var(--accent)] font-bold">Active Agent Stream</span>
          </div>
        )}

        {/* Terminal Box */}
        <div className="max-w-4xl mx-auto">
          <AgentTerminal
            logs={logs}
            isProcessing={isProcessing}
            agentName="Gap_Analyst"
          />
        </div>

        {/* Error Alert */}
        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-xs flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button
              onClick={() => startAnalysis()}
              className="px-3 py-1 bg-[color:var(--state-danger)] text-white text-xs font-bold rounded-full hover:opacity-90 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Candidate Gaps Section */}
        {gaps && gaps.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-6 pt-2">
            {/* Typology Summary & Action Bar */}
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-5 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                    <span>Candidate Research Gaps</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)]">
                      {gaps.length} Discovered
                    </span>
                  </h3>
                  <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                    Evaluate the identified voids. In Stage 4, you will select the anchor gap for your manuscript title and methodology.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startAnalysis()}
                    disabled={isProcessing}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[color:var(--surface-base)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    🔄 Re-Run Discovery
                  </button>
                </div>
              </div>

              {/* Typology Breakdown Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[color:var(--border-subtle)]">
                <div className="p-2.5 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-center">
                  <span className="text-[10px] font-bold text-[color:var(--text-secondary)] block">🔬 Empirical</span>
                  <span className="text-sm font-black text-[color:var(--text-primary)]">{typologyDistribution.empirical}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-center">
                  <span className="text-[10px] font-bold text-[color:var(--text-secondary)] block">📐 Theoretical</span>
                  <span className="text-sm font-black text-[color:var(--text-primary)]">{typologyDistribution.theoretical}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-center">
                  <span className="text-[10px] font-bold text-[color:var(--text-secondary)] block">⚙️ Methodological</span>
                  <span className="text-sm font-black text-[color:var(--text-primary)]">{typologyDistribution.methodological}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-center">
                  <span className="text-[10px] font-bold text-[color:var(--text-secondary)] block">💡 Knowledge</span>
                  <span className="text-sm font-black text-[color:var(--text-primary)]">{typologyDistribution.knowledge}</span>
                </div>
              </div>
            </div>

            {/* Gap Cards Stack */}
            <div className="space-y-4">
              {gaps.map((gap, idx) => {
                const theme = getTypeTheme(gap.gap_type);
                const isExpanded = expandedGapId === gap.id;

                return (
                  <div
                    key={gap.id || idx}
                    className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)] rounded-2xl p-6 shadow-2xs transition-all space-y-3"
                  >
                    {/* Header with Type badge and Dual Scores */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${theme.bg} ${theme.text} border ${theme.border}`}>
                          {theme.icon} {theme.label}
                        </span>
                        {gap.id.startsWith("gap-custom-") && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[color:var(--surface-inset)] text-[color:var(--text-muted)]">
                            Custom Added
                          </span>
                        )}
                      </div>

                      {/* Dual Score Meters */}
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-[color:var(--text-muted)]">Importance:</span>
                          <span className="font-black text-[color:var(--text-primary)]">
                            {gap.importance_score}%
                          </span>
                        </div>
                        {gap.feasibility_score !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-[color:var(--text-muted)]">Feasibility:</span>
                            <span className="font-black text-[color:var(--text-primary)]">
                              {gap.feasibility_score}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h4 className="text-base font-bold text-[color:var(--text-primary)] leading-snug">
                      {gap.title || `Gap ${idx + 1}`}
                    </h4>

                    {/* Description */}
                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                      {gap.description}
                    </p>

                    {/* Grounding literature sources if present */}
                    {gap.grounding_sources && gap.grounding_sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                        <span className="text-[color:var(--text-muted)] font-semibold">Evidence Grounding:</span>
                        {gap.grounding_sources.map((src, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-2 py-0.5 rounded-md bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] truncate max-w-sm"
                          >
                            📚 {src}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expandable Why It Matters & Proposed Approach */}
                    {isExpanded && (
                      <div className="mt-4 pt-3 border-t border-[color:var(--border-subtle)] space-y-3 animate-in fade-in duration-150 text-xs">
                        {gap.why_it_matters && (
                          <div className="p-3.5 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-1">
                            <span className="font-bold text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] block">
                              Why This Gap Is Consequential:
                            </span>
                            <p className="text-[color:var(--text-primary)] leading-relaxed">
                              {gap.why_it_matters}
                            </p>
                          </div>
                        )}

                        {gap.proposed_approach && (
                          <div className="p-3.5 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] space-y-1">
                            <span className="font-bold text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] block">
                              Proposed Methodological Resolution:
                            </span>
                            <p className="text-[color:var(--text-primary)] leading-relaxed">
                              {gap.proposed_approach}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom action row */}
                    <div className="pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => setExpandedGapId(isExpanded ? null : gap.id)}
                        className="font-bold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                      >
                        {isExpanded ? "▲ Hide Details" : "▼ View Scholarly Significance & Approach"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDismissGap(gap.id)}
                        className="text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        title="Dismiss candidate gap"
                      >
                        ✕ Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Proceed Strip */}
            <div className="pt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2.5 rounded-full bg-[color:var(--surface-inset)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] font-bold text-xs transition-colors cursor-pointer"
              >
                + Add Custom Gap
              </button>

              <button
                type="button"
                onClick={() => onAdvance?.("gap_selection")}
                className="px-6 py-2.5 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <span>Proceed to Gap Selection</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Add Custom Gap Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[color:var(--surface-raised)] p-6 shadow-2xl border border-[color:var(--border-default)] space-y-4">
            <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <span>+</span> Add Custom Identified Gap
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] p-1 rounded-lg cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[color:var(--text-primary)] mb-1">
                  Gap Title *
                </label>
                <input
                  type="text"
                  value={customGap.title}
                  onChange={(e) => setCustomGap({ ...customGap, title: e.target.value })}
                  placeholder="e.g. Sub-Second Consensus Under Network Partitions..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[color:var(--text-primary)] mb-1">
                    Gap Typology
                  </label>
                  <select
                    value={customGap.gap_type}
                    onChange={(e) => setCustomGap({ ...customGap, gap_type: e.target.value as any })}
                    className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                  >
                    <option value="empirical">Empirical Gap</option>
                    <option value="theoretical">Theoretical Gap</option>
                    <option value="methodological">Methodological Gap</option>
                    <option value="knowledge">Knowledge Gap</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[color:var(--text-primary)] mb-1">
                    Importance Score (0–100)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={100}
                    value={customGap.importance_score}
                    onChange={(e) => setCustomGap({ ...customGap, importance_score: Number(e.target.value) })}
                    className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[color:var(--text-primary)] mb-1">
                  Description of Knowledge Void *
                </label>
                <textarea
                  rows={3}
                  value={customGap.description}
                  onChange={(e) => setCustomGap({ ...customGap, description: e.target.value })}
                  placeholder="Explain precisely what is missing, untested, or conflicting in the current literature..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none resize-y"
                />
              </div>

              <div>
                <label className="block font-bold text-[color:var(--text-primary)] mb-1">
                  Why It Matters (Scholarly Consequence)
                </label>
                <textarea
                  rows={2}
                  value={customGap.why_it_matters}
                  onChange={(e) => setCustomGap({ ...customGap, why_it_matters: e.target.value })}
                  placeholder="What is the negative consequence to research or practice if this gap persists?..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none resize-y"
                />
              </div>

              <div>
                <label className="block font-bold text-[color:var(--text-primary)] mb-1">
                  Proposed Methodological Approach
                </label>
                <textarea
                  rows={2}
                  value={customGap.proposed_approach}
                  onChange={(e) => setCustomGap({ ...customGap, proposed_approach: e.target.value })}
                  placeholder="How should a study be designed to address and close this void?..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none resize-y"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomGap}
                className="px-5 py-2 text-xs font-bold rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
              >
                Add Candidate Gap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Targeted Focus Scan Modal */}
      {showFocusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl bg-[color:var(--surface-raised)] p-6 shadow-2xl border border-[color:var(--border-default)] space-y-4">
            <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <span>✦</span> Targeted Gap Analysis
              </h3>
              <button
                type="button"
                onClick={() => setShowFocusModal(false)}
                className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] p-1 rounded-lg cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
              Focus the AI Gap Analyst on a specific theme, sub-problem, or methodological dimension of your research.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-[color:var(--text-secondary)] mb-1">
                Target Sub-Domain / Theme Focus
              </label>
              <input
                type="text"
                value={focusAreaInput}
                onChange={(e) => setFocusAreaInput(e.target.value)}
                placeholder="e.g. Asymmetric network partitions, latency benchmarks, edge hardware..."
                className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
              />
            </div>

            <div className="pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFocusModal(false)}
                className="px-3.5 py-1.5 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => startAnalysis(focusAreaInput.trim() || undefined)}
                className="px-5 py-2 text-xs font-bold rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
              >
                Execute Focused Analysis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Resource Exhausted Modal */}
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
