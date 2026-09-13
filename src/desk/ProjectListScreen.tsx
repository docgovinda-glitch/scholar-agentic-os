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

  const [projectToDelete, setProjectToDelete] = useState<ProjectView | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function promptDelete(project: ProjectView, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setProjectToDelete(project);
  }

  async function handleConfirmDelete() {
    if (!projectToDelete) return;
    const targetId = projectToDelete.projectId;
    setDeletingId(targetId);
    setError(null);

    // Optimistically remove from state so the project card immediately disappears
    const previousProjects = projects;
    setProjects((curr) => (curr ? curr.filter((p) => p.projectId !== targetId) : []));
    setProjectToDelete(null);

    try {
      if (!targetId.startsWith("demo-")) {
        await deleteProject(targetId);
      }
      // Re-fetch project list to keep in sync with server
      listProjects()
        .then((r) => setProjects(r.items))
        .catch(() => {});
    } catch (e) {
      console.error("Failed to delete project:", e);
      setProjects(previousProjects);
      setError((e as Error).message || "Could not delete project. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  // Close delete modal on Escape key
  useEffect(() => {
    if (!projectToDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deletingId) {
        setProjectToDelete(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectToDelete, deletingId]);

  function getProjectTitle(p: ProjectView | null): string {
    if (!p) return "Project";
    return (
      p.answers?.title?.trim() ||
      p.answers?.research_question?.trim() ||
      p.answers?.topic?.trim() ||
      typeMap.get(p.outputTypeId)?.label ||
      p.outputTypeId ||
      "Project"
    );
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
    <div className="min-h-screen bg-[#F7F5F0] text-neutral-900 relative overflow-x-hidden font-sans selection:bg-neutral-900 selection:text-white">
      {/* Top Header */}
      <header
        className={`fixed top-0 inset-x-0 z-40 bg-[#F7F5F0]/90 backdrop-blur-md border-b border-neutral-200/80 transition-all duration-200 ${
          scrolled ? "py-2.5 shadow-2xs" : "py-3.5 md:py-4"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <ScholarCoreLogo size="sm" className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight text-neutral-900 leading-none">
                Scholar Core
              </span>
              <span className="text-[11px] font-medium text-neutral-500 mt-1 tracking-normal">
                Workspace
              </span>
            </div>
          </div>

          {/* Desktop Nav Actions */}
          <div className="hidden md:flex items-center gap-2">
            {onOpenVault && (
              <button
                onClick={onOpenVault}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-neutral-700 border border-neutral-200 bg-white/80 hover:bg-neutral-100 hover:text-neutral-900 transition-all cursor-pointer shadow-2xs"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Knowledge Vault
              </button>
            )}
            {onOpenAgents && (
              <button
                onClick={onOpenAgents}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-neutral-700 border border-neutral-200 bg-white/80 hover:bg-neutral-100 hover:text-neutral-900 transition-all cursor-pointer shadow-2xs"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Editorial Agents
              </button>
            )}
            {onOpenAiAccess && (
              <button
                onClick={onOpenAiAccess}
                aria-label="Manage AI Access"
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-neutral-700 border border-neutral-200 bg-white/80 hover:bg-neutral-100 hover:text-neutral-900 transition-all cursor-pointer shadow-2xs"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                AI Access
              </button>
            )}
            {onOpenAccountSettings && (
              <button
                onClick={onOpenAccountSettings}
                aria-label="Account Settings"
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-neutral-700 border border-neutral-200 bg-white/80 hover:bg-neutral-100 hover:text-neutral-900 transition-all cursor-pointer shadow-2xs"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
            )}

            <div className="h-4 w-[1px] bg-neutral-200 mx-1.5" />

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
            className="md:hidden p-2 rounded-xl bg-white border border-neutral-200 text-neutral-700 shadow-2xs"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white/95 backdrop-blur-md border-b border-neutral-200 px-6 py-4 flex flex-col gap-2 font-sans shadow-lg animate-in fade-in duration-150">
            {onOpenVault && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenVault();
                }}
                className="text-left py-2.5 text-xs font-semibold text-neutral-700 border-b border-neutral-100"
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
                className="text-left py-2.5 text-xs font-semibold text-neutral-700 border-b border-neutral-100"
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
                className="text-left py-2.5 text-xs font-semibold text-neutral-700 border-b border-neutral-100"
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
                className="text-left py-2.5 text-xs font-semibold text-neutral-700 border-b border-neutral-100"
              >
                Settings
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="text-left py-2.5 text-xs font-semibold text-neutral-900 mt-1"
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
            className="mb-8 rounded-2xl border border-neutral-200 bg-white p-5 flex items-start justify-between gap-4 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <ScholarCoreLogo size="sm" className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-900">Welcome to your Scholar Workspace</p>
                <p className="text-xs text-neutral-500 mt-1 font-normal leading-relaxed">
                  Select an academic workspace to begin, upload reference PDFs to your Vault, or configure your editorial agents.
                </p>
              </div>
            </div>
            <button
              aria-label="Dismiss"
              onClick={() => setWelcomeVisible(false)}
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50/60 px-5 py-3.5 text-red-900 text-xs font-medium flex items-center gap-3">
            <svg className="w-4 h-4 flex-shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
            {/* Quick-Launch Dedicated Workspaces */}
            <section className="mb-12">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-neutral-600 px-3 py-0.5 rounded-full bg-neutral-100 border border-neutral-200">
                      Scholar Workspace
                    </span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 font-sans">
                    Scholar Workspace
                  </h1>
                  <p className="text-sm text-neutral-500 mt-1.5 font-normal leading-relaxed max-w-2xl">
                    Select a dedicated academic workspace to initialize, or continue your active research projects below.
                  </p>
                </div>
                {projects && projects.length > 0 && (
                  <button
                    onClick={() => setChoosing(true)}
                    className="px-6 py-2.5 rounded-full text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    New Project
                  </button>
                )}
              </div>

              {/* Quick-Launch Workspace Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {FORMAT_TILES.map((tile) => (
                  <div
                    key={tile.id}
                    onClick={() => handleCreate(tile.id)}
                    className="p-4 rounded-2xl border border-neutral-200/90 bg-white hover:border-neutral-300 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between group text-left"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center transition-colors group-hover:bg-neutral-900 group-hover:text-white">
                          <FormatIcon id={tile.id} className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-neutral-200 text-neutral-500 bg-neutral-50">
                          {tile.id}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-neutral-900 leading-tight mb-1 font-sans">
                        {tile.label}
                      </h4>
                      <p className="text-xs text-neutral-500 font-normal line-clamp-2 leading-relaxed">
                        {tile.tag}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">
                      <span>Start {tile.label.split(" ")[0]}</span>
                      <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Project List Section with Live Search & Filter Tabs */}
            <section>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-neutral-200">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 font-sans">
                    Active Projects
                  </h2>
                  {projects && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-neutral-200 text-neutral-600 bg-white">
                      {filteredProjects.length} of {projects.length}
                    </span>
                  )}
                </div>

                {/* Search Bar */}
                {projects && projects.length > 0 && (
                  <div className="relative w-full sm:w-80">
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full !rounded-full !border !border-neutral-300/90 !bg-white pl-10 pr-9 py-2.5 text-xs font-normal !text-neutral-900 placeholder:!text-neutral-400 outline-none focus:!ring-2 focus:!ring-neutral-900/15 focus:!border-neutral-400 transition-all shadow-xs"
                      style={{ borderRadius: "9999px", backgroundColor: "#ffffff" }}
                    />
                    <svg className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-2.5 p-1 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Format Filter Tabs */}
              {projects && projects.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <button
                    type="button"
                    onClick={() => setSelectedTypeFilter("all")}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selectedTypeFilter === "all"
                        ? "bg-neutral-900 text-white border-neutral-900 shadow-xs"
                        : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    <span>All</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full ${
                      selectedTypeFilter === "all" ? "bg-neutral-700 text-white" : "bg-neutral-100 text-neutral-600"
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
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border ${
                          isActive
                            ? "bg-neutral-900 text-white border-neutral-900 shadow-xs"
                            : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
                        }`}
                      >
                        <span className="w-3.5 h-3.5 flex items-center justify-center">
                          <FormatIcon id={tile.id} className="w-3.5 h-3.5" />
                        </span>
                        <span>{tile.label}</span>
                        {count > 0 && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full ${
                            isActive ? "bg-neutral-700 text-white" : "bg-neutral-100 text-neutral-600"
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
                  <div className="flex flex-col justify-center items-center py-20 text-center border border-neutral-200 bg-white rounded-2xl p-8 shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-neutral-900 mb-1">Failed to load manuscripts</p>
                    <p className="text-xs text-neutral-500 max-w-sm mb-4 font-normal leading-relaxed">{error}</p>
                    <button
                      onClick={load}
                      className="px-5 py-2.5 rounded-full bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-all cursor-pointer shadow-xs"
                    >
                      Retry Connection
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center items-center py-24 border border-neutral-200 bg-white rounded-2xl shadow-xs">
                    <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mb-4" />
                    <span className="text-xs font-medium text-neutral-600">Loading manuscripts...</span>
                  </div>
                )
              ) : projects.length === 0 ? (
                <EmptyState onStart={() => setChoosing(true)} />
              ) : filteredProjects.length === 0 ? (
                <div className="p-12 text-center rounded-2xl border border-neutral-200 bg-white shadow-xs">
                  <p className="text-sm font-semibold text-neutral-900">No manuscripts match "{searchQuery}"</p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-3 text-xs font-semibold text-neutral-900 underline cursor-pointer"
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
                      onDelete={(e) => promptDelete(p, e)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Delete Confirmation Modal Pop-up */}
      {projectToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !deletingId && setProjectToDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-neutral-200 p-6 shadow-xl relative text-left animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Red Delete Icon */}
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-600 mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            {/* Title */}
            <h3 id="delete-modal-title" className="text-lg font-bold text-neutral-900 tracking-tight mb-2 font-sans">
              Delete Project
            </h3>

            {/* Clear, refined academic grammar */}
            <p className="text-xs text-neutral-600 leading-relaxed mb-6 font-normal">
              Are you sure you want to delete <span className="font-semibold text-neutral-900">"{getProjectTitle(projectToDelete)}"</span>? All associated notes, drafts, and evidence will be permanently removed. This action cannot be undone.
            </p>

            {/* Action Buttons: Negative ("Cancel") and Red Delete ("Delete") */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setProjectToDelete(null)}
                className="px-5 py-2.5 rounded-full text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={handleConfirmDelete}
                className="px-6 py-2.5 rounded-full text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-2"
              >
                {deletingId ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
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
        className="w-full text-left p-6 rounded-2xl border border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer min-h-[210px]"
      >
        <div>
          {/* Card Top Metadata */}
          <div className="flex items-center justify-between gap-2 mb-3 pr-8">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium text-neutral-700 bg-neutral-100 border border-neutral-200">
              {typeLabel}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium text-neutral-500 bg-neutral-50 border border-neutral-200">
              {project.hasDocument ? "Drafting stage" : "Evidence intake"}
            </span>
          </div>

          {/* Project Title */}
          <h3 className="text-base font-bold text-neutral-900 font-sans leading-snug line-clamp-2 mb-2">
            {displayTitle}
          </h3>

          <p className="text-xs text-neutral-500 font-normal leading-relaxed">
            {signedOff} of {totalGates} quality gates verified
          </p>
        </div>

        {/* Bottom Technical Progress Indicator */}
        <div className="mt-5 pt-4 border-t border-neutral-100">
          <div className="flex justify-between text-xs font-medium text-neutral-600 mb-2">
            <span>Workflow Completion</span>
            <span className="font-semibold text-neutral-900">{percent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full bg-neutral-900 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </button>

      {/* Delete button */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(e);
          }}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/95 sm:bg-white border border-neutral-200/90 text-neutral-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50/70 transition-all flex items-center justify-center cursor-pointer shadow-2xs group-hover:border-neutral-300"
          title="Delete Project"
          aria-label="Delete Project"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center flex flex-col items-center shadow-2xs">
      <div className="w-14 h-14 rounded-2xl bg-neutral-900 text-white flex items-center justify-center mb-5 shadow-xs">
        <ScholarCoreLogo size="md" className="text-white" />
      </div>
      <h3 className="text-2xl font-extrabold text-neutral-900 font-sans mb-2 tracking-tight">
        Initialize your first project
      </h3>
      <p className="max-w-md text-sm text-neutral-500 font-normal mb-6 leading-relaxed">
        Choose from curated academic workspaces, connect your Knowledge Vault, and let the multi-agent editorial board assist you.
      </p>
      <button
        onClick={onStart}
        className="rounded-full bg-neutral-900 px-7 py-3 text-xs font-semibold text-white hover:bg-neutral-800 flex items-center gap-2 cursor-pointer shadow-sm transition-all"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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

/** Modern wireframe icon for academic formats */
function FormatIcon({ id, className = "w-4 h-4" }: { id: string; className?: string }) {
  switch (id) {
    case "OT-01":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "OT-10":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "OT-09":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5" />
        </svg>
      );
    case "OT-19":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "OT-22":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      );
    case "OT-07":
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14M16 10l4 4m0-4l-4 4" />
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
        className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-neutral-700 hover:text-neutral-900 transition-all px-4 py-2 rounded-full bg-white border border-neutral-200 hover:border-neutral-300 shadow-2xs cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Return to Command Center
      </button>

      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 font-sans mb-1.5">
          Select Output Format
        </h2>
        <p className="text-sm text-neutral-500 font-normal leading-relaxed">
          Select the dedicated academic workspace to initialize for your research project.
        </p>
      </div>

      {!types ? (
        <div className="flex items-center justify-center py-20 border border-neutral-200 bg-white rounded-2xl shadow-xs">
          <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
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
                  className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between group text-left ${
                    isSelected
                      ? "border-2 border-neutral-900 bg-neutral-50/90 shadow-sm ring-2 ring-neutral-900/10"
                      : "border border-neutral-200/90 bg-white hover:border-neutral-300 hover:shadow-md"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-9 h-9 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center transition-colors group-hover:bg-neutral-900 group-hover:text-white">
                        <FormatIcon id={tile.id} className="w-4 h-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-neutral-200 text-neutral-500 bg-neutral-50">
                          {tile.id}
                        </span>
                        {isSelected && (
                          <span className="text-xs font-semibold text-neutral-900 px-2 py-0.5 rounded-full bg-neutral-100">
                            Selected
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-bold text-base text-neutral-900 font-sans mb-1">
                      {tile.label}
                    </h3>
                    <span className="inline-block text-xs font-medium text-neutral-500 mb-2">
                      {tile.tag}
                    </span>
                    <p className="text-xs text-neutral-600 font-normal leading-relaxed mb-4">
                      {tile.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500 font-medium">
                    <span>Target: {tile.budget}</span>
                    <span className="text-neutral-900 font-semibold">Ready</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-neutral-200 flex items-center justify-end">
            <button
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto rounded-full bg-neutral-900 px-8 py-3 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
            >
              {creating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Initializing Workspace...
                </>
              ) : (
                <>
                  {selected ? `Boot ${FORMAT_TILES.find((t) => t.id === selected)?.label || "Workspace"}` : "Select a Format to Boot"}
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer info banner */}
      <footer className="mt-12 py-4 px-4 text-center text-xs text-neutral-500 border-t border-neutral-200">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 font-normal">
          <span className="flex items-center gap-1.5">
            <strong className="font-semibold text-neutral-800">Projects</strong>
            <span>— synced to account</span>
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-neutral-300">·</span>
          <span className="flex items-center gap-1.5">
            <strong className="font-semibold text-neutral-800">Private Vault</strong>
            <span>— client-side encrypted</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
