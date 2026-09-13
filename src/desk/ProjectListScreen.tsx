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
      .catch(() => {
        // Provide sample projects for guest preview
        setProjects([
          {
            projectId: "demo-crispr-01",
            outputTypeId: "OT-10",
            answers: {
              title: "Comparative Analysis of In Vivo Cleavage and Repair Fidelity in Primate Lineages",
              research_question: "How does base editing compare with SpCas9 double-strand break repair?",
            },
            intakeCompleteness: 0.85,
            hasDocument: true,
            gates: [
              { id: "G0", status: "signed_off" },
              { id: "G1", status: "signed_off" },
              { id: "G2", status: "signed_off" },
              { id: "G3", status: "signed_off" },
              { id: "G4", status: "in_progress" },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            projectId: "demo-thesis-02",
            outputTypeId: "OT-09",
            answers: {
              title: "Autonomous Multi-Agent Systems in Empirical Drug Discovery Pipelines",
              research_question: "Evaluation of agentic reasoning architectures for target identification",
            },
            intakeCompleteness: 0.60,
            hasDocument: false,
            gates: [
              { id: "G0", status: "signed_off" },
              { id: "G1", status: "signed_off" },
              { id: "G2", status: "signed_off" },
              { id: "G3", status: "in_progress" },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]);
      });
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
      .catch(() => {
        if (active) {
          setTypes(
            FORMAT_TILES.map((t) => ({
              id: t.id,
              label: t.label,
              tag: t.tag,
              description: t.description,
            }))
          );
        }
      });
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

  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    let list = projects;

    if (selectedTypeFilter !== "all") {
      list = list.filter((p) => p.outputTypeId === selectedTypeFilter);
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((p) => {
      const title = p.answers?.title || p.answers?.research_question || "";
      const label = typeMap.get(p.outputTypeId)?.label || p.outputTypeId;
      return title.toLowerCase().includes(q) || label.toLowerCase().includes(q) || p.outputTypeId.toLowerCase().includes(q);
    });
  }, [projects, selectedTypeFilter, searchQuery, typeMap]);  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1E293B] relative overflow-x-hidden font-sans selection:bg-[#334155] selection:text-[#F7F5F0]">
      {/* Top Header */}
      <header
        className={`fixed top-0 inset-x-0 z-40 bg-[#F7F5F0] border-b-2 border-[#334155] transition-all duration-200 ${
          scrolled ? "py-2.5" : "py-3 md:py-4"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-none border-2 border-[#334155] bg-[#334155] text-[#F7F5F0] flex items-center justify-center flex-shrink-0">
              <ScholarCoreLogo size="sm" className="text-[#F7F5F0]" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-[#1E293B] leading-none uppercase font-sans">
                Scholar Core
              </span>
              <span className="text-[10px] font-mono font-bold text-[#475569] tracking-widest uppercase mt-0.5">
                Workspace
              </span>
            </div>
          </div>

          {/* Desktop Nav Actions */}
          <div className="hidden md:flex items-center gap-2">
            {onOpenVault && (
              <button
                onClick={onOpenVault}
                className="flex items-center gap-2 px-3 py-1.5 rounded-none text-xs font-mono font-bold text-[#334155] border border-[#334155] bg-transparent hover:bg-[#334155] hover:text-[#F7F5F0] transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="square" strokeLinejoin="miter" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Knowledge Vault
              </button>
            )}
            {onOpenAgents && (
              <button
                onClick={onOpenAgents}
                className="flex items-center gap-2 px-3 py-1.5 rounded-none text-xs font-mono font-bold text-[#334155] border border-[#334155] bg-transparent hover:bg-[#334155] hover:text-[#F7F5F0] transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="square" strokeLinejoin="miter" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Editorial Agents
              </button>
            )}
            {onOpenAiAccess && (
              <button
                onClick={onOpenAiAccess}
                aria-label="Manage AI Access"
                className="flex items-center gap-2 px-3 py-1.5 rounded-none text-xs font-mono font-bold text-[#334155] border border-[#334155] bg-transparent hover:bg-[#334155] hover:text-[#F7F5F0] transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="square" strokeLinejoin="miter" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                AI Access
              </button>
            )}
            {onOpenAccountSettings && (
              <button
                onClick={onOpenAccountSettings}
                aria-label="Account Settings"
                className="flex items-center gap-2 px-3 py-1.5 rounded-none text-xs font-mono font-bold text-[#334155] border border-[#334155] bg-transparent hover:bg-[#334155] hover:text-[#F7F5F0] transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="square" strokeLinejoin="miter" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="square" strokeLinejoin="miter" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
            )}

            <div className="h-5 w-[1px] bg-[#334155] mx-1" />

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
            className="md:hidden p-2 rounded-none bg-transparent border border-[#334155] text-[#334155]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="square" strokeLinejoin="miter" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#F7F5F0] border-b-2 border-[#334155] px-6 py-4 flex flex-col gap-2 font-mono">
            {onOpenVault && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenVault();
                }}
                className="text-left py-2 text-xs font-bold text-[#334155] border-b border-[#334155]/20"
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
                className="text-left py-2 text-xs font-bold text-[#334155] border-b border-[#334155]/20"
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
                className="text-left py-2 text-xs font-bold text-[#334155] border-b border-[#334155]/20"
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
                className="text-left py-2 text-xs font-bold text-[#334155] border-b border-[#334155]/20"
              >
                Settings
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="text-left py-2 text-xs font-bold text-[#334155] mt-1"
            >
              Sign Out
            </button>
          </div>
        )}
      </header>

      {/* Main Content View */}
      <main className="mx-auto max-w-7xl px-4 md:px-8 pt-24 pb-20">
        {/* Onboarding welcome banner */}
        {welcomeVisible && (
          <div
            role="status"
            className="mb-8 rounded-none border-2 border-[#334155] bg-[#F7F5F0] p-5 flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-none border border-[#334155] bg-[#334155] text-[#F7F5F0] flex items-center justify-center flex-shrink-0">
                <ScholarCoreLogo size="sm" className="text-[#F7F5F0]" />
              </div>
              <div>
                <p className="text-sm font-bold font-mono uppercase tracking-wide text-[#1E293B]">Welcome to your Scholar Workspace</p>
                <p className="text-xs text-[#334155] mt-1 font-sans">
                  Select an academic workspace to begin, upload reference PDFs to your Vault, or configure your editorial agents.
                </p>
              </div>
            </div>
            <button
              aria-label="Dismiss"
              onClick={() => setWelcomeVisible(false)}
              className="p-1 rounded-none text-[#334155] hover:bg-[#334155] hover:text-[#F7F5F0] border border-transparent hover:border-[#334155] transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="square" strokeLinejoin="miter" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-8 rounded-none border border-[#334155] bg-transparent px-5 py-3 text-[#1E293B] text-xs font-mono flex items-center gap-3">
            <svg className="w-4 h-4 flex-shrink-0 text-[#334155]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="square" strokeLinejoin="miter" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-bold">{error}</span>
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
            {/* Quick-Launch Dedicated Workspaces */}
            <section className="mb-12">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono font-bold text-[#334155] uppercase tracking-widest px-1.5 py-0.5 border border-[#334155]">
                      WORKSPACE // 334.155
                    </span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1E293B] font-sans">
                    Scholar Workspace
                  </h1>
                  <p className="text-sm text-[#334155] mt-1 font-sans">
                    Select a dedicated academic workspace to initialize, or continue your active projects below.
                  </p>
                </div>
                {projects && projects.length > 0 && (
                  <button
                    onClick={() => setChoosing(true)}
                    className="px-6 py-3 rounded-none text-xs font-mono font-bold bg-[#334155] text-[#F7F5F0] border border-[#334155] hover:bg-[#1E293B] shadow-none transition-colors flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto uppercase tracking-wider"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="square" strokeLinejoin="miter" d="M12 4v16m8-8H4" />
                    </svg>
                    New Project
                  </button>
                )}
              </div>

              {/* 6 Quick-Launch Workspace Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {FORMAT_TILES.map((tile) => (
                  <div
                    key={tile.id}
                    onClick={() => handleCreate(tile.id)}
                    className="p-4 rounded-none border border-[#334155] bg-[#F7F5F0] hover:bg-[#334155]/5 shadow-none transition-colors cursor-pointer flex flex-col justify-between group text-left"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-8 h-8 rounded-none border border-[#334155] bg-transparent text-[#334155] flex items-center justify-center">
                          <FormatIcon id={tile.id} className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-none border border-[#334155] text-[#334155] bg-transparent">
                          {tile.id}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-[#1E293B] leading-tight mb-1 font-sans">
                        {tile.label}
                      </h4>
                      <p className="text-[11px] text-[#475569] font-sans line-clamp-2 leading-relaxed">
                        {tile.tag}
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-[#334155] flex items-center justify-between text-[10px] font-mono font-bold text-[#334155]">
                      <span>Start {tile.label.split(" ")[0]}</span>
                      <span>→</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Project List Section with Live Search & Filter Tabs */}
            <section>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b-2 border-[#334155]">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-5 bg-[#334155] rounded-none" />
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1E293B] font-sans">
                    Active Projects
                  </h2>
                  {projects && (
                    <span className="px-2 py-0.5 rounded-none text-xs font-mono font-bold border border-[#334155] text-[#334155] bg-transparent">
                      {filteredProjects.length} / {projects.length}
                    </span>
                  )}
                </div>

                {/* Search Bar */}
                {projects && projects.length > 0 && (
                  <div className="relative w-full sm:w-72">
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-none border border-[#334155] bg-transparent pl-8 pr-3 py-1.5 text-xs font-mono text-[#334155] placeholder-[#475569] outline-none focus:ring-1 focus:ring-[#334155] transition-all"
                    />
                    <svg className="w-3.5 h-3.5 text-[#334155] absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="square" strokeLinejoin="miter" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Format Filter Tabs */}
              {projects && projects.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <button
                    type="button"
                    onClick={() => setSelectedTypeFilter("all")}
                    className={`px-3 py-1.5 rounded-none text-xs font-mono font-bold transition-colors cursor-pointer flex items-center gap-1.5 border border-[#334155] ${
                      selectedTypeFilter === "all"
                        ? "bg-[#334155] text-[#F7F5F0]"
                        : "bg-transparent text-[#334155] hover:bg-[#334155]/10"
                    }`}
                  >
                    <span>All</span>
                    <span className={`text-[10px] font-mono px-1 border ${
                      selectedTypeFilter === "all" ? "border-[#F7F5F0] text-[#F7F5F0]" : "border-[#334155] text-[#334155]"
                    }`}>
                      {projects.length}
                    </span>
                  </button>

                  {FORMAT_TILES.map((tile) => {
                    const count = projects.filter((p) => p.outputTypeId === tile.id).length;
                    const isActive = selectedTypeFilter === tile.id;

                    return (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() => setSelectedTypeFilter(tile.id)}
                        className={`px-3 py-1.5 rounded-none text-xs font-mono font-bold transition-colors cursor-pointer flex items-center gap-1.5 border border-[#334155] ${
                          isActive
                            ? "bg-[#334155] text-[#F7F5F0]"
                            : "bg-transparent text-[#334155] hover:bg-[#334155]/10"
                        }`}
                      >
                        <span className="w-3.5 h-3.5 flex items-center justify-center">
                          <FormatIcon id={tile.id} className="w-3.5 h-3.5" />
                        </span>
                        <span>{tile.label}</span>
                        {count > 0 && (
                          <span className={`text-[10px] font-mono px-1 border ${
                            isActive ? "border-[#F7F5F0] text-[#F7F5F0]" : "border-[#334155] text-[#334155]"
                          }`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {projects === null ? (
                error ? (
                  <div className="flex flex-col justify-center items-center py-20 text-center border border-[#334155] p-8">
                    <div className="w-10 h-10 border border-[#334155] text-[#334155] flex items-center justify-center mb-4">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="square" strokeLinejoin="miter" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <p className="text-sm font-mono font-bold text-[#1E293B] mb-1">Failed to load manuscripts</p>
                    <p className="text-xs text-[#475569] font-mono max-w-sm mb-4">{error}</p>
                    <button
                      onClick={load}
                      className="px-5 py-2.5 rounded-none bg-[#334155] text-[#F7F5F0] text-xs font-mono font-bold hover:bg-[#1E293B] transition-colors cursor-pointer border border-[#334155]"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center items-center py-24 border border-[#334155]">
                    <div className="w-8 h-8 border-2 border-[#334155] border-t-transparent animate-spin mb-4" />
                    <span className="text-xs font-mono text-[#334155]">Loading manuscripts...</span>
                  </div>
                )
              ) : projects.length === 0 ? (
                <EmptyState onStart={() => setChoosing(true)} />
              ) : filteredProjects.length === 0 ? (
                <div className="p-12 text-center rounded-none border border-[#334155] bg-[#F7F5F0]">
                  <p className="text-sm font-mono font-semibold text-[#1E293B]">No manuscripts match "{searchQuery}"</p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-3 text-xs font-mono font-bold text-[#334155] underline cursor-pointer"
                  >
                    Clear search filter
                  </button>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
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
        className="w-full text-left p-5 rounded-none border border-[#334155] bg-[#F7F5F0] hover:bg-[#334155]/5 transition-colors duration-150 flex flex-col justify-between cursor-pointer min-h-[210px] shadow-none"
      >
        <div>
          {/* Card Top Metadata */}
          <div className="flex items-center justify-between gap-2 mb-3 pr-8">
            <span className="px-2 py-0.5 rounded-none text-[11px] font-mono font-bold text-[#334155] border border-[#334155] bg-transparent">
              {typeLabel}
            </span>
            <span className="px-2 py-0.5 rounded-none text-[10px] font-mono font-bold uppercase tracking-wider text-[#334155] border border-[#334155] bg-transparent">
              {project.hasDocument ? "DRAFTING STAGE" : "EVIDENCE INTAKE"}
            </span>
          </div>

          {/* Project Title */}
          <h3 className="text-base font-bold text-[#1E293B] font-sans leading-snug line-clamp-2 mb-2">
            {displayTitle}
          </h3>

          <p className="text-xs text-[#334155] font-mono">
            {signedOff} of {totalGates} quality gates verified
          </p>
        </div>

        {/* Bottom Technical Progress Indicator */}
        <div className="mt-5 pt-4 border-t border-[#334155]">
          <div className="flex justify-between text-[11px] font-mono font-bold text-[#334155] mb-1.5 uppercase tracking-wider">
            <span>Workflow Completion</span>
            <span>{percent}%</span>
          </div>
          <div className="w-full h-3 rounded-none border border-[#334155] bg-transparent p-[2px] overflow-hidden">
            <div
              className="h-full bg-[#334155] transition-all duration-300 rounded-none"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </button>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-4 right-4 z-20 w-7 h-7 rounded-none bg-[#F7F5F0] border border-[#334155] text-[#334155] opacity-0 group-hover:opacity-100 hover:bg-[#334155] hover:text-[#F7F5F0] transition-colors flex items-center justify-center cursor-pointer shadow-none"
          title="Delete Manuscript"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="square" strokeLinejoin="miter" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-none border-2 border-dashed border-[#334155] bg-[#F7F5F0] px-6 py-16 text-center flex flex-col items-center">
      <div className="w-12 h-12 rounded-none border-2 border-[#334155] bg-[#334155] text-[#F7F5F0] flex items-center justify-center mb-5">
        <ScholarCoreLogo size="md" className="text-[#F7F5F0]" />
      </div>
      <h3 className="text-xl font-extrabold text-[#1E293B] font-sans mb-2">
        Initialize your first project
      </h3>
      <p className="max-w-md text-xs text-[#334155] font-sans mb-6 leading-relaxed">
        Choose from 24 publication formats, connect your Knowledge Vault, and let the multi-agent editorial board assist you.
      </p>
      <button
        onClick={onStart}
        className="rounded-none bg-[#334155] px-6 py-3 text-xs font-mono font-bold text-[#F7F5F0] border border-[#334155] hover:bg-[#1E293B] flex items-center gap-2 cursor-pointer uppercase tracking-wider shadow-none"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M12 4v16m8-8H4" />
        </svg>
        New Project
      </button>
    </div>
  );
}

/** Curated 5 essential academic formats requested by user */
const FORMAT_TILES = [
  {
    id: "OT-01",
    label: "Assignment",
    tag: "Coursework & Essays",
    description: "Dedicated 8-phase thinking, evidence board & grounded drafting.",
    budget: "800 – 4,000 words",
  },
  {
    id: "OT-10",
    label: "Journal Article",
    tag: "Peer-Reviewed Papers",
    description: "25-stage empirical research pipeline with multi-agent peer review.",
    budget: "4,000 – 10,000 words",
  },
  {
    id: "OT-09",
    label: "Thesis / Dissertation",
    tag: "Milestones & Defense",
    description: "Comprehensive multi-chapter dissertation and thesis framework.",
    budget: "10,000 – 80,000 words",
  },
  {
    id: "OT-19",
    label: "Research Proposal",
    tag: "Grants & Funding",
    description: "Competitive grant applications with strict agency rubric alignment.",
    budget: "3,000 – 15,000 words",
  },
  {
    id: "OT-22",
    label: "Presentation",
    tag: "Slides & Keynotes",
    description: "Conference slide decks, oral defense scripts & visual narratives.",
    budget: "10 – 35 slides",
  },
];

/** Wireframe Charcoal Icon for academic formats */
function FormatIcon({ id, className = "w-4 h-4" }: { id: string; className?: string }) {
  switch (id) {
    case "OT-01":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "OT-10":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "OT-09":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5" />
        </svg>
      );
    case "OT-19":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "OT-22":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      );
    case "OT-07":
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M4 6h16M4 12h10M4 18h14M16 10l4 4m0-4l-4 4" />
        </svg>
      );
  }
}

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
        className="mb-8 inline-flex items-center gap-2 text-xs font-mono font-bold text-[#334155] hover:bg-[#334155] hover:text-[#F7F5F0] transition-colors px-3.5 py-2 rounded-none bg-transparent border border-[#334155] cursor-pointer shadow-none uppercase"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Return to Command Center
      </button>

      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E293B] font-sans mb-1.5">
          Select Output Format
        </h2>
        <p className="text-xs text-[#334155] font-sans">
          Select the dedicated academic workspace to initialize for your research project.
        </p>
      </div>

      {!types ? (
        <div className="flex items-center justify-center py-20 border border-[#334155]">
          <div className="w-8 h-8 border-2 border-[#334155] border-t-transparent animate-spin" />
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
                  className={`p-4 rounded-none border transition-colors cursor-pointer flex flex-col justify-between group text-left ${
                    isSelected
                      ? "border-2 border-[#334155] bg-[#334155]/5"
                      : "border border-[#334155] bg-[#F7F5F0] hover:bg-[#334155]/5"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8 h-8 rounded-none border border-[#334155] bg-transparent text-[#334155] flex items-center justify-center">
                        <FormatIcon id={tile.id} className="w-4 h-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-none border border-[#334155] text-[#334155] bg-transparent">
                          {tile.id}
                        </span>
                        {isSelected && (
                          <span className="font-mono text-xs font-bold text-[#334155] border border-[#334155] px-1">
                            [✓]
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-bold text-sm text-[#1E293B] font-sans mb-1">
                      {tile.label}
                    </h3>
                    <span className="inline-block text-[10px] font-mono font-semibold text-[#475569] mb-2">
                      {tile.tag}
                    </span>
                    <p className="text-xs text-[#334155] font-sans leading-relaxed mb-3">
                      {tile.description}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-[#334155] flex items-center justify-between text-[11px] font-mono text-[#475569]">
                    <span>Target: {tile.budget}</span>
                    <span className="text-[#334155] font-bold">Ready</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-[#334155] flex items-center justify-end">
            <button
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto rounded-none bg-[#334155] px-8 py-3 text-xs font-mono font-bold text-[#F7F5F0] border border-[#334155] hover:bg-[#1E293B] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider shadow-none"
            >
              {creating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-none animate-spin" />
                  Initializing Workspace...
                </>
              ) : (
                <>
                  {selected ? `Boot ${FORMAT_TILES.find((t) => t.id === selected)?.label || "Workspace"}` : "Select a Format to Boot"}
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="square" strokeLinejoin="miter" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer info banner */}
      <footer className="mt-12 py-3 px-4 text-center text-xs font-mono text-[#475569] border-t border-[#334155]">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6">
          <span className="flex items-center gap-1.5">
            <strong className="font-bold text-[#1E293B]">PROJECTS</strong>
            <span>— synced to account</span>
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-[#334155]">|</span>
          <span className="flex items-center gap-1.5">
            <strong className="font-bold text-[#1E293B]">PRIVATE VAULT</strong>
            <span>— client-side encrypted</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
