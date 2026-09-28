import { useState, useEffect, useMemo } from "react";
import type { ResearchStage, ResearchPhaseId, StageStatus } from "./types";
import {
  RESEARCH_PHASES,
  STREAMLINED_MILESTONES,
  getMilestoneForStage,
  computeMilestoneStatus,
} from "./types";

export type NavMode = "minimalist" | "detailed";

/**
 * StageNavigation — the left rail of the research workspace.
 *
 * Supports two presentation modes:
 * 1. Minimalist Mode (Default): 9 streamlined milestones that consolidate
 *    connected steps into cohesive research studios, dramatically reducing
 *    clutter and cognitive load.
 * 2. Detailed Mode: Full 25-stage sequential taxonomy grouped across 5 phases.
 */
export default function StageNavigation({
  currentStage,
  stageStatuses,
  onStageChange,
  isCollapsed = false,
  onToggleCollapse,
}: {
  currentStage: ResearchStage;
  stageStatuses: Record<ResearchStage, StageStatus>;
  onStageChange: (stage: ResearchStage) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  // Navigation presentation mode: minimalist (9 milestones) vs detailed (25 stages)
  const [navMode, setNavMode] = useState<NavMode>(() => {
    try {
      const saved = localStorage.getItem("scholar_workspace_nav_mode");
      if (saved === "detailed" || saved === "minimalist") return saved;
    } catch {
      // Ignore
    }
    return "minimalist";
  });

  const handleNavModeChange = (mode: NavMode) => {
    setNavMode(mode);
    try {
      localStorage.setItem("scholar_workspace_nav_mode", mode);
    } catch {
      // Ignore
    }
  };

  // Find active phase and milestone
  const activePhaseDef = useMemo(() => {
    return RESEARCH_PHASES.find((p) => p.stages.some((s) => s.id === currentStage)) || RESEARCH_PHASES[0];
  }, [currentStage]);

  const activeMilestone = useMemo(() => {
    return getMilestoneForStage(currentStage) || STREAMLINED_MILESTONES[0];
  }, [currentStage]);

  const [expandedPhases, setExpandedPhases] = useState<Set<ResearchPhaseId>>(new Set([activePhaseDef.id]));

  // Auto-expand phase when currentStage changes externally
  useEffect(() => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      next.add(activePhaseDef.id);
      return next;
    });
  }, [activePhaseDef.id, currentStage]);

  const togglePhase = (phaseId: ResearchPhaseId) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  // Detailed mode statistics
  const totalDetailedStages = RESEARCH_PHASES.reduce((acc, phase) => acc + phase.stages.length, 0);
  const completedDetailedStages = Object.values(stageStatuses).filter((s) => s === "completed").length;

  // Minimalist mode statistics
  const completedMilestones = useMemo(() => {
    return STREAMLINED_MILESTONES.filter((m) => {
      const { status } = computeMilestoneStatus(m, stageStatuses);
      return status === "completed";
    }).length;
  }, [stageStatuses]);

  const activeMilestoneIndex = STREAMLINED_MILESTONES.findIndex((m) => m.id === activeMilestone.id);

  // Helper to intelligently navigate into a milestone (landing on the active or first available sub-stage)
  const navigateToMilestone = (m: (typeof STREAMLINED_MILESTONES)[0]) => {
    if (m.subStages.includes(currentStage)) return;
    const activeSub = m.subStages.find((s) => stageStatuses[s] === "active");
    if (activeSub) {
      onStageChange(activeSub);
      return;
    }
    const allCompleted = m.subStages.every((s) => stageStatuses[s] === "completed");
    if (allCompleted) {
      onStageChange(m.primaryStage);
      return;
    }
    const firstAvailable = m.subStages.find((s) => stageStatuses[s] !== "locked");
    onStageChange(firstAvailable || m.primaryStage);
  };

  // If collapsed to icon-only mode
  if (isCollapsed) {
    return (
      <nav
        aria-label="Research pipeline collapsed"
        className="w-14 shrink-0 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] flex flex-col items-center py-3 gap-2"
      >
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand Sidebar"
            className="p-2 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors mb-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}

        <div className="w-8 h-px bg-[color:var(--border-subtle)] mb-1" />

        <div className="flex-1 overflow-y-auto space-y-2 w-full flex flex-col items-center">
          {STREAMLINED_MILESTONES.map((m) => {
            const isCurrent = m.id === activeMilestone.id;
            const { status } = computeMilestoneStatus(m, stageStatuses);
            const isLocked = status === "locked";

            return (
              <button
                key={m.id}
                type="button"
                disabled={isLocked}
                onClick={() => !isLocked && navigateToMilestone(m)}
                title={`${m.number}. ${m.label} (${status})`}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer relative ${
                  isCurrent
                    ? "bg-[color:var(--accent)] text-white shadow-sm"
                    : isLocked
                    ? "opacity-35 text-[color:var(--text-muted)] cursor-not-allowed"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <span className="text-xs font-bold font-mono">{m.number}</span>
                {status === "completed" && !isCurrent && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[color:var(--state-success)]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Research stages"
      className="w-[270px] shrink-0 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] flex flex-col h-full select-none"
    >
      {/* Top Header: Title & Segmented Mode Switcher */}
      <div className="p-3 border-b border-[color:var(--border-subtle)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
              Workflow
            </span>
            <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] rounded">
              {navMode === "minimalist" ? "9 Steps" : "25 Steps"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse Sidebar (Ctrl/Cmd+B)"
                className="p-1 rounded text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Minimalist vs Detailed Segmented Control */}
        <div className="grid grid-cols-2 p-0.5 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[11px] font-medium">
          <button
            type="button"
            onClick={() => handleNavModeChange("minimalist")}
            className={`py-1 px-2 rounded-md transition-all text-center cursor-pointer ${
              navMode === "minimalist"
                ? "bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-semibold shadow-xs"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            Minimal (9)
          </button>
          <button
            type="button"
            onClick={() => handleNavModeChange("detailed")}
            className={`py-1 px-2 rounded-md transition-all text-center cursor-pointer ${
              navMode === "detailed"
                ? "bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-semibold shadow-xs"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            Detailed (25)
          </button>
        </div>

        {/* Progress summary bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)] mb-1.5">
            <span className="text-[11px]">
              {navMode === "minimalist"
                ? `Milestone ${activeMilestoneIndex + 1} of 9`
                : `Stage ${completedDetailedStages}/${totalDetailedStages}`}
            </span>
            <span className="font-semibold text-[11px] text-[color:var(--text-primary)]">
              {navMode === "minimalist"
                ? `${Math.round((completedMilestones / STREAMLINED_MILESTONES.length) * 100)}%`
                : `${Math.round((completedDetailedStages / totalDetailedStages) * 100)}%`}
            </span>
          </div>
          <div className="w-full h-1 rounded-full bg-[color:var(--surface-sunken)] overflow-hidden">
            <div
              className="h-full bg-[color:var(--accent)] transition-all duration-500 rounded-full"
              style={{
                width: `${
                  navMode === "minimalist"
                    ? (completedMilestones / STREAMLINED_MILESTONES.length) * 100
                    : (completedDetailedStages / totalDetailedStages) * 100
                }%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Main Stage List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {navMode === "minimalist" ? (
          /* ================= MINIMALIST 9-MILESTONE VIEW ================= */
          <div className="space-y-1.5">
            {STREAMLINED_MILESTONES.map((m) => {
              const isCurrentMilestone = m.id === activeMilestone.id;
              const { status, completedCount, totalCount } = computeMilestoneStatus(m, stageStatuses);
              const isLocked = status === "locked";
              const isFullyDone = status === "completed";

              return (
                <div key={m.id} className="rounded-lg transition-colors">
                  {/* Milestone Primary Row */}
                  <button
                    type="button"
                    onClick={() => !isLocked && navigateToMilestone(m)}
                    disabled={isLocked}
                    aria-current={isCurrentMilestone ? "step" : undefined}
                    title={isLocked ? "Complete previous steps first" : m.description}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                      isCurrentMilestone
                        ? "bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] font-semibold border border-[color:var(--accent-border)]"
                        : isLocked
                        ? "opacity-40 cursor-not-allowed text-[color:var(--text-muted)] border border-transparent"
                        : "hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] border border-transparent"
                    }`}
                  >
                    {/* Number badge / Status indicator */}
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold">
                      {isFullyDone ? (
                        <div className="w-4 h-4 rounded-full bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] flex items-center justify-center">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : isCurrentMilestone ? (
                        <div className="w-4 h-4 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center font-mono text-[9px]">
                          {m.number}
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-muted)] flex items-center justify-center font-mono text-[9px]">
                          {m.number}
                        </div>
                      )}
                    </div>

                    {/* Milestone title */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs truncate">{m.shortLabel}</span>
                        {totalCount > 1 && (
                          <span className="text-[9px] text-[color:var(--text-muted)] font-mono ml-1 shrink-0">
                            {completedCount}/{totalCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Active Milestone Sub-Stage Stepper (Only when multiple sub-stages exist) */}
                  {isCurrentMilestone && m.subStages.length > 1 && (
                    <div className="mt-1 ml-6 pl-2.5 border-l-2 border-[color:var(--accent-border)] py-1 space-y-1">
                      <div className="flex items-center justify-between text-[9px] font-semibold text-[color:var(--text-muted)] uppercase tracking-wider mb-1 px-1">
                        <span>Milestone Steps</span>
                        <span>
                          {m.subStages.indexOf(currentStage) + 1} of {m.subStages.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {m.subStages.map((subId, idx) => {
                          const isSubActive = subId === currentStage;
                          const subStatus = stageStatuses[subId];
                          const isSubLocked = subStatus === "locked";
                          const subLabel =
                            RESEARCH_PHASES.flatMap((p) => p.stages).find((s) => s.id === subId)?.shortLabel ||
                            subId;

                          return (
                            <button
                              key={subId}
                              type="button"
                              disabled={isSubLocked}
                              onClick={() => !isSubLocked && onStageChange(subId)}
                              title={subLabel}
                              className={`text-[10px] px-2 py-0.5 rounded-full transition-all cursor-pointer flex items-center gap-1 ${
                                isSubActive
                                  ? "bg-[color:var(--accent)] text-white font-medium"
                                  : isSubLocked
                                  ? "opacity-35 cursor-not-allowed bg-[color:var(--surface-inset)] text-[color:var(--text-muted)]"
                                  : subStatus === "completed"
                                  ? "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] font-medium hover:opacity-80"
                                  : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
                              }`}
                            >
                              <span className="font-mono text-[8px]">{idx + 1}.</span>
                              <span className="truncate max-w-[80px]">{subLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ================= DETAILED 25-STAGE VIEW ================= */
          RESEARCH_PHASES.map((phase) => {
            const isExpanded = expandedPhases.has(phase.id);
            const phaseCompletedStages = phase.stages.filter((s) => stageStatuses[s.id] === "completed").length;
            const isPhaseDone = phaseCompletedStages === phase.stages.length;

            return (
              <div key={phase.id} className="mb-2">
                <button
                  type="button"
                  onClick={() => togglePhase(phase.id)}
                  className="w-full flex items-center justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg
                      className={`w-3.5 h-3.5 text-[color:var(--text-muted)] transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span
                      className={`text-xs font-bold truncate ${
                        isExpanded
                          ? "text-[color:var(--text-primary)]"
                          : "text-[color:var(--text-secondary)] group-hover:text-[color:var(--text-primary)]"
                      }`}
                    >
                      {phase.label}
                    </span>
                  </div>
                  {isPhaseDone ? (
                    <svg
                      className="w-4 h-4 text-[color:var(--state-success)] shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-[10px] text-[color:var(--text-muted)] font-medium bg-[color:var(--surface-inset)] px-1.5 py-0.5 rounded">
                      {phaseCompletedStages}/{phase.stages.length}
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-1 ml-[11px] pl-4 border-l-2 border-[color:var(--border-subtle)] space-y-1 py-1">
                    {phase.stages.map((stage) => {
                      const status = stageStatuses[stage.id];
                      const isCurrent = stage.id === currentStage;
                      const isLocked = status === "locked";

                      return (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => !isLocked && onStageChange(stage.id)}
                          disabled={isLocked}
                          aria-current={isCurrent ? "step" : undefined}
                          title={isLocked ? "Complete previous stages first" : stage.description}
                          className={[
                            "group relative flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left transition-all duration-200 w-full",
                            isCurrent
                              ? "bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-[color:var(--text-primary)]"
                              : isLocked
                              ? "opacity-40 cursor-not-allowed text-[color:var(--text-muted)] border border-transparent"
                              : "hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer hover:text-[color:var(--text-primary)] border border-transparent",
                          ].join(" ")}
                        >
                          {/* Status Icon */}
                          <div className="w-5 h-5 flex items-center justify-center shrink-0">
                            {status === "completed" ? (
                              <div className="w-4 h-4 rounded-full bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] flex items-center justify-center">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : status === "ai_processing" ? (
                              <div className="w-4 h-4 border-2 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
                            ) : status === "ai_waiting_approval" ? (
                              <div className="w-4 h-4 rounded-full bg-[color:var(--state-warning-subtle)] border border-[color:var(--state-warning)] text-[color:var(--state-warning)] flex items-center justify-center animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                              </div>
                            ) : isCurrent ? (
                              <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--accent)]" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--border-control)]" />
                            )}
                          </div>

                          {/* Label */}
                          <span
                            className={`text-sm truncate ${
                              isCurrent ? "font-semibold text-[color:var(--accent)]" : "font-medium"
                            }`}
                          >
                            {stage.shortLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
}
