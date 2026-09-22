import React, { useEffect, useState, useMemo } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { saveIntakeAnswers } from "../../api";
import { useOptionalResearchWorkspace } from "../ResearchContext";
import { generateLocalGapFallback, type GapItem } from "../agentPrompts/gapPrompts";

export default function GapSelectionStage({
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

  const [gaps, setGaps] = useState<GapItem[] | null>(() => {
    if (project?.answers?.["identified_gaps"]) {
      try {
        const parsed = JSON.parse(project.answers["identified_gaps"]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return null;
  });

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null);

  // Filter and sort state
  const [typologyFilter, setTypologyFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"importance" | "feasibility" | "title">("importance");

  // Multi-gap selection state
  const initialSelectedGaps = (() => {
    try {
      const raw = project?.answers?.["selected_gaps"];
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string" && raw.startsWith("[")) return JSON.parse(raw);
    } catch (_) {}
    return project?.answers?.["selected_gap"] ? [project.answers["selected_gap"]] : [];
  })();

  const [selectedGapIds, setSelectedGapIds] = useState<string[]>(initialSelectedGaps);

  // Anchor gap state
  const [anchorGapId, setAnchorGapId] = useState<string>(() => {
    if (project?.answers?.["anchor_gap_id"]) return project.answers["anchor_gap_id"];
    if (project?.answers?.["selected_gap"]) return project.answers["selected_gap"];
    return initialSelectedGaps[0] || "";
  });

  useEffect(() => {
    if (project?.answers?.["identified_gaps"] && !gaps) {
      try {
        const parsed = JSON.parse(project.answers["identified_gaps"]);
        if (Array.isArray(parsed) && parsed.length > 0) setGaps(parsed);
      } catch (_) {}
    }
  }, [project?.answers]);

  // Sync anchorGapId when selectedGapIds changes
  useEffect(() => {
    if (selectedGapIds.length > 0 && (!anchorGapId || !selectedGapIds.includes(anchorGapId))) {
      setAnchorGapId(selectedGapIds[0]);
    } else if (selectedGapIds.length === 0) {
      setAnchorGapId("");
    }
  }, [selectedGapIds, anchorGapId]);

  // Save selected gaps payload
  const persistSelection = async (nextSelectedIds: string[], nextAnchorId: string) => {
    if (!gaps) return;
    const selectedItems = gaps.filter((g) => nextSelectedIds.includes(g.id));
    const anchorItem = gaps.find((g) => g.id === nextAnchorId) || selectedItems[0];

    const combinedDescriptions = selectedItems
      .map((g) => {
        const prefix = g.id === nextAnchorId ? "[PRIMARY ANCHOR]" : "[SUPPORTING]";
        return `${prefix} [${(g.gap_type || "empirical").toUpperCase()}] ${g.title ? `${g.title}: ` : ""}${g.description}`;
      })
      .join(" || ");

    const newAnswers = {
      ...(project?.answers || {}),
      selected_gap: nextAnchorId || (nextSelectedIds[0] || ""),
      anchor_gap_id: nextAnchorId || (nextSelectedIds[0] || ""),
      selected_gap_title: anchorItem?.title || "",
      selected_gaps: JSON.stringify(nextSelectedIds),
      selected_gap_type: anchorItem?.gap_type || "empirical",
      selected_gap_description: combinedDescriptions,
      current_stage: "gap_selection",
    };

    try {
      const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      setProject(updated);
    } catch (saveErr) {
      console.warn("[GapSelectionStage] Failed to save selection:", saveErr);
    }
  };

  const toggleGapSelection = (gapId: string) => {
    let nextSelected: string[];
    let nextAnchor = anchorGapId;

    if (selectedGapIds.includes(gapId)) {
      nextSelected = selectedGapIds.filter((id) => id !== gapId);
      if (anchorGapId === gapId) {
        nextAnchor = nextSelected[0] || "";
        setAnchorGapId(nextAnchor);
      }
    } else {
      nextSelected = [...selectedGapIds, gapId];
      if (!nextAnchor) {
        nextAnchor = gapId;
        setAnchorGapId(nextAnchor);
      }
    }

    setSelectedGapIds(nextSelected);
    persistSelection(nextSelected, nextAnchor);
  };

  const handleSetAnchor = (gapId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setAnchorGapId(gapId);
    const nextSelected = selectedGapIds.includes(gapId) ? selectedGapIds : [...selectedGapIds, gapId];
    setSelectedGapIds(nextSelected);
    persistSelection(nextSelected, gapId);
  };

  const handleSaveAndProceed = async () => {
    if (selectedGapIds.length === 0) {
      setError("Please select at least one research gap to anchor your study.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const activeAnchor = anchorGapId || selectedGapIds[0];
    await persistSelection(selectedGapIds, activeAnchor);

    setIsSaving(false);
    if (onAdvance) {
      onAdvance("title_selection");
    }
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

  // Filtered and sorted gaps
  const filteredAndSortedGaps = useMemo(() => {
    if (!gaps) return [];
    let list = [...gaps];

    // Filter by typology
    if (typologyFilter !== "all") {
      list = list.filter((g) => (g.gap_type || "").toLowerCase() === typologyFilter.toLowerCase());
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "importance") {
        return (b.importance_score || 0) - (a.importance_score || 0);
      }
      if (sortBy === "feasibility") {
        return (b.feasibility_score || 0) - (a.feasibility_score || 0);
      }
      if (sortBy === "title") {
        return (a.title || "").localeCompare(b.title || "");
      }
      return 0;
    });

    return list;
  }, [gaps, typologyFilter, sortBy]);

  const anchorGapItem = useMemo(() => {
    return gaps?.find((g) => g.id === anchorGapId);
  }, [gaps, anchorGapId]);

  const supportingGapItems = useMemo(() => {
    return gaps?.filter((g) => selectedGapIds.includes(g.id) && g.id !== anchorGapId) || [];
  }, [gaps, selectedGapIds, anchorGapId]);

  const handleSynthesizeFallbackGaps = async () => {
    const workingTitle =
      project?.answers?.["working_title"] ||
      project?.answers?.["title"] ||
      "Untitled Research";
    const researchArea =
      project?.answers?.["research_area"] ||
      project?.answers?.["research_domain"] ||
      "the field";

    const fallback = generateLocalGapFallback({
      workingTitle,
      researchArea,
      projectAnswers: project?.answers || {},
    });
    setGaps(fallback);
    const initialId = fallback[0]?.id || "";
    setSelectedGapIds(initialId ? [initialId] : []);
    setAnchorGapId(initialId);

    try {
      const updated = await saveIntakeAnswers(projectId, {
        identified_gaps: JSON.stringify(fallback),
        selected_gaps: JSON.stringify(initialId ? [initialId] : []),
        selected_gap: initialId,
        anchor_gap_id: initialId,
        selected_gap_title: fallback[0]?.title || "",
        selected_gap_type: fallback[0]?.gap_type || "empirical",
        current_stage: "gap_selection",
      });
      setProject(updated);
    } catch (err) {
      console.warn("[GapSelectionStage] Failed to persist generated fallback gaps:", err);
    }
  };

  if (!def) return <div className="p-8 text-[color:var(--text-muted)]">Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      {/* 1. Header & Stage Control Bar */}
      <div className="shrink-0 px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-b border-[color:var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between bg-[color:var(--surface-raised)] z-10 gap-3 sm:gap-4 shadow-2xs">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] font-black shadow-xs shrink-0">
            04
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
              Designate your primary anchor gap and secondary research dimensions to steer title and methodology generation.
            </p>
          </div>
        </div>

        {/* Global Header Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 flex-wrap">
          <span className="text-xs font-semibold text-[color:var(--text-secondary)]">
            <span className="text-[color:var(--accent)] font-bold">{selectedGapIds.length}</span> {selectedGapIds.length === 1 ? "Gap" : "Gaps"} Selected
          </span>

          <button
            type="button"
            onClick={handleSaveAndProceed}
            disabled={isSaving || selectedGapIds.length === 0}
            className="px-4 sm:px-5 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <span>{isSaving ? "Saving..." : "Proceed to Title Suggestions"}</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* 2. Main Scrollable Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-xs flex items-center justify-between">
              <span>⚠️ {error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Empty State when no gaps are discovered yet */}
          {(!gaps || gaps.length === 0) && (
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl p-6 sm:p-10 text-center shadow-sm space-y-4 my-8">
              <div className="w-14 h-14 rounded-2xl bg-[color:var(--accent-subtle)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] flex items-center justify-center mx-auto text-2xl font-black shadow-xs">
                🔍
              </div>
              <h3 className="text-lg font-bold text-[color:var(--text-primary)]">
                No Research Gaps Identified Yet
              </h3>
              <p className="text-xs text-[color:var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                Stage 4 requires candidate gaps identified in Stage 3. Return to Gap Identification to scan your literature corpus, or auto-synthesize domain-grounded candidate gaps right now.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onAdvance?.("gap_identification")}
                  className="px-5 py-2.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] text-xs font-bold rounded-full transition-all shadow-xs cursor-pointer"
                >
                  ← Go to Stage 3: Gap Identification
                </button>
                <button
                  type="button"
                  onClick={handleSynthesizeFallbackGaps}
                  className="px-6 py-2.5 bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-[color:var(--text-inverse)] text-xs font-bold rounded-full transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <span>✦</span>
                  <span>Auto-Synthesize Gaps</span>
                </button>
              </div>
            </div>
          )}

          {/* Filter, Sort & Typology Strip */}
          {gaps && gaps.length > 0 && (
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Typology filter pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[color:var(--text-secondary)] mr-1">Filter:</span>
                  {[
                    { id: "all", label: "All Gaps" },
                    { id: "empirical", label: "🔬 Empirical" },
                    { id: "theoretical", label: "📐 Theoretical" },
                    { id: "methodological", label: "⚙️ Methodological" },
                    { id: "knowledge", label: "💡 Knowledge" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTypologyFilter(tab.id)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        typologyFilter === tab.id
                          ? "bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] border border-[color:var(--border-control)]"
                          : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-transparent"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-2">
                  <label htmlFor="gap-sort-select" className="text-[11px] font-bold text-[color:var(--text-secondary)] shrink-0">Sort By:</label>
                  <select
                    id="gap-sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-[color:var(--surface-base)] border border-[color:var(--border-control)] rounded-lg px-2.5 py-1 text-xs text-[color:var(--text-primary)] focus:outline-none cursor-pointer"
                  >
                    <option value="importance">Highest Importance</option>
                    <option value="feasibility">Highest Feasibility</option>
                    <option value="title">Title (A–Z)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Gap Selection Cards */}
          {gaps && gaps.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider">
                  Select Anchor & Supporting Gaps ({filteredAndSortedGaps.length} available)
                </span>
                <span className="text-xs text-[color:var(--text-muted)]">
                  Click any card to select/deselect
                </span>
              </div>

              {filteredAndSortedGaps.map((item, idx) => {
                const isSelected = selectedGapIds.includes(item.id);
                const isAnchor = isSelected && anchorGapId === item.id;
                const isExpanded = expandedGapId === item.id;
                const theme = getTypeTheme(item.gap_type);

                return (
                  <div
                    key={item.id || idx}
                    onClick={() => toggleGapSelection(item.id)}
                    className={`rounded-2xl p-5 shadow-2xs transition-all cursor-pointer border select-none space-y-3 ${
                      isSelected
                        ? isAnchor
                          ? "bg-[color:var(--surface-raised)] border-[color:var(--accent)] ring-2 ring-[color:var(--accent)]/30"
                          : "bg-[color:var(--surface-raised)] border-[color:var(--border-strong)]"
                        : "bg-[color:var(--surface-raised)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)]"
                    }`}
                  >
                    {/* Top Row: Checkbox, Typology, Dual Scores, Anchor Status */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by parent container click
                          className="w-4 h-4 rounded text-[color:var(--accent)] focus:ring-[color:var(--accent)] cursor-pointer"
                        />

                        {/* Typology Badge */}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${theme.bg} ${theme.text} border ${theme.border}`}>
                          {theme.icon} {theme.label}
                        </span>

                        {/* Anchor vs Supporting Status Badge */}
                        {isSelected && (
                          isAnchor ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] border border-[color:var(--border-control)] flex items-center gap-1">
                              <span>👑</span> PRIMARY ANCHOR
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)] flex items-center gap-1">
                              <span>🔗</span> SUPPORTING
                            </span>
                          )
                        )}
                      </div>

                      {/* Right: Scores & Anchor action */}
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-[color:var(--text-muted)]">Importance:</span>
                          <span className="font-black text-[color:var(--text-primary)]">{item.importance_score}%</span>
                        </div>
                        {item.feasibility_score !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-[color:var(--text-muted)]">Feasibility:</span>
                            <span className="font-black text-[color:var(--text-primary)]">{item.feasibility_score}%</span>
                          </div>
                        )}

                        {/* Set as Anchor action button */}
                        {isSelected && !isAnchor && (
                          <button
                            type="button"
                            onClick={(e) => handleSetAnchor(item.id, e)}
                            className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-[color:var(--surface-base)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] transition-colors cursor-pointer"
                            title="Promote this gap to primary anchor research question"
                          >
                            👑 Set as Anchor
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h4 className="text-base font-bold text-[color:var(--text-primary)] leading-snug">
                      {item.title || `Research Void ${idx + 1}`}
                    </h4>

                    {/* Description */}
                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                      {item.description}
                    </p>

                    {/* Grounding Literature */}
                    {item.grounding_sources && item.grounding_sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                        <span className="text-[color:var(--text-muted)] font-semibold">Evidence Grounding:</span>
                        {item.grounding_sources.map((src, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-2 py-0.5 rounded-md bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] truncate max-w-sm"
                          >
                            📚 {src}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expandable Why It Matters & Proposed Resolution */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-[color:var(--border-subtle)] space-y-3 animate-in fade-in duration-150 text-xs">
                        {item.why_it_matters && (
                          <div className="p-3.5 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-1">
                            <span className="font-bold text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] block">
                              Why This Gap Is Consequential:
                            </span>
                            <p className="text-[color:var(--text-primary)] leading-relaxed">
                              {item.why_it_matters}
                            </p>
                          </div>
                        )}

                        {item.proposed_approach && (
                          <div className="p-3.5 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] space-y-1">
                            <span className="font-bold text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] block">
                              Proposed Methodological Resolution:
                            </span>
                            <p className="text-[color:var(--text-primary)] leading-relaxed">
                              {item.proposed_approach}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom row: toggle details */}
                    <div className="pt-2 border-t border-[color:var(--border-subtle)] flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedGapId(isExpanded ? null : item.id);
                        }}
                        className="font-bold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                      >
                        {isExpanded ? "▲ Hide Details" : "▼ View Scholarly Significance & Approach"}
                      </button>

                      <span className="text-[11px] text-[color:var(--text-muted)]">
                        {isSelected ? "Selected for Manuscript" : "Click to select"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. Live Gap Synergy Preview Strip */}
          {selectedGapIds.length > 0 && anchorGapItem && (
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-[color:var(--text-secondary)] flex items-center gap-1.5">
                  <span>🎯</span> Research Gap Synergy Blueprint
                </span>
                <span className="text-xs font-semibold text-[color:var(--text-muted)]">
                  Feeds into Stage 5 (Title Suggestions)
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-[color:var(--accent)] uppercase tracking-wider">
                      👑 Primary Anchor Inquiry:
                    </span>
                    <span className="text-[11px] font-bold text-[color:var(--text-primary)]">
                      {anchorGapItem.title || anchorGapItem.gap_type}
                    </span>
                  </div>
                  <p className="text-[color:var(--text-secondary)] leading-relaxed">
                    {anchorGapItem.description}
                  </p>
                </div>

                {supportingGapItems.length > 0 && (
                  <div className="p-3 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)]">
                    <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block mb-1">
                      🔗 Supporting Validation Dimensions ({supportingGapItems.length}):
                    </span>
                    <ul className="list-disc list-inside space-y-1 text-[color:var(--text-secondary)]">
                      {supportingGapItems.map((sg) => (
                        <li key={sg.id}>
                          <strong className="text-[color:var(--text-primary)]">{sg.title || sg.gap_type}:</strong> {sg.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom Proceed Strip */}
          {gaps && gaps.length > 0 && (
            <div className="pt-4 flex items-center justify-between border-t border-[color:var(--border-subtle)]">
              <span className="text-xs text-[color:var(--text-muted)]">
                {selectedGapIds.length} of {gaps.length} candidate gaps selected
              </span>

              <button
                type="button"
                onClick={handleSaveAndProceed}
                disabled={isSaving || selectedGapIds.length === 0}
                className="px-6 py-2.5 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isSaving ? "Saving..." : "Proceed to Title Suggestions"}</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
