import { useCallback, useEffect, useMemo, useState } from "react";
import { createProject, listOutputTypes, listProjects } from "./api";
import { getSupabaseClient } from "../services/supabaseClient";
import type { OutputTypeSummary, ProjectView } from "./types";
import ScholarCoreLogo from "../components/ScholarCoreLogo";

/**
 * Desk's entry surface: the signed-in user's own projects — transformed into
 * the SCHOLAR CORE Research Command Center.
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
  showWelcome?: boolean;
  onWelcomeSeen?: () => void;
}) {
  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(() => showWelcome ?? false);

  useEffect(() => {
    if (showWelcome) onWelcomeSeen?.();
  }, []);

  const load = useCallback(() => {
    listProjects()
      .then((r) => setProjects(r.items))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

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
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] relative overflow-hidden font-sans">
      
      {/* Dynamic Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20 pointer-events-none" 
           style={{ background: 'radial-gradient(ellipse at top, var(--accent) 0%, transparent 70%)', filter: 'blur(100px)' }} />

      {/* Header with SCHOLAR CORE branding and navigation */}
      <header className="relative z-10 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)]/80 backdrop-blur-md sticky top-0">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <ScholarCoreLogo size="md" withText className="text-[color:var(--text-primary)]" />
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              {userEmail && (
                <span className="truncate text-sm text-[color:var(--text-muted)] hidden sm:block font-medium" title={userEmail}>
                  {userEmail}
                </span>
              )}
              {onOpenVault && (
                <button
                  type="button"
                  onClick={onOpenVault}
                  className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition-all duration-300 hover:bg-[color:var(--surface-raised)] hover:text-[color:var(--text-primary)] hover:shadow-sm cursor-pointer border border-transparent hover:border-[color:var(--border-subtle)]"
                >
                  Knowledge
                </button>
              )}
              {onOpenAiAccess && (
                <button
                  type="button"
                  onClick={onOpenAiAccess}
                  className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition-all duration-300 hover:bg-[color:var(--surface-raised)] hover:text-[color:var(--text-primary)] hover:shadow-sm cursor-pointer border border-transparent hover:border-[color:var(--border-subtle)]"
                >
                  AI
                </button>
              )}
              {onOpenAccountSettings && (
                <button
                  type="button"
                  onClick={onOpenAccountSettings}
                  className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition-all duration-300 hover:bg-[color:var(--surface-raised)] hover:text-[color:var(--text-primary)] hover:shadow-sm cursor-pointer border border-transparent hover:border-[color:var(--border-subtle)]"
                >
                  Account
                </button>
              )}
              <button
                type="button"
                onClick={() => getSupabaseClient().auth.signOut()}
                className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-[color:var(--state-danger)] transition-all duration-300 hover:bg-[color:var(--state-danger-subtle)] cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-12 animate-fade-in">
        {welcomeVisible && (
          <div
            role="status"
            className="mb-10 flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)]/50 backdrop-blur-md px-6 py-4 shadow-sm"
          >
            <div>
              <p className="text-base font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[color:var(--state-success)] animate-pulse" />
                Welcome to Scholar Core
              </p>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                Your research command center is ready. Start a new project or explore your research tools.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWelcomeVisible(false)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-10 rounded-[var(--radius-lg)] border border-[color:var(--state-danger)]/30 bg-[color:var(--state-danger-subtle)]/80 backdrop-blur-md px-5 py-4 text-sm font-medium text-[color:var(--state-danger)] shadow-sm flex items-center gap-3"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
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
            <section className="mb-16">
              <h1 className="text-3xl font-bold tracking-tight mb-2">Command Center</h1>
              <p className="text-base text-[color:var(--text-secondary)] mb-8">
                Connect research, knowledge, and creation in one workspace. Use the tools below to organize your research.
              </p>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <CapabilityCard
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  }
                  title="Projects"
                  desc="Create and work on research projects, theses, essays, and articles."
                  action="See projects below"
                />
                <CapabilityCard
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  }
                  title="Knowledge Vault"
                  desc="Store, organize, and access all your verified research materials."
                  action="Open Vault"
                  onClick={onOpenVault}
                />
                <CapabilityCard
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  }
                  title="AI Assistance"
                  desc="Configure intelligent agents to analyze and summarize information."
                  action="Manage AI"
                  onClick={onOpenAiAccess}
                />
                <CapabilityCard
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  }
                  title="Settings"
                  desc="Manage your account, profile, subscription, and preferences."
                  action="Account Settings"
                  onClick={onOpenAccountSettings}
                />
              </div>
            </section>

            {/* Projects section */}
            <div className="mb-8 flex items-center justify-between gap-4 border-b border-[color:var(--border-subtle)] pb-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
                  Your Projects
                </h2>
                <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  Everything you are working on, most recent first.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChoosing(true)}
                className="shrink-0 rounded-full bg-[color:var(--accent-solid)] px-6 py-2.5 text-sm font-semibold text-[color:var(--text-inverse)] transition-all duration-300 hover:bg-[color:var(--accent-hover)] hover:scale-105 hover:shadow-[0_0_15px_var(--accent)] cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                New project
              </button>
            </div>

            {projects === null ? (
              <div className="flex justify-center items-center py-20">
                 <div className="spinner" />
              </div>
            ) : projects.length === 0 ? (
              <EmptyState onStart={() => setChoosing(true)} />
            ) : (
              <ul className="grid gap-4">
                {projects.map((p) => (
                  <li key={p.projectId} className="animate-fade-in">
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
  icon: React.ReactNode;
  title: string;
  desc: string;
  action: string;
  onClick?: () => void;
}) {
  return (
    <div className="group relative p-6 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]/80 backdrop-blur-sm transition-all duration-300 hover:border-[color:var(--accent)] hover:shadow-lg hover:-translate-y-1 flex flex-col h-full">
      <div className="text-[color:var(--accent)] mb-4 w-12 h-12 rounded-[var(--radius-md)] bg-[color:var(--accent-subtle)] flex items-center justify-center border border-[color:var(--accent-border)] group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-sm text-[color:var(--text-secondary)] mb-6 flex-grow leading-relaxed">{desc}</p>
      
      {onClick ? (
        <button
          onClick={onClick}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] transition-colors cursor-pointer mt-auto"
        >
          {action}
          <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      ) : (
        <p className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--text-muted)] mt-auto">
          {action}
        </p>
      )}
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
      className="group w-full rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]/60 backdrop-blur-sm p-5 text-left transition-all duration-300 hover:border-[color:var(--accent)] hover:shadow-md cursor-pointer relative overflow-hidden"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[color:var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-[color:var(--text-primary)] group-hover:text-[color:var(--accent)] transition-colors">
          {project.outputTypeId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
        </h3>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${project.hasDocument ? 'bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]/20' : 'bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)]'}`}>
          {project.hasDocument ? "Draft in progress" : "No draft yet"}
        </span>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
           <div className="w-16 h-1.5 rounded-full bg-[color:var(--surface-sunken)] overflow-hidden">
             <div className="h-full bg-[color:var(--accent)] transition-all duration-500" style={{ width: `${percent}%` }} />
           </div>
           <span className="text-xs font-medium text-[color:var(--text-secondary)]">{percent}% of intake</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[color:var(--text-secondary)]">
           <svg className="w-3.5 h-3.5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           {signedOff} of {project.gates.length} gates passed
        </div>
      </div>
    </button>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-[var(--radius-lg)] border-2 border-dashed border-[color:var(--border-default)] bg-[color:var(--surface-raised)]/30 backdrop-blur-sm px-6 py-16 text-center transition-all hover:border-[color:var(--accent)]/50 hover:bg-[color:var(--surface-raised)]/50">
      <div className="w-16 h-16 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center mx-auto mb-6">
         <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
         </svg>
      </div>
      <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-2">No projects yet</h3>
      <p className="mx-auto max-w-md text-sm text-[color:var(--text-secondary)] mb-8 leading-relaxed">
        Start with what you're working on — a thesis, essay, article, proposal, or professional document. Scholar Core
        builds the structure and research workflow around it.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="rounded-full bg-[color:var(--accent-solid)] px-6 py-3 text-sm font-bold text-[color:var(--text-inverse)] transition-all duration-300 hover:bg-[color:var(--accent-hover)] hover:shadow-[0_0_15px_var(--accent)] hover:scale-105 cursor-pointer inline-flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        Create your first project
      </button>
    </div>
  );
}

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
    <div className="max-w-2xl mx-auto py-10 animate-fade-in">
      <button
        type="button"
        onClick={onCancel}
        className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)] transition-colors duration-300 hover:text-[color:var(--accent-hover)] cursor-pointer bg-[color:var(--accent-subtle)] px-4 py-2 rounded-full border border-[color:var(--accent-border)]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to command center
      </button>
      
      <div className="mb-10">
        <h2 className="text-3xl font-bold tracking-tight text-[color:var(--text-primary)] mb-3">
          What are you producing?
        </h2>
        <p className="text-base text-[color:var(--text-secondary)]">
          This sets the structure, the intake questions, and the formatting rules. You can change it later.
        </p>
      </div>

      {!types ? (
        <div className="flex items-center gap-3 text-sm text-[color:var(--text-muted)] font-medium">
          <div className="spinner !w-5 !h-5 !border-2" />
          Loading output types…
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]/80 backdrop-blur-sm p-8 shadow-lg">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="output-type" className="text-sm font-bold text-[color:var(--text-primary)]">
                Select a document format
              </label>
              <div className="relative">
                <select
                  id="output-type"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="w-full appearance-none rounded-[var(--radius-md)] border-2 border-[color:var(--border-default)] bg-[color:var(--surface-inset)] px-4 py-3.5 text-base font-medium text-[color:var(--text-primary)] outline-none transition-all focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-subtle)]"
                >
                  <option value="" disabled>
                    Choose a document type…
                  </option>
                  {groups.map(([family, items]) => (
                    <optgroup key={family} label={FAMILY_LABEL[family] ?? family} className="font-bold text-[color:var(--text-muted)]">
                      {items.map((t) => (
                        <option key={t.id} value={t.id} disabled={!t.available} className="font-medium text-[color:var(--text-primary)]">
                          {t.available ? t.label : `${t.label} — Under maintenance`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[color:var(--text-secondary)]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto self-end rounded-full bg-[color:var(--accent-solid)] px-8 py-3.5 text-base font-bold text-[color:var(--text-inverse)] transition-all duration-300 hover:bg-[color:var(--accent-hover)] hover:shadow-[0_0_15px_var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none cursor-pointer flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <div className="spinner !w-4 !h-4 !border-2 !border-t-transparent !border-white" />
                  Creating workspace…
                </>
              ) : (
                <>
                  Initialize Project
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
