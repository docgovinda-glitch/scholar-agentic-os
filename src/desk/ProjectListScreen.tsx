import { useCallback, useEffect, useMemo, useState } from "react";
import { createProject, listOutputTypes, listProjects, deleteProject } from "./api";
import { getSupabaseClient } from "../services/supabaseClient";
import { hasVaultPassphraseOnThisDevice } from "../services/userVault";
import { syncActiveSessionToRegistry } from "../services/auth/multiAccountService";
import type { OutputTypeSummary, ProjectView } from "./types";
import ScholarCoreLogo from "../components/ScholarCoreLogo";
import UserAccountMenu from "./components/UserAccountMenu";

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
  onOpenAgents,
  showWelcome,
  onWelcomeSeen,
}: {
  onOpen: (projectId: string) => void;
  userEmail: string | null;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  onOpenAgents?: () => void;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (showWelcome) onWelcomeSeen?.();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const load = useCallback(() => {
    setError(null);
    listProjects()
      .then((r) => setProjects(r.items))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    load();
    syncActiveSessionToRegistry();
  }, [load]);

  // Load output types lazily when user clicks New Project
  useEffect(() => {
    if (!choosing || types !== null) return;
    let active = true;
    listOutputTypes()
      .then((r) => {
        if (active) setTypes(r.items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [choosing, types]);

  const typeMap = useMemo(() => {
    const map = new Map<string, OutputTypeSummary>();
    if (types) {
      for (const t of types) {
        map.set(t.id, t);
      }
    }
    return map;
  }, [types]);

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
    if (!confirm("Are you sure you want to delete this research project?")) return;
    setError(null);
    try {
      await deleteProject(projectId);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSignOut() {
    const confirmed = window.confirm("Sign out of Scholar Core?");
    if (!confirmed) return;
    getSupabaseClient().auth.signOut();
  }

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter((p) => {
      const title = p.answers?.title || p.answers?.research_question || "";
      const label = typeMap.get(p.outputTypeId)?.label || p.outputTypeId;
      return title.toLowerCase().includes(q) || label.toLowerCase().includes(q) || p.outputTypeId.toLowerCase().includes(q);
    });
  }, [projects, searchQuery, typeMap]);

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] relative overflow-x-hidden font-sans selection:bg-[color:var(--accent-subtle)]">
      {/* Background ambient lighting */}
      <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] bg-[color:var(--accent-subtle)] blur-[140px] rounded-full pointer-events-none -z-10 opacity-70" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[500px] h-[500px] bg-[color:var(--state-info-subtle)] blur-[150px] rounded-full pointer-events-none -z-10 opacity-60" />

      {/* Top Header */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
          scrolled
            ? "bg-[color:var(--surface-raised)]/90 backdrop-blur-xl border-b border-[color:var(--border-subtle)] shadow-xs py-3"
            : "bg-transparent py-4 md:py-5"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[color:var(--accent)] text-white flex items-center justify-center shadow-xs">
              <ScholarCoreLogo size="md" className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-[color:var(--text-primary)] leading-none">
                Scholar Core
              </span>
              <span className="text-[11px] font-semibold text-[color:var(--text-muted)] tracking-wider uppercase mt-0.5">
                Command Center
              </span>
            </div>
          </div>

          {/* Desktop Nav Actions */}
          <div className="hidden md:flex items-center gap-2">
            {onOpenVault && (
              <button
                onClick={onOpenVault}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-raised)] border border-transparent hover:border-[color:var(--border-subtle)] transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Knowledge Vault
              </button>
            )}
            {onOpenAgents && (
              <button
                onClick={onOpenAgents}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-raised)] border border-transparent hover:border-[color:var(--border-subtle)] transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                Editorial Agents
              </button>
            )}
            {onOpenAiAccess && (
              <button
                onClick={onOpenAiAccess}
                aria-label="Manage AI Access"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-raised)] border border-transparent hover:border-[color:var(--border-subtle)] transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 text-[color:var(--state-info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                AI Access
              </button>
            )}
            {onOpenAccountSettings && (
              <button
                onClick={onOpenAccountSettings}
                aria-label="Account Settings"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-raised)] border border-transparent hover:border-[color:var(--border-subtle)] transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 text-[color:var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
            )}

            <div className="h-5 w-[1px] bg-[color:var(--border-subtle)] mx-1" />

            {/* Multi-Account User Dropdown */}
            <UserAccountMenu
              userEmail={userEmail}
              onOpenAccountSettings={onOpenAccountSettings}
              onOpenVault={onOpenVault}
              onOpenAiAccess={onOpenAiAccess}
            />
          </div>

          {/* Mobile Menu Trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[color:var(--surface-raised)] border-b border-[color:var(--border-subtle)] px-6 py-4 flex flex-col gap-2 animate-fade-in shadow-xl">
            {onOpenVault && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenVault();
                }}
                className="text-left py-2 text-sm font-medium"
              >
                Knowledge Vault
              </button>
            )}
            {onOpenAgents && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAgents();
                }}
                className="text-left py-2 text-sm font-medium"
              >
                Editorial Agents
              </button>
            )}
            {onOpenAiAccess && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAiAccess();
                }}
                className="text-left py-2 text-sm font-medium"
              >
                AI Access
              </button>
            )}
            {onOpenAccountSettings && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAccountSettings();
                }}
                className="text-left py-2 text-sm font-medium"
              >
                Settings
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="text-left py-2 text-sm font-semibold text-[color:var(--state-danger)] border-t border-[color:var(--border-subtle)] mt-2 pt-3"
            >
              Sign Out
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 md:px-8 pt-28 pb-20 animate-fade-in">
        {/* Welcome Banner for first-time / newly onboarded users */}
        {welcomeVisible && (
          <div className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] px-6 py-4 shadow-xs animate-fade-in">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[color:var(--accent)] text-white flex items-center justify-center flex-shrink-0">
                <ScholarCoreLogo size="sm" className="text-white" />
              </div>
              <div>
                <p className="text-base font-bold text-[color:var(--text-primary)]">Welcome to your Command Center</p>
                <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                  Initialize a new manuscript, upload reference PDFs to your Vault, or configure your editorial agents.
                </p>
              </div>
            </div>
            <button
              aria-label="Dismiss"
              onClick={() => setWelcomeVisible(false)}
              className="p-1 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-raised)] transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-8 rounded-2xl border border-[color:var(--state-danger-subtle)] bg-[color:var(--state-danger-subtle)] px-6 py-4 text-[color:var(--state-danger)] text-sm shadow-xs flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-semibold">{error}</span>
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
            {/* Researcher Pulse Hub */}
            <section className="mb-10">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[color:var(--text-primary)]">
                    Research Command Center
                  </h1>
                  <p className="text-sm text-[color:var(--text-secondary)] mt-1">
                    Active academic manuscripts, evidence ledgers, and multi-agent pipelines.
                  </p>
                </div>
                {projects && projects.length > 0 && (
                  <button
                    onClick={() => setChoosing(true)}
                    className="px-6 py-3 rounded-xl text-sm font-bold bg-[color:var(--accent-solid)] text-white hover:bg-[color:var(--accent-hover)] shadow-xs transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    New Project
                  </button>
                )}
              </div>

              {/* Quick Researcher Hub Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div
                  onClick={onOpenVault}
                  className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--state-success)] hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--state-success)] bg-[color:var(--state-success-subtle)] px-2 py-0.5 rounded">
                      Local Vault
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-[color:var(--text-primary)] group-hover:text-[color:var(--state-success)] transition-colors">
                      Knowledge Vault
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">Central verified PDF evidence</p>
                  </div>
                </div>

                <div
                  onClick={() => setChoosing(true)}
                  className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--accent)] hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)] bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded">
                      {projects ? `${projects.length} Active` : "Loading..."}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-[color:var(--text-primary)] group-hover:text-[color:var(--accent)] transition-colors">
                      Manuscripts
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">24 Supported Formats</p>
                  </div>
                </div>

                <div
                  onClick={onOpenAgents}
                  className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--state-info)] hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-[color:var(--state-info-subtle)] text-[color:var(--state-info)] flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--state-info)] bg-[color:var(--state-info-subtle)] px-2 py-0.5 rounded">
                      4 Agents
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-[color:var(--text-primary)] group-hover:text-[color:var(--state-info)] transition-colors">
                      Editorial Agents
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">Methodologist & Auditor</p>
                  </div>
                </div>

                <div
                  onClick={onOpenAiAccess}
                  className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--border-strong)] hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] bg-[color:var(--surface-inset)] px-2 py-0.5 rounded">
                      BYOK & Local
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-[color:var(--text-primary)] group-hover:text-[color:var(--accent)] transition-colors">
                      AI Models
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">Routing & Engine Settings</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Project List Section with Live Search */}
            <section>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[color:var(--border-subtle)]">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-6 bg-[color:var(--accent)] rounded-full" />
                  <h2 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
                    Active Manuscripts
                  </h2>
                  {projects && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)]">
                      {projects.length}
                    </span>
                  )}
                </div>

                {/* Search Bar */}
                {projects && projects.length > 0 && (
                  <div className="relative w-full sm:w-72">
                    <input
                      type="text"
                      placeholder="Search manuscripts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] pl-9 pr-4 py-2 text-xs font-medium text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--accent)] transition-all"
                    />
                    <svg className="w-4 h-4 text-[color:var(--text-muted)] absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                )}
              </div>

              {projects === null ? (
                error ? (
                  <div className="flex flex-col justify-center items-center py-20 text-center">
                    <div className="w-12 h-12 rounded-full bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] flex items-center justify-center mb-4">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-[color:var(--text-primary)] mb-1">Failed to load manuscripts</p>
                    <p className="text-xs text-[color:var(--text-secondary)] max-w-sm mb-4">{error}</p>
                    <button
                      onClick={load}
                      className="px-5 py-2.5 rounded-xl bg-[color:var(--accent-solid)] text-white text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center items-center py-24">
                    <div className="w-10 h-10 border-3 border-[color:var(--border-subtle)] border-t-[color:var(--accent)] rounded-full animate-spin mb-4" />
                    <span className="text-xs font-medium text-[color:var(--text-muted)]">Loading your manuscripts...</span>
                  </div>
                )
              ) : projects.length === 0 ? (
                <EmptyState onStart={() => setChoosing(true)} />
              ) : filteredProjects.length === 0 ? (
                <div className="p-12 text-center rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
                  <p className="text-sm font-semibold text-[color:var(--text-primary)]">No manuscripts match "{searchQuery}"</p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-3 text-xs font-bold text-[color:var(--accent)] hover:underline cursor-pointer"
                  >
                    Clear search filter
                  </button>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-5">
                  {filteredProjects.map((p) => (
                    <ProjectCard
                      key={p.projectId}
                      project={p}
                      typeSummary={typeMap.get(p.outputTypeId)}
                      onOpen={() => onOpen(p.projectId)}
                      onDelete={(e) => handleDelete(p.projectId, e)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ProjectCard({
  project,
  typeSummary,
  onOpen,
  onDelete,
}: {
  project: ProjectView;
  typeSummary?: OutputTypeSummary;
  onOpen: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}) {
  const percent = Math.round((project.intakeCompleteness || 0) * 100);
  const signedOff = project.gates?.filter((g) => g.status === "signed_off").length || 0;
  const totalGates = project.gates?.length || 5;

  // Title resolution
  const displayTitle =
    project.answers?.title?.trim() ||
    project.answers?.research_question?.trim() ||
    project.answers?.topic?.trim() ||
    typeSummary?.label ||
    project.outputTypeId;

  const typeLabel = typeSummary?.label || project.outputTypeId;

  return (
    <div className="relative group">
      <button
        onClick={onOpen}
        className="w-full text-left p-6 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--accent-border)] hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer min-h-[220px]"
      >
        <div>
          {/* Card Top Metadata */}
          <div className="flex items-center justify-between gap-2 mb-3 pr-8">
            <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)]">
              {typeLabel}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                project.hasDocument
                  ? "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]"
                  : "bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)]"
              }`}
            >
              {project.hasDocument ? "Drafting Stage" : "Evidence Intake"}
            </span>
          </div>

          {/* Project Title */}
          <h3 className="text-lg font-bold text-[color:var(--text-primary)] group-hover:text-[color:var(--accent)] transition-colors leading-snug line-clamp-2 mb-2">
            {displayTitle}
          </h3>

          <p className="text-xs text-[color:var(--text-secondary)] font-medium">
            {signedOff} of {totalGates} quality gates verified
          </p>
        </div>

        {/* Bottom Progress Indicator */}
        <div className="mt-5 pt-4 border-t border-[color:var(--border-subtle)]">
          <div className="flex justify-between text-[11px] font-semibold text-[color:var(--text-secondary)] mb-1.5">
            <span>Workflow Completion</span>
            <span className="text-[color:var(--text-primary)] font-mono">{percent}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[color:var(--surface-sunken)] overflow-hidden">
            <div
              className="h-full bg-[color:var(--accent-solid)] transition-all duration-500 rounded-full"
              style={{ width: `${Math.max(percent, 5)}%` }}
            />
          </div>
        </div>
      </button>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-5 right-5 z-20 w-8 h-8 rounded-lg bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] text-[color:var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] hover:border-[color:var(--state-danger)] transition-all flex items-center justify-center cursor-pointer shadow-xs"
          title="Delete Manuscript"
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
    <div className="rounded-3xl border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] px-6 py-20 text-center flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)] flex items-center justify-center mb-6">
        <ScholarCoreLogo size="lg" className="text-[color:var(--accent)]" />
      </div>
      <h3 className="text-2xl font-black text-[color:var(--text-primary)] mb-2">
        Initialize your first project
      </h3>
      <p className="max-w-md text-sm text-[color:var(--text-secondary)] mb-8 leading-relaxed">
        Choose from 24 publication formats, connect your Knowledge Vault, and let the multi-agent editorial board assist you.
      </p>
      <button
        onClick={onStart}
        className="rounded-xl bg-[color:var(--accent-solid)] px-6 py-3 text-sm font-bold text-white transition-all hover:bg-[color:var(--accent-hover)] hover:scale-105 shadow-xs flex items-center gap-2 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        New Project
      </button>
    </div>
  );
}

/** Curated 6 essential academic formats requested by user */
const FORMAT_TILES = [
  {
    id: "OT-01",
    label: "Assignment",
    icon: "📝",
    tag: "Coursework & Essays",
    description: "Dedicated 8-phase thinking, evidence board & grounded drafting.",
    budget: "800 – 4,000 words",
  },
  {
    id: "OT-10",
    label: "Journal Article",
    icon: "📄",
    tag: "Peer-Reviewed Papers",
    description: "25-stage empirical research pipeline with multi-agent peer review.",
    budget: "4,000 – 10,000 words",
  },
  {
    id: "OT-09",
    label: "Thesis / Dissertation",
    icon: "🎓",
    tag: "Milestones & Defense",
    description: "Comprehensive multi-chapter dissertation and thesis framework.",
    budget: "10,000 – 80,000 words",
  },
  {
    id: "OT-19",
    label: "Research Proposal",
    icon: "💡",
    tag: "Grants & Funding",
    description: "Competitive grant applications with strict agency rubric alignment.",
    budget: "3,000 – 15,000 words",
  },
  {
    id: "OT-22",
    label: "Presentation",
    icon: "📊",
    tag: "Slides & Keynotes",
    description: "Conference slide decks, oral defense scripts & visual narratives.",
    budget: "10 – 35 slides",
  },
  {
    id: "OT-07",
    label: "Text Humanizer",
    icon: "✨",
    tag: "Language & Voice",
    description: "Stylometric tone calibration, voice profiling & AI text polish.",
    budget: "Section-by-section",
  },
];

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

  const selectedSummary = useMemo(() => {
    if (!types || !selected) return null;
    return types.find((t) => t.id === selected) ?? null;
  }, [types, selected]);

  return (
    <div className="max-w-4xl mx-auto py-6 animate-fade-in">
      <button
        onClick={onCancel}
        className="mb-8 inline-flex items-center gap-2 text-xs font-bold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors px-3.5 py-2 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] cursor-pointer shadow-xs"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Return to Command Center
      </button>

      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-[color:var(--text-primary)] mb-2">
          Select Output Format
        </h2>
        <p className="text-sm text-[color:var(--text-secondary)]">
          Select the dedicated academic workspace to initialize for your research project.
        </p>
      </div>

      {!types ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-3 border-[color:var(--border-subtle)] border-t-[color:var(--accent)] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Accessible hidden select to ensure test & screen reader compatibility */}
          <select
            id="output-type"
            aria-label="Target Publication Type"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="sr-only"
          >
            <option value="" disabled>Choose a format...</option>
            {FORMAT_TILES.map((tile) => (
              <option key={tile.id} value={tile.id}>
                {tile.label}
              </option>
            ))}
            {/* Preserve any extra test types */}
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Interactive Format Tiles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FORMAT_TILES.map((tile) => {
              const isSelected = selected === tile.id;

              return (
                <div
                  key={tile.id}
                  onClick={() => setSelected(tile.id)}
                  onDoubleClick={() => onPick(tile.id)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group text-left ${
                    isSelected
                      ? "border-[color:var(--accent)] bg-[color:var(--surface-canvas)] shadow-md ring-2 ring-[color:var(--accent)]/30 scale-[1.02]"
                      : "border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--accent-border)] hover:bg-[color:var(--surface-hover)]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] flex items-center justify-center text-xl">
                        {tile.icon}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">
                          {tile.id}
                        </span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center text-xs font-bold">
                            ✓
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-bold text-base text-[color:var(--text-primary)] group-hover:text-[color:var(--accent)] transition-colors mb-1">
                      {tile.label}
                    </h3>
                    <span className="inline-block text-[10px] font-semibold text-[color:var(--accent)] mb-2">
                      {tile.tag}
                    </span>
                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed mb-3">
                      {tile.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-between text-[11px] font-mono text-[color:var(--text-muted)]">
                    <span>Target: {tile.budget}</span>
                    <span className="text-[color:var(--state-success)] font-bold">Ready</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-end">
            <button
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto rounded-xl bg-[color:var(--accent-solid)] px-8 py-3.5 text-sm font-bold text-white transition-all hover:bg-[color:var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Initializing Workspace...
                </>
              ) : (
                <>
                  {selected ? `Boot ${FORMAT_TILES.find((t) => t.id === selected)?.label || "Workspace"}` : "Select a Format to Boot"}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer info banner */}
      <footer className="mt-12 py-4 px-6 text-center text-xs text-[color:var(--text-muted)] border-t border-[color:var(--border-subtle)]">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6">
          <span className="flex items-center gap-1.5">
            <span>☁️</span>
            <strong className="font-medium text-[color:var(--text-secondary)]">Projects</strong>
            <span>— synced to your account</span>
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-[color:var(--border-default)]">|</span>
          <span className="flex items-center gap-1.5">
            <span>🔒</span>
            <strong className="font-medium text-[color:var(--text-secondary)]">Private Vault</strong>
            <span>— stored locally in this browser</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
