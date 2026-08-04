import type { ProjectView } from "../types";

/** Region A (docs 22 §2). No project switcher yet — GET /api/projects (list)
 * doesn't exist server-side; this first slice works one project at a time,
 * addressed by ?project=<id> in the URL. Search and settings are visibly
 * present but explicitly labelled not-yet-built rather than dead/silent
 * controls (22 §6.2's "never a silent no-op" principle, applied here even
 * though that section is about Desk/Pocket parity messaging specifically). */
export default function Header({ project, outputTypeLabel }: { project: ProjectView; outputTypeLabel: string }) {
  const current = project.gates.find((g) => g.status !== "signed_off") ?? project.gates[project.gates.length - 1];

  return (
    <header className="flex items-center gap-3 px-4 h-12 border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)] text-sm">
      <span className="font-semibold text-[#E2E8F0]">Scholar OS</span>
      <span className="text-[#475569]" aria-hidden="true">
        /
      </span>
      <span className="text-[#94A3B8] truncate max-w-xs" title={project.projectId}>
        {outputTypeLabel}
      </span>
      <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wide border border-[color:var(--color-luminous-blue-dim)] text-[color:var(--color-luminous-blue)]">
        {current.gate} {current.name}
      </span>
      <div className="ml-auto flex items-center gap-3 text-[#64748B]">
        <span title="Not yet built" className="cursor-not-allowed text-xs font-mono">
          ⌕ Search
        </span>
        <span title="Not yet built" className="cursor-not-allowed text-xs font-mono">
          ⚙ Settings
        </span>
      </div>
    </header>
  );
}
