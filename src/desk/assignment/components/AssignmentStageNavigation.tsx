import React from "react";
import { ASSIGNMENT_STAGES, type AssignmentStage, type StageStatus } from "../types";
import { useAssignmentWorkspace } from "../AssignmentContext";

export default function AssignmentStageNavigation({
  className = "",
  onSelectStage,
}: {
  className?: string;
  onSelectStage?: () => void;
}) {
  const { currentStage, stageStatuses, setStage, academicLevel, assignmentType, targetWordCount, currentWordCount } =
    useAssignmentWorkspace();

  const getStatusBadge = (status: StageStatus) => {
    switch (status) {
      case "completed":
        return (
          <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold">
            ✓
          </span>
        );
      case "active":
        return (
          <span className="w-5 h-5 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] flex items-center justify-center text-[10px] font-bold animate-pulse">
            •
          </span>
        );
      case "needs_review":
        return (
          <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[10px] font-bold">
            !
          </span>
        );
      case "locked":
        return (
          <span className="w-5 h-5 rounded-full bg-neutral-500/10 text-neutral-400 flex items-center justify-center text-[10px]">
            🔒
          </span>
        );
      default:
        return (
          <span className="w-5 h-5 rounded-full border border-[color:var(--border-default)] text-[color:var(--text-muted)] flex items-center justify-center text-[10px]">
            ○
          </span>
        );
    }
  };

  return (
    <nav className={`flex flex-col h-full bg-[color:var(--surface-canvas)] border-r border-[color:var(--border-subtle)] ${className}`}>
      {/* Workspace Header / Scope */}
      <div className="p-4 border-b border-[color:var(--border-subtle)]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)] bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded-full">
            {academicLevel === "postgraduate" ? "Postgraduate" : "Undergraduate"} Workspace
          </span>
          <span className="text-[11px] font-semibold text-[color:var(--text-muted)]">
            {currentWordCount} / {targetWordCount} words
          </span>
        </div>
        <h3 className="text-xs font-bold text-[color:var(--text-primary)] truncate">
          Academic Assignment Journey
        </h3>
        <p className="text-[11px] text-[color:var(--text-secondary)] mt-0.5">
          Structured 8-phase research & drafting
        </p>
      </div>

      {/* Stage Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {ASSIGNMENT_STAGES.map((stage) => {
          const isActive = currentStage === stage.id;
          const status = stageStatuses[stage.id];
          const isLocked = status === "locked";

          return (
            <button
              key={stage.id}
              type="button"
              disabled={isLocked}
              onClick={() => {
                setStage(stage.id);
                onSelectStage?.();
              }}
              className={`w-full flex items-start gap-3 p-2.5 rounded-[var(--radius-lg)] text-left transition-all cursor-pointer ${
                isActive
                  ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)] font-semibold shadow-xs"
                  : isLocked
                  ? "opacity-50 cursor-not-allowed text-[color:var(--text-muted)]"
                  : "hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] border border-transparent"
              }`}
            >
              <div className="mt-0.5 shrink-0">{getStatusBadge(status)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium truncate">{stage.shortLabel}</span>
                  <span className="text-[10px] opacity-70">Phase {stage.number}</span>
                </div>
                <p className="text-[11px] opacity-80 line-clamp-1 mt-0.5 font-normal">
                  {stage.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Academic Quality Guarantee */}
      <div className="p-3.5 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] m-3 rounded-[var(--radius-md)]">
        <div className="flex items-center gap-2">
          <span className="text-sm">🛡️</span>
          <div>
            <p className="text-[11px] font-bold text-[color:var(--text-primary)]">
              Academic Integrity Shield
            </p>
            <p className="text-[10px] text-[color:var(--text-muted)] leading-tight mt-0.5">
              Drafts generated strictly from approved evidence. Zero hallucinated citations.
            </p>
          </div>
        </div>
      </div>
    </nav>
  );
}
