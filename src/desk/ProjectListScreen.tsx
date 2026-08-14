import { useCallback, useEffect, useMemo, useState } from "react";
import { createProject, listOutputTypes, listProjects } from "./api";
import { getSupabaseClient } from "../services/supabaseClient";
import type { OutputTypeSummary, ProjectView } from "./types";
import ScholarCoreLogo from "../components/ScholarCoreLogo";

/**
 * Desk's entry surface: the signed-in user's own projects — transformed into
 * the SCHOLAR CORE Research Command Center.
 *
 * This is the primary interface for signed-in users:
 * - Shows SCHOLAR CORE branding prominently
 * - Explains what Scholar Core is
 * - Provides quick access to major capabilities (Research, Knowledge, Documents, etc.)
 * - Lists the user's recent projects
 * - Offers a way to create new projects
 *
 * Desk previously had no way to reach a project except by already knowing its id
 * and putting it in the URL (`?project=`) — with no listing, no ownership, and
 * no auth. Now that projects have an owner, `GET /api/projects` is owner-scoped
 * and this is the only route into one.
 */
export default function ProjectListScreen({
  onOpen,
  userEmail,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
  showWelcome,
  onWelcomeSeen,
}: {
  onOpen: (projectId: string) => void;
  userEmail: string | null;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  /**
   * Section 11 of the first-login journey: true only for the render right
   * after onboarding (AI Setup, then Knowledge) just finished — never on a
   * plain revisit to this screen, and never again after this mount even if
   * the caller's own flag is cleared out from under a still-mounted instance.
   */
  showWelcome?: boolean;
  /** Consumes the one-time flag above so a later remount of this same screen doesn't show it again. */
  onWelcomeSeen?: () => void;
}) {
  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [creating, setCreating] = useState(false);
  // Captured once at mount, deliberately not derived from the live prop: the
  // banner must stay visible until the user dismisses it, even after
  // onWelcomeSeen() below has already told the parent to stop passing
  // showWelcome=true on future renders/mounts.
  const [welcomeVisible, setWelcomeVisible] = useState(() => showWelcome ?? false);

  // Intentionally mount-only (empty deps) — see welcomeVisible's comment above.
  useEffect(() => {
    if (showWelcome) onWelcomeSeen?.();
  }, []);

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
      {/* Header with SCHOLAR CORE branding and navigation */}
      <header className="border-b border-[color:var(--border-subtle)]">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <ScholarCoreLogo size="md" withText className="text-[color:var(--text-primary)]" />
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
                  Knowledge
                </button>
              )}
              {onOpenAiAccess && (
                <button
                  type="button"
                  onClick={onOpenAiAccess}
                  className="shrink-0 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
                >
                  AI
                </button>
              )}
              {onOpenAccountSettings && (
                <button
                  type="button"
                  onClick={onOpenAccountSettings}
                  className="shrink-0 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-[color:var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
                >
                  Account
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        {welcomeVisible && (
          <div
            role="status"
            className="mb-8 flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-[color:var(--text-primary)]">
                Welcome to Scholar Core
              </p>
              <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">
                Your research command center is ready. Start a new project or explore your research tools.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWelcomeVisible(false)}
              className="shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

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
            {/* What is Scholar Core section */}
            <section className="mb-12 p-6 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
              <h2 className="text-lg font-semibold mb-2">Your Research Command Center</h2>
              <p className="text-sm text-[color:var(--text-secondary)] mb-4">
                Scholar Core connects research, knowledge, and creation in one workspace. Use the tools below to
                organize your research and create scholarly documents.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <CapabilityCard
                  icon="📝"
                  title="Projects"
                  desc="Create and work on research projects, theses, essays, articles, and more."
                  action="See your projects below"
                />
                <CapabilityCard
                  icon="📚"
                  title="Knowledge Vault"
                  desc="Store, organize, and access all your research materials and sources."
                  action="Open Knowledge Vault"
                  onClick={onOpenVault}
                />
                <CapabilityCard
                  icon="🧠"
                  title="AI Assistance"
                  desc="Configure AI to help analyze, summarize, and understand information."
                  action="Manage AI"
                  onClick={onOpenAiAccess}
                />
                <CapabilityCard
                  icon="⚙️"
                  title="Settings"
                  desc="Manage your account, profile, subscription, and preferences."
                  action="Account Settings"
                  onClick={onOpenAccountSettings}
                />
              </div>
            </section>

            {/* Projects section */}
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">
                  Your Projects
                </h2>
                <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  Everything you are working on, most recent first.
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

function CapabilityCard({
  icon,
  title,
  desc,
  action,
  onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  action: string;
  onClick?: () => void;
}) {
  return (
    <div className="p-4 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)]">
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-xs text-[color:var(--text-secondary)] mb-3">{desc}</p>
      {onClick && (
        <button
          onClick={onClick}
          className="text-xs text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] transition-colors cursor-pointer font-medium"
        >
          {action} →
        </button>
      )}
      {!onClick && <p className="text-xs text-[color:var(--text-muted)]">{action}</p>}
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
      <p className="text-sm font-medium text-[color:var(--text-primary)]">No projects yet</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-[color:var(--text-secondary)]">
        Start with what you're working on — a thesis, essay, article, proposal, or professional document. Scholar Core
        builds the structure and research workflow around it.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-5 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
      >
        Create your first project
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
          ← Back to your command center
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
                    <option key={t.id} value={t.id} disabled={!t.available}>
                      {t.available ? t.label : `${t.label} — Under maintenance`}
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
