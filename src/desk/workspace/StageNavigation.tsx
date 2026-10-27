import React, { useMemo } from "react";
import type { ResearchStage, StageStatus, JournalStudioMode, StudioModeDefinition } from "./types";
import { JOURNAL_STUDIO_MODES, getStudioModeForStage } from "./types";

/**
 * 5-Mode Journal Studio Switcher
 *
 * Minimal, distraction-free navigation replacing legacy multi-stage accordions.
 * Exposes the 5 Core Academic Research Studios:
 * 1. Protocol & Blueprint
 * 2. Literature & Data Matrix
 * 3. Manuscript Studio
 * 4. Referee & Rebuttal
 * 5. Audit & Submission Export
 */
export default function StageNavigation({
  currentStage,
  currentMode,
  stageStatuses,
  onStageChange,
  onModeChange,
  isCollapsed = false,
  onToggleCollapse,
}: {
  currentStage: ResearchStage;
  currentMode?: JournalStudioMode;
  stageStatuses: Record<ResearchStage, StageStatus>;
  onStageChange: (stage: ResearchStage) => void;
  onModeChange?: (mode: JournalStudioMode) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const activeMode: StudioModeDefinition = useMemo(() => {
    if (currentMode) {
      const found = JOURNAL_STUDIO_MODES.find((m) => m.id === currentMode);
      if (found) return found;
    }
    return getStudioModeForStage(currentStage);
  }, [currentMode, currentStage]);

  const handleSelectMode = (mode: StudioModeDefinition) => {
    if (onModeChange) {
      onModeChange(mode.id);
    } else {
      onStageChange(mode.primaryStage);
    }
  };

  // Helper to compute progress for a mode
  const getModeStatus = (mode: StudioModeDefinition): "completed" | "active" | "available" => {
    if (mode.id === activeMode.id) return "active";
    const statuses = mode.stages.map((s) => stageStatuses[s] || "locked");
    if (statuses.every((s) => s === "completed")) return "completed";
    return "available";
  };

  // Icon-only collapsed view
  if (isCollapsed) {
    return (
      <nav
        aria-label="5-Mode Studio Navigation (Collapsed)"
        className="w-14 shrink-0 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] flex flex-col items-center py-3 gap-2 h-full"
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
          {JOURNAL_STUDIO_MODES.map((mode) => {
            const isActive = mode.id === activeMode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelectMode(mode)}
                title={mode.label}
                aria-current={isActive ? "page" : undefined}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                  isActive
                    ? "bg-[color:var(--accent)] text-white shadow-xs"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={mode.icon} />
                </svg>
                {isActive && (
                  <span className="absolute -left-1 w-1.5 h-4 bg-[color:var(--accent)] rounded-r" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // Expanded 5-Mode Studio Switcher
  return (
    <nav
      aria-label="5-Mode Studio Navigation"
      className="w-72 shrink-0 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] flex flex-col h-full"
    >
      {/* Top Header */}
      <div className="p-4 border-b border-[color:var(--border-subtle)] flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block">
            Studio Navigation
          </span>
          <span className="text-xs font-bold text-[color:var(--text-primary)]">
            5-Mode Studio Switcher
          </span>
        </div>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse Sidebar"
            className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Mode List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {JOURNAL_STUDIO_MODES.map((mode) => {
          const isActive = mode.id === activeMode.id;
          const status = getModeStatus(mode);

          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleSelectMode(mode)}
              aria-current={isActive ? "page" : undefined}
              className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                isActive
                  ? "bg-[color:var(--accent)]/10 border-[color:var(--accent)] text-[color:var(--text-primary)] shadow-xs"
                  : "bg-[color:var(--surface-sunken)]/60 border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-control)]"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-3 bottom-3 w-1 bg-[color:var(--accent)] rounded-r" />
              )}

              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center font-mono text-[10px] font-bold ${
                      isActive
                        ? "bg-[color:var(--accent)] text-white"
                        : "bg-[color:var(--surface-raised)] text-[color:var(--text-muted)] group-hover:text-[color:var(--text-primary)]"
                    }`}
                  >
                    0{mode.number}
                  </span>
                  <span className="text-xs font-bold truncate">
                    {mode.shortLabel}
                  </span>
                </div>

                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                    isActive
                      ? "bg-[color:var(--accent)] text-white"
                      : status === "completed"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "text-[color:var(--text-muted)]"
                  }`}
                >
                  {isActive ? "Active" : status === "completed" ? "Done" : "Ready"}
                </span>
              </div>

              <p className="text-[11px] text-[color:var(--text-muted)] line-clamp-1 pl-7">
                {mode.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/40 text-[10px] text-[color:var(--text-muted)] text-center font-mono">
        Strict Client-Owned AI Architecture
      </div>
    </nav>
  );
}
