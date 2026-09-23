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
  const { currentStage, stageStatuses, setStage } = useAssignmentWorkspace();

  const getStatusBadge = (status: StageStatus) => {
    switch (status) {
      case "completed":
        return (
          <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
            ✓
          </span>
        );
      case "active":
        return (
          <span className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold animate-pulse">
            •
          </span>
        );
      case "needs_review":
        return (
          <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center text-[10px] font-bold">
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
          <span className="w-5 h-5 rounded-full border border-white/10 text-neutral-500 flex items-center justify-center text-[10px]">
            ○
          </span>
        );
    }
  };

  return (
    <nav className={`flex flex-col h-full bg-[#171717] border-r border-white/5 text-neutral-200 ${className}`}>
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
              className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                isActive
                  ? "bg-white/10 text-neutral-100 border border-white/10 font-semibold shadow-xs"
                  : isLocked
                  ? "opacity-50 cursor-not-allowed text-neutral-600"
                  : "hover:bg-white/5 text-neutral-400 hover:text-neutral-200 border border-transparent"
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
      <div className="p-3.5 border border-white/5 bg-neutral-900/60 m-3 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-sm">🛡️</span>
          <div>
            <p className="text-[11px] font-bold text-neutral-200">
              Academic Integrity Shield
            </p>
            <p className="text-[10px] text-neutral-400 leading-tight mt-0.5">
              Drafts generated strictly from approved evidence. Zero hallucinated citations.
            </p>
          </div>
        </div>
      </div>
    </nav>
  );
}
