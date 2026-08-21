import { useCallback, useEffect, useMemo, useState } from "react";
import { createProject, listOutputTypes, listProjects, deleteProject } from "./api";
import { getSupabaseClient } from "../services/supabaseClient";
import { hasVaultPassphraseOnThisDevice } from "../services/userVault";
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (showWelcome) onWelcomeSeen?.();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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

  async function handleDelete(projectId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project?")) return;
    setError(null);
    try {
      await deleteProject(projectId);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // P0-3: Vault-aware sign-out — remind the user that the Vault stays in this
  // browser and does not follow their account to other devices.
  async function handleSignOut() {
    const vaultOnThisDevice = await hasVaultPassphraseOnThisDevice();
    if (vaultOnThisDevice) {
      const confirmed = window.confirm(
        "Sign out of Scholar?\n\n" +
        "Your Projects are synced to your account and will be available when you sign back in.\n\n" +
        "Your private Knowledge Vault is stored in this browser only and does not sync to other devices. " +
        "It will remain here, but it will not be available if you sign in on a different browser or device."
      );
      if (!confirmed) return;
    }
    getSupabaseClient().auth.signOut();
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] relative overflow-hidden font-sans selection:bg-[color:var(--accent-subtle)]">
      
      {/* Dynamic Background Effects */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[color:var(--accent-subtle)] blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[60%] bg-[color:var(--state-info-subtle)] blur-[150px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[color:var(--surface-raised)]/90 backdrop-blur-xl border-b border-[color:var(--border-subtle)] shadow-sm py-3' : 'bg-transparent py-6'}`}>
        <div className="mx-auto max-w-7xl px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[color:var(--accent)] shadow-sm">
              <span className="text-[color:var(--text-inverse)] font-bold text-xl font-serif">S</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-[color:var(--text-primary)]">
              Scholar Core
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {userEmail && (
              <span className="truncate text-sm text-[color:var(--text-secondary)] hidden sm:block font-medium px-4 py-1.5 rounded-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]">
                {userEmail}
              </span>
            )}
            <div className="flex items-center gap-1 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-full p-1 shadow-sm">
              {onOpenVault && (
                <button
                  onClick={onOpenVault}
                  className="px-4 py-1.5 text-sm font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] rounded-full transition-all"
                  title="Private Knowledge Vault — stored in this browser, not synced"
                >
                  Private Vault
                </button>
              )}
              {onOpenAiAccess && (
                <button onClick={onOpenAiAccess} className="px-4 py-1.5 text-sm font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] rounded-full transition-all">
                  Agents
                </button>
              )}
              {onOpenAccountSettings && (
                <button onClick={onOpenAccountSettings} className="px-4 py-1.5 text-sm font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] rounded-full transition-all">
                  Settings
                </button>
              )}
            </div>
            <button
              onClick={handleSignOut}
              aria-label="Sign out"
              className="ml-2 rounded-full w-10 h-10 flex items-center justify-center bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger)] hover:text-[color:var(--text-inverse)] transition-colors border border-[color:var(--state-danger-subtle)]"
              title="Sign out"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-36 pb-24 animate-fade-in">
        {welcomeVisible && (
          <div className="mb-12 flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] px-6 py-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[color:var(--surface-raised)] flex items-center justify-center border border-[color:var(--accent-border)]">
                 <svg className="w-6 h-6 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              </div>
              <div>
                <p className="text-lg font-bold text-[color:var(--text-primary)]">Welcome to your Command Center</p>
                <p className="text-[color:var(--text-secondary)] text-sm mt-1">Initialize a new project or explore your agentic tools.</p>
              </div>
            </div>
            <button
              aria-label="Dismiss"
              onClick={() => setWelcomeVisible(false)}
              className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {error && (
          <div className="mb-12 rounded-2xl border border-[color:var(--state-danger-subtle)] bg-[color:var(--state-danger-subtle)] px-6 py-5 text-[color:var(--state-danger)] shadow-sm flex items-center gap-4">
            <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">{error}</span>
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
            {/* Command Center Widgets */}
            <section className="mb-20">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <h1 className="text-4xl font-black tracking-tight mb-2 text-[color:var(--text-primary)]">Workspace Modules</h1>
                  <p className="text-[color:var(--text-secondary)] text-lg">Your agentic tools and active research environments.</p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <CapabilityCard
                  icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  title="Projects"
                  desc="Active research workflows and manuscripts."
                  action="Scroll to View"
                  bg="bg-[color:var(--state-info-subtle)]"
                  iconColor="text-[color:var(--state-info)]"
                />
                <CapabilityCard
                  icon="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                  title="Knowledge Vault"
                  desc="Your verified central library of PDFs and evidence."
                  action="Open Vault"
                  onClick={onOpenVault}
                  bg="bg-[color:var(--state-success-subtle)]"
                  iconColor="text-[color:var(--state-success)]"
                />
                <CapabilityCard
                  icon="M13 10V3L4 14h7v7l9-11h-7z"
                  title="AI Agents"
                  desc="Configure extraction and synthesis models."
                  action="Manage AI"
                  onClick={onOpenAiAccess}
                  bg="bg-[color:var(--accent-subtle)]"
                  iconColor="text-[color:var(--accent)]"
                />
                <CapabilityCard
                  icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  title="Settings"
                  desc="Account, subscription, and system preferences."
                  action="Configure"
                  onClick={onOpenAccountSettings}
                  bg="bg-[color:var(--surface-sunken)]"
                  iconColor="text-[color:var(--text-secondary)]"
                />
              </div>
            </section>

            {/* Projects Section */}
            <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[color:var(--border-subtle)] pb-6">
              <h2 className="text-3xl font-bold tracking-tight text-[color:var(--text-primary)] flex items-center gap-3">
                <div className="w-2 h-8 bg-[color:var(--accent)] rounded-full"></div>
                Active Workflows
              </h2>
              <button
                onClick={() => setChoosing(true)}
                className="group relative px-6 py-3 rounded-xl font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] shadow-md hover:bg-[color:var(--accent-hover)] transition-all hover:scale-105 w-full sm:w-auto"
              >
                <span className="relative flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  Initialize Project
                </span>
              </button>
            </div>

            {projects === null ? (
              <div className="flex justify-center items-center py-32">
                 <div className="w-12 h-12 border-4 border-[color:var(--border-subtle)] border-t-[color:var(--accent)] rounded-full animate-spin"></div>
              </div>
            ) : projects.length === 0 ? (
              <EmptyState onStart={() => setChoosing(true)} />
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {projects.map((p) => (
                  <ProjectCard key={p.projectId} project={p} onOpen={() => onOpen(p.projectId)} onDelete={(e) => handleDelete(p.projectId, e)} />
                ))}
              </div>
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
  bg,
  iconColor,
}: {
  icon: string;
  title: string;
  desc: string;
  action: string;
  onClick?: () => void;
  bg: string;
  iconColor: string;
}) {
  return (
    <div 
      className={`group relative p-8 rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] transition-all duration-300 hover:border-[color:var(--border-strong)] hover:shadow-lg flex flex-col h-full overflow-hidden ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={title}
    >
      <div className={`w-14 h-14 rounded-2xl ${bg} border border-[color:var(--border-subtle)] flex items-center justify-center mb-6 relative z-10 transition-colors`}>
        <svg className={`w-7 h-7 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <h3 className="font-bold text-2xl mb-3 text-[color:var(--text-primary)] relative z-10">{title}</h3>
      <p className="text-[color:var(--text-secondary)] mb-8 flex-grow leading-relaxed relative z-10">{desc}</p>
      
      <div className="mt-auto relative z-10 pt-4 border-t border-[color:var(--border-subtle)]">
        {onClick ? (
          <button
            onClick={onClick}
            className={`inline-flex items-center justify-between w-full font-bold ${iconColor} hover:text-[color:var(--accent)] transition-colors cursor-pointer`}
          >
            {action}
            <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center group-hover:bg-[color:var(--surface-sunken)] group-hover:translate-x-1 transition-all`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </div>
          </button>
        ) : (
          <p className="inline-flex items-center text-sm font-medium text-[color:var(--text-muted)]">
            {action}
          </p>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, onOpen, onDelete }: { project: ProjectView; onOpen: () => void; onDelete?: (e: React.MouseEvent) => void }) {
  const percent = Math.round(project.intakeCompleteness * 100);
  const signedOff = project.gates.filter((g) => g.status === "signed_off").length;

  return (
    <div className="relative group">
      <button
        onClick={onOpen}
        className="w-full h-full text-left p-8 rounded-[2rem] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)] transition-all duration-300 hover:border-[color:var(--accent-border)] hover:shadow-md relative overflow-hidden flex flex-col cursor-pointer"
      >
        <div className="flex items-start justify-between mb-6 relative z-10 pr-10">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-secondary)] group-hover:text-[color:var(--accent)] group-hover:border-[color:var(--accent-border)] group-hover:bg-[color:var(--accent-subtle)] transition-all">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${project.hasDocument ? 'bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]' : 'bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)]'}`}>
            {project.hasDocument ? "Drafting" : "Extraction"}
          </span>
        </div>

      <h3 className="text-2xl font-bold text-[color:var(--text-primary)] mb-2 relative z-10 group-hover:text-[color:var(--accent)] transition-colors">
        {project.outputTypeId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
      </h3>
      <p className="text-sm text-[color:var(--text-secondary)] mb-8 relative z-10">
        {signedOff} of {project.gates.length} approval gates passed
      </p>
      
        <div className="mt-auto relative z-10 bg-[color:var(--surface-inset)] p-4 rounded-xl border border-[color:var(--border-subtle)]">
          <div className="flex justify-between text-xs font-bold text-[color:var(--text-secondary)] mb-2">
             <span>Pipeline Completeness</span>
             <span className="text-[color:var(--text-primary)]">{percent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[color:var(--border-subtle)] overflow-hidden">
            <div className="h-full bg-[color:var(--accent)] transition-all duration-700 ease-out" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-8 right-8 z-20 w-8 h-8 rounded-full bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center hover:bg-[color:var(--state-danger)] hover:text-[color:var(--text-inverse)] shadow-sm"
          title="Delete Project"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] px-6 py-24 text-center transition-all hover:border-[color:var(--accent)] flex flex-col items-center">
      <div className="w-20 h-20 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center mb-8 border border-[color:var(--accent-border)]">
         <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
         </svg>
      </div>
      <h3 className="text-3xl font-bold text-[color:var(--text-primary)] mb-4">Initialize your first project</h3>
      <p className="max-w-md text-lg text-[color:var(--text-secondary)] mb-10 leading-relaxed">
        Start a new thesis, manuscript, or research proposal. The agents are ready to assist.
      </p>
      <button
        onClick={onStart}
        className="rounded-full bg-[color:var(--accent)] px-8 py-4 text-lg font-bold text-[color:var(--text-inverse)] transition-all hover:scale-105 hover:bg-[color:var(--accent-hover)] hover:shadow-md flex items-center gap-3 cursor-pointer"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
        New Project
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
    <div className="max-w-3xl mx-auto py-10 animate-fade-in">
      <button
        onClick={onCancel}
        className="mb-10 inline-flex items-center gap-2 text-sm font-bold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors px-4 py-2 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] cursor-pointer shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Return to Command Center
      </button>
      
      <div className="mb-12">
        <h2 className="text-4xl font-black tracking-tight text-[color:var(--text-primary)] mb-4">
          Select Output Format
        </h2>
        <p className="text-xl text-[color:var(--text-secondary)]">
          This initializes the specific agentic workflow, constraints, and journal requirements for your project.
        </p>
      </div>

      {!types ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-[color:var(--border-subtle)] border-t-[color:var(--accent)] rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="rounded-[2rem] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-10 shadow-lg">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <label htmlFor="output-type" className="text-sm font-bold text-[color:var(--text-secondary)] uppercase tracking-widest">
                Target Publication Type
              </label>
              <div className="relative">
                <select
                  id="output-type"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--surface-canvas)] px-6 py-5 text-lg font-bold text-[color:var(--text-primary)] outline-none transition-all focus:border-[color:var(--accent)] focus:bg-[color:var(--surface-raised)]"
                >
                  <option value="" disabled className="text-[color:var(--text-muted)]">
                    Choose a format...
                  </option>
                  {groups.map(([family, items]) => (
                    <optgroup key={family} label={FAMILY_LABEL[family] ?? family} className="bg-[color:var(--surface-raised)] text-[color:var(--accent)] font-bold p-2">
                      {items.map((t) => (
                        <option key={t.id} value={t.id} disabled={!t.available} className="bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] py-2">
                          {t.available ? t.label : `${t.label} (Maintenance)`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-6 text-[color:var(--text-muted)]">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
            <button
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto self-end rounded-xl bg-[color:var(--accent)] px-10 py-5 text-lg font-bold text-[color:var(--text-inverse)] transition-all hover:bg-[color:var(--accent-hover)] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer"
            >
              {creating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Initializing Agents...
                </>
              ) : (
                <>
                  Boot Workspace
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* P1-3: Projects vs Vault distinction — always visible so users understand
          that projects sync to their account but their private Vault does not. */}
      <footer className="relative z-10 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] py-4 px-6">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-center gap-6 text-xs text-[color:var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <span>☁️</span>
            <strong className="font-medium text-[color:var(--text-secondary)]">Projects</strong>
            <span>— synced to your Scholar account</span>
          </span>
          <span aria-hidden="true" className="text-[color:var(--border-default)]">|</span>
          <span className="flex items-center gap-1.5">
            <span>🔒</span>
            <strong className="font-medium text-[color:var(--text-secondary)]">Private Vault</strong>
            <span>— stored in this browser · not synced to other devices</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
