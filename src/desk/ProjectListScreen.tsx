import { useCallback, useEffect, useMemo, useState } from "react";
import { createProject, listOutputTypes, listProjects } from "./api";
import { getSupabaseClient } from "../services/supabaseClient";
import type { OutputTypeSummary, ProjectView } from "./types";

/**
 * Desk's entry surface: the signed-in user's own projects.
 *
 * Desk previously had no way to reach a project except by already knowing its
 * id and putting it in the URL (`?project=`) — with no listing, no ownership,
 * and no auth, so any id worked for anyone. Now that projects have an owner,
 * `GET /api/projects` is owner-scoped and this is the only route into one.
 *
 * Creation is folded in rather than living on its own screen: with a list to
 * return to, "start something new" is an action on this surface, not a
 * separate destination.
 */
export default function ProjectListScreen({
  onOpen,
  userEmail,
  onOpenSettings,
  onOpenVault,
}: {
  onOpen: (projectId: string) => void;
  userEmail: string | null;
  onOpenSettings?: () => void;
  onOpenVault?: () => void;
}) {
  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    listProjects()
      .then((r) => setProjects(r.items))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

  // The catalog is only needed once the user asks to create something, so it
  // is fetched on that intent rather than on mount — it is the larger of the
  // two payloads and most visits are "open what I was working on".
  useEffect(() => {
    if (!choosing || types) return;
    listOutputTypes()
      .then((r) => setTypes(r.items))
      .catch((e) => setError((e as Error).message));
  }, [choosing, types]);

  async function handleCreate(outputTypeId: string) {
    setCreating(true);
    setError(null);
    try {
      const project = await createProject(outputTypeId);
      onOpen(project.projectId);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)]">
      <header className="border-b border-[color:var(--border-subtle)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <h1 className="text-base font-semibold tracking-tight text-[color:var(--text-primary)]">Scholar</h1>
          <div className="flex items-center gap-3 min-w-0">
            {userEmail && (
              <span className="truncate text-sm text-[color:var(--text-muted)]" title={userEmail}>
                {userEmail}
              </span>
            )}
            {onOpenVault && (
              <button
                type="button"
                onClick={onOpenVault}
                className="shrink-0 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Vault
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="shrink-0 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Settings
              </button>
            )}
            <button
              type="button"
              onClick={() => getSupabaseClient().auth.signOut()}
              className="shrink-0 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        {error && (
          <p
            role="alert"
            className="mb-6 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
          >
            {error}
          </p>
        )}

        {choosing ? (
          <ChooseOutputType
            types={types}
            creating={creating}
            onPick={handleCreate}
            onCancel={() => setChoosing(false)}
          />
        ) : (
          <>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">Your work</h2>
                <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  Everything you are writing, most recent first.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChoosing(true)}
                className="shrink-0 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
              >
                New project
              </button>
            </div>

            {projects === null ? (
              <p className="text-sm text-[color:var(--text-muted)]">Loading your projects…</p>
            ) : projects.length === 0 ? (
              <EmptyState onStart={() => setChoosing(true)} />
            ) : (
              <ul className="flex flex-col gap-2">
                {projects.map((p) => (
                  <li key={p.projectId}>
                    <ProjectRow project={p} onOpen={() => onOpen(p.projectId)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ProjectRow({ project, onOpen }: { project: ProjectView; onOpen: () => void }) {
  const percent = Math.round(project.intakeCompleteness * 100);
  const signedOff = project.gates.filter((g) => g.status === "signed_off").length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] px-4 py-3.5 text-left transition-colors duration-[var(--motion-fast)] hover:border-[color:var(--border-strong)] cursor-pointer"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium text-[color:var(--text-primary)]">{project.outputTypeId}</span>
        <span className="shrink-0 text-xs text-[color:var(--text-muted)]">
          {project.hasDocument ? "Draft in progress" : "No draft yet"}
        </span>
      </div>
      {/* Numbers, not a bare progress bar: "62% of intake answered" is
          actionable in a way an unlabelled bar is not (UX4). */}
      <p className="mt-1 text-xs text-[color:var(--text-muted)]">
        {percent}% of intake answered · {signedOff} of {project.gates.length} gates signed off
      </p>
    </button>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-default)] px-6 py-12 text-center">
      <p className="text-sm font-medium text-[color:var(--text-primary)]">Nothing here yet</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-[color:var(--text-secondary)]">
        Start with what you have to hand in — a thesis, an essay, an article. Scholar builds the structure and the
        rules around that choice.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-5 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
      >
        Start your first project
      </button>
    </div>
  );
}

/** The catalog's own family keys (docs 14 §2) — 6 fixed values, prettified for display. */
const FAMILY_LABEL: Record<string, string> = {
  short_form: "Short-form writing",
  long_form: "Long-form writing",
  publication: "Publications",
  proposal_funding: "Proposals & funding",
  applied_professional: "Applied & professional",
  presentation: "Presentations",
};

function ChooseOutputType({
  types,
  creating,
  onPick,
  onCancel,
}: {
  types: OutputTypeSummary[] | null;
  creating: boolean;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState("");

  // Grouped by family so a 24-entry list reads as ~6 short groups rather
  // than one long scroll with no structure — the reason a dropdown replaced
  // the button grid this used to be.
  const groups = useMemo(() => {
    if (!types) return [];
    const byFamily = new Map<string, OutputTypeSummary[]>();
    for (const t of types) {
      const list = byFamily.get(t.family) ?? [];
      list.push(t);
      byFamily.set(t.family, list);
    }
    return Array.from(byFamily.entries()).sort(([a], [b]) => (FAMILY_LABEL[a] ?? a).localeCompare(FAMILY_LABEL[b] ?? b));
  }, [types]);

  return (
    <>
      <div className="mb-6">
        <button
          type="button"
          onClick={onCancel}
          className="mb-4 text-sm text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
        >
          ← Back to your work
        </button>
        <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">
          What are you producing?
        </h2>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          This sets the structure, the intake questions, and the formatting rules. You can change it later.
        </p>
      </div>

      {!types ? (
        <p className="text-sm text-[color:var(--text-muted)]">Loading output types…</p>
      ) : (
        <div className="flex max-w-md flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="output-type" className="text-sm font-medium text-[color:var(--text-primary)]">
              Document type
            </label>
            <select
              id="output-type"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Choose a document type…
              </option>
              {groups.map(([family, items]) => (
                <optgroup key={family} label={FAMILY_LABEL[family] ?? family}>
                  {items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => onPick(selected)}
            disabled={!selected || creating}
            className="self-start rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
          >
            {creating ? "Creating…" : "Continue"}
          </button>
        </div>
      )}
    </>
  );
}
