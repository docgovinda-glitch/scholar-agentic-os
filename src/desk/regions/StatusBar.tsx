import type { ProjectView } from "../types";

/** Region E (docs 22 §2): "Six status indicators is the Desk ceiling." This
 * first slice shows the two that are backed by real data today — gate and
 * blocking-count — rather than fabricate the other four (saved state,
 * spend, online state, running-agent count all need pieces not built yet). */
export default function StatusBar({ project }: { project: ProjectView }) {
  const current = project.gates.find((g) => g.status !== "signed_off") ?? project.gates[project.gates.length - 1];
  const blockingCount = project.gates.reduce((n, g) => n + g.outstandingBlocking.length, 0);

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 text-[11px] font-mono text-[color:var(--text-secondary)] border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
      <span>
        {current.gate} · {current.name} · {current.status.replace("_", " ")}
      </span>
      <span aria-hidden="true">·</span>
      <span className={blockingCount > 0 ? "text-amber-400" : ""}>
        {blockingCount === 0 ? "no blocking findings" : `⚠ ${blockingCount} blocking`}
      </span>
    </div>
  );
}
