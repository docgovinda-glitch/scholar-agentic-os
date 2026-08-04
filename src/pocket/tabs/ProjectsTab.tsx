/**
 * Projects tab — project list and detail (docs 23 §4, §5.2).
 * Shows all projects, last modified, and quick access to each.
 */

import type { PocketProject } from "../types";

interface ProjectsTabProps {
  projects: PocketProject[];
  selectedId: string | null;
  onSelectProject: (id: string) => void;
}

export default function ProjectsTab({ projects, selectedId, onSelectProject }: ProjectsTabProps) {
  const selected = selectedId ? projects.find((p) => p.projectId === selectedId) : null;

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center gap-4">
        <div className="text-2xl">📋</div>
        <p className="text-[#64748B] text-sm">No projects yet</p>
        <p className="text-[#475569] text-xs max-w-sm">
          Create your first project on the desktop version or tap "New Project" below.
        </p>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => onSelectProject("")}
          className="text-[color:var(--color-luminous-blue)] text-xs font-mono uppercase tracking-wide mb-4"
        >
          ← Back to Projects
        </button>
        <h2 className="text-lg font-serif font-bold text-[#F1F5F9]">{selected.projectId}</h2>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-[#94A3B8]">Status: </span>
            <span>
              {selected.gates.find((g) => g.status !== "signed_off")?.name || "Complete"}
            </span>
          </div>
          <div>
            <span className="text-[#94A3B8]">Last modified: </span>
            <span>{new Date(selected.lastModified).toLocaleDateString()}</span>
          </div>
          {selected.sourcesAwaitingApproval > 0 && (
            <div className="text-amber-400">
              {selected.sourcesAwaitingApproval} source{selected.sourcesAwaitingApproval !== 1 ? "s" : ""} waiting
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-[10px] font-mono uppercase tracking-wide text-[#94A3B8]">Your Projects</h2>
      {projects.map((p) => (
        <button
          key={p.projectId}
          onClick={() => onSelectProject(p.projectId)}
          className="w-full text-left rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] p-3 hover:border-[color:var(--color-luminous-blue-dim)]"
        >
          <h3 className="text-sm font-serif font-semibold text-[#F1F5F9] mb-1">{p.projectId}</h3>
          <div className="flex gap-2 text-[10px] text-[#94A3B8] mb-2">
            <span>{new Date(p.lastModified).toLocaleDateString()}</span>
          </div>
          {p.sourcesAwaitingApproval > 0 && (
            <div className="text-[10px] text-amber-400">
              · {p.sourcesAwaitingApproval} sources waiting
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
