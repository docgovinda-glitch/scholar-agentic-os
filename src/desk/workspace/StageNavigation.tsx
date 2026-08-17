import { useState, useEffect } from "react";
import type { ResearchStage, ResearchPhaseId } from "./types";
import { RESEARCH_PHASES } from "./types";

/**
 * StageNavigation — the left rail of the research workspace.
 *
 * Renders the 25-stage research pipeline grouped into 5 phases.
 * Uses an accordion style to keep the UI clean, auto-expanding the phase
 * that contains the current stage.
 */
export default function StageNavigation({
  currentStage,
  stageStatuses,
  onStageChange,
}: {
  currentStage: ResearchStage;
  stageStatuses: Record<ResearchStage, import("./types").StageStatus>;
  onStageChange: (stage: ResearchStage) => void;
}) {
  // Find which phase contains the current stage
  const activePhaseDef = RESEARCH_PHASES.find(p => p.stages.some(s => s.id === currentStage)) || RESEARCH_PHASES[0];
  
  const [expandedPhases, setExpandedPhases] = useState<Set<ResearchPhaseId>>(new Set([activePhaseDef.id]));

  // Auto-expand the phase when currentStage changes externally
  useEffect(() => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.add(activePhaseDef.id);
      return next;
    });
  }, [activePhaseDef.id, currentStage]);

  const togglePhase = (phaseId: ResearchPhaseId) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const totalStages = RESEARCH_PHASES.reduce((acc, phase) => acc + phase.stages.length, 0);
  const completedStages = Object.values(stageStatuses).filter(s => s === "completed").length;

  return (
    <nav
      aria-label="Research stages"
      className="w-[260px] shrink-0 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] flex flex-col"
    >
      <div className="p-4 border-b border-[color:var(--border-subtle)]">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-muted)] mb-3">
          Research Pipeline
        </h3>
        {/* Progress summary */}
        <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)] mb-2">
          <span>Overall Progress</span>
          <span className="font-bold">
            {Math.round((completedStages / totalStages) * 100)}%
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[color:var(--surface-sunken)] overflow-hidden">
          <div
            className="h-full bg-[color:var(--accent)] transition-all duration-500 rounded-full"
            style={{ width: `${(completedStages / totalStages) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {RESEARCH_PHASES.map((phase) => {
          const isExpanded = expandedPhases.has(phase.id);
          const phaseCompletedStages = phase.stages.filter(s => stageStatuses[s.id] === "completed").length;
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
                    className={`w-3.5 h-3.5 text-[color:var(--text-muted)] transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className={`text-xs font-bold truncate ${isExpanded ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-secondary)] group-hover:text-[color:var(--text-primary)]"}`}>
                    {phase.label}
                  </span>
                </div>
                {isPhaseDone ? (
                  <svg className="w-4 h-4 text-[color:var(--state-success)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                        <span className={`text-sm truncate ${isCurrent ? "font-semibold text-[color:var(--accent)]" : "font-medium"}`}>
                          {stage.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
