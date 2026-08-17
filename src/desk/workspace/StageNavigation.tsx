import type { ResearchStage, StageStatus } from "./types";
import { RESEARCH_STAGES } from "./types";

/**
 * StageNavigation — the left rail of the research workspace.
 *
 * Renders the 10-stage research pipeline as a vertical navigation with
 * completion indicators. Each stage shows its number, icon, label, and
 * current status. Stages can be completed, active, available (clickable
 * but not yet started), locked (prerequisites not met), or processing
 * (AI is working).
 */
export default function StageNavigation({
  currentStage,
  stageStatuses,
  onStageChange,
}: {
  currentStage: ResearchStage;
  stageStatuses: Record<ResearchStage, StageStatus>;
  onStageChange: (stage: ResearchStage) => void;
}) {
  return (
    <nav
      aria-label="Research stages"
      className="w-[220px] shrink-0 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] overflow-y-auto py-4 px-3 flex flex-col gap-1"
    >
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-muted)] px-3 mb-3">
        Research Pipeline
      </h3>

      {RESEARCH_STAGES.map((stage, index) => {
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
              "group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-all duration-200 w-full",
              isCurrent
                ? "bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-[color:var(--text-primary)]"
                : isLocked
                  ? "opacity-40 cursor-not-allowed text-[color:var(--text-muted)]"
                  : "hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer hover:text-[color:var(--text-primary)]",
            ].join(" ")}
          >
            {/* Stage indicator */}
            <div
              className={[
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors border",
                status === "completed"
                  ? "bg-[color:var(--state-success-subtle)] border-[color:var(--state-success)] text-[color:var(--state-success)]"
                  : isCurrent
                    ? "bg-[color:var(--accent-subtle)] border-[color:var(--accent)] text-[color:var(--accent)]"
                    : status === "ai_processing"
                      ? "bg-[color:var(--state-info-subtle)] border-[color:var(--state-info)] text-[color:var(--state-info)]"
                      : status === "warning"
                        ? "bg-[color:var(--state-warning-subtle)] border-[color:var(--state-warning)] text-[color:var(--state-warning)]"
                        : "bg-[color:var(--surface-inset)] border-[color:var(--border-subtle)] text-[color:var(--text-muted)]",
              ].join(" ")}
            >
              {status === "completed" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : status === "ai_processing" ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                stage.number
              )}
            </div>

            {/* Stage label */}
            <div className="min-w-0 flex-1">
              <span
                className={[
                  "block text-sm font-semibold truncate",
                  isCurrent ? "text-[color:var(--accent)]" : "",
                ].join(" ")}
              >
                {stage.label}
              </span>
            </div>

            {/* Connector line below (except last) */}
            {index < RESEARCH_STAGES.length - 1 && (
              <div
                className={[
                  "absolute left-[27px] top-[42px] w-[2px] h-[12px]",
                  status === "completed"
                    ? "bg-[color:var(--state-success)]"
                    : "bg-[color:var(--border-subtle)]",
                ].join(" ")}
              />
            )}
          </button>
        );
      })}

      {/* Progress summary */}
      <div className="mt-auto pt-4 px-3 border-t border-[color:var(--border-subtle)]">
        <div className="flex items-center justify-between text-xs text-[color:var(--text-muted)] mb-2">
          <span>Progress</span>
          <span className="font-bold">
            {Object.values(stageStatuses).filter((s) => s === "completed").length} / {RESEARCH_STAGES.length}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[color:var(--surface-sunken)] overflow-hidden">
          <div
            className="h-full bg-[color:var(--accent)] transition-all duration-500 rounded-full"
            style={{
              width: `${(Object.values(stageStatuses).filter((s) => s === "completed").length / RESEARCH_STAGES.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </nav>
  );
}
