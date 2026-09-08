/**
 * Projects View for Source Library
 *
 * Simple, calm organizer by project (e.g. Thesis, Research Paper, Blog Posts, Book).
 * Shows source count and allows filtering sources into projects.
 */

import { useState } from "react";
import type { Source } from "../../services/vault/sourceTypes";

export interface ProjectsViewProps {
  sources: Source[];
  projects: string[];
  activeProject: string | null;
  onSelectProject: (projectName: string | null) => void;
  onCreateProject: (projectName: string) => void;
}

export default function ProjectsView({
  sources,
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
}: ProjectsViewProps) {
  const [newProjectName, setNewProjectName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Compute counts per project
  const projectCounts = new Map<string, number>();
  for (const p of projects) {
    projectCounts.set(p, 0);
  }
  for (const s of sources) {
    for (const p of s.projects) {
      projectCounts.set(p, (projectCounts.get(p) || 0) + 1);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newProjectName.trim();
    if (trimmed && !projects.includes(trimmed)) {
      onCreateProject(trimmed);
      setNewProjectName("");
      setIsAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[color:var(--text-primary)]">Projects</h2>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Organize sources into your writing deliverables.
          </p>
        </div>

        {!isAdding ? (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="px-3.5 py-1.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer shadow-xs"
          >
            + New Project
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g. Capstone Report"
              className="px-3 py-1 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)] focus:outline-hidden"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] px-1 cursor-pointer"
            >
              Cancel
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {/* All Sources Card */}
        <button
          type="button"
          onClick={() => onSelectProject(null)}
          className={`p-4 rounded-[var(--radius-lg)] border text-left flex flex-col justify-between transition-all cursor-pointer ${
            activeProject === null
              ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]/30 ring-1 ring-[color:var(--accent)]"
              : "border-[color:var(--border-default)] hover:border-[color:var(--border-hover)] bg-[color:var(--surface-raised)]"
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xl">📚</span>
            <span className="text-xs font-mono font-bold text-[color:var(--text-muted)]">
              {sources.length} sources
            </span>
          </div>
          <div className="mt-3">
            <h3 className="text-sm font-bold text-[color:var(--text-primary)]">All Sources</h3>
            <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
              Complete source catalog
            </p>
          </div>
        </button>

        {/* Project Cards */}
        {projects.map((p) => {
          const count = projectCounts.get(p) || 0;
          const isSelected = activeProject === p;

          return (
            <button
              key={p}
              type="button"
              onClick={() => onSelectProject(p)}
              className={`p-4 rounded-[var(--radius-lg)] border text-left flex flex-col justify-between transition-all cursor-pointer ${
                isSelected
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]/30 ring-1 ring-[color:var(--accent)]"
                  : "border-[color:var(--border-default)] hover:border-[color:var(--border-hover)] bg-[color:var(--surface-raised)]"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xl">📁</span>
                <span className="text-xs font-mono font-bold text-[color:var(--text-muted)]">
                  {count} {count === 1 ? "source" : "sources"}
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-bold text-[color:var(--text-primary)]">{p}</h3>
                <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                  Click to filter sources
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
