import { useEffect, useState } from "react";
import { createProject, listOutputTypes } from "./api";
import type { OutputTypeSummary } from "./types";

/** No-project entry point: docs 20 §9's "No projects" empty state, wired to
 * the real Atlas catalog and project-creation endpoint (both already built —
 * server/routes/project.ts). Intake-form fields beyond output-type selection
 * (docs 20's Project.Brief) aren't collected here yet; a created project
 * starts with empty answers, same as POST /api/projects always has. */
export default function CreateProjectScreen({ onCreated }: { onCreated: (projectId: string) => void }) {
  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listOutputTypes()
      .then((r) => setTypes(r.items))
      .catch((e) => setError(e.message));
  }, []);

  async function handleCreate(outputTypeId: string) {
    setCreating(true);
    setError(null);
    try {
      const project = await createProject(outputTypeId);
      onCreated(project.projectId);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--color-navy-0)] text-[color:var(--text-primary)] p-6">
      <div className="max-w-xl w-full">
        <h1 className="text-lg font-semibold mb-1">Scholar OS — Desk</h1>
        <p className="text-sm text-[color:var(--text-secondary)] mb-6">
          Projects are what you produce — a thesis, an essay, an article. Start with what you need to hand in.
        </p>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        {!types ? (
          <p className="text-sm text-[color:var(--text-muted)]">Loading output types…</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {types.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => handleCreate(t.id)}
                  disabled={creating}
                  className="w-full text-left px-4 py-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)] hover:border-[color:var(--color-luminous-blue-dim)] disabled:opacity-40"
                >
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-[11px] text-[color:var(--text-muted)] mt-0.5">{t.family}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
