import type { ProjectView } from "../types";

/** Region E (docs 22 §2): "Six status indicators is the Desk ceiling." This
 * first slice shows the two that are backed by real data today — gate and
 * blocking-count — rather than fabricate the other four (saved state,
 * spend, online state, running-agent count all need pieces not built yet). */
export default function StatusBar({ project, trayOpen, onToggleTray }: { project: ProjectView, trayOpen?: boolean, onToggleTray?: () => void }) {
  const current = project.gates.find((g) => g.status !== "signed_off") ?? project.gates[project.gates.length - 1];
  const blockingCount = project.gates.reduce((n, g) => n + g.outstandingBlocking.length, 0);

  return (
    <footer className="flex min-w-0 items-center gap-3 px-4 py-1.5 text-xs text-[color:var(--text-secondary)] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)]">
      <span className="truncate">
        Stage: {current.name} ({current.status.replace("_", " ")})
      </span>
      <span aria-hidden="true">·</span>
      <span className={`truncate ${blockingCount > 0 ? "text-[color:var(--state-warning)]" : ""}`}>
        {blockingCount === 0
          ? "Nothing blocking"
          : `${blockingCount} ${blockingCount === 1 ? "requirement" : "requirements"} to meet before the next stage`}
      </span>
      
      {onToggleTray && (
        <button 
          type="button"
          onClick={onToggleTray}
          className={`ml-auto shrink-0 px-2 py-0.5 rounded transition-colors cursor-pointer ${trayOpen ? 'bg-[color:var(--surface-hover)] text-[color:var(--text-primary)]' : 'hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]'}`}
        >
          Activity
        </button>
      )}
    </footer>
  );
}
