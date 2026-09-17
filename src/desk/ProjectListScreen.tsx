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
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Theme toggle state: Sand & Snow Day mode vs True-Dark Night mode
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document !== "undefined") {
      const current = document.documentElement.getAttribute("data-theme");
      if (current === "dark" || current === "light") return current;
      try {
        const stored = localStorage.getItem("scholar-theme");
        if (stored === "dark" || stored === "light") return stored;
      } catch {}
      if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
    }
    return "light";
  });

  const toggleTheme = useCallback(() => {
    setTheme((curr) => {
      const next = curr === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", next);
      }
      try {
        localStorage.setItem("scholar-theme", next);
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      const val = document.documentElement.getAttribute("data-theme");
      if (val === "dark" || val === "light") {
        setTheme(val);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (showWelcome) onWelcomeSeen?.();
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
            authors: [],
            intakeCompleteness: 0.85,
            hasDocument: true,
            hasJournalRequirements: true,
            gates: [
              { gate: "G0", name: "G0", status: "signed_off", outstandingBlocking: [] },
              { gate: "G1", name: "G1", status: "signed_off", outstandingBlocking: [] },
              { gate: "G2", name: "G2", status: "signed_off", outstandingBlocking: [] },
              { gate: "G3", name: "G3", status: "signed_off", outstandingBlocking: [] },
              { gate: "G4", name: "G4", status: "in_progress", outstandingBlocking: [] },
            ],
          },
          {
            projectId: "demo-thesis-02",
            outputTypeId: "OT-09",
            answers: {
              title: "Autonomous Multi-Agent Systems in Empirical Drug Discovery Pipelines",
              research_question: "Evaluation of agentic reasoning architectures for target identification",
            },
            authors: [],
            intakeCompleteness: 0.60,
            hasDocument: false,
            hasJournalRequirements: false,
            gates: [
              { gate: "G0", name: "G0", status: "signed_off", outstandingBlocking: [] },
              { gate: "G1", name: "G1", status: "signed_off", outstandingBlocking: [] },
              { gate: "G2", name: "G2", status: "signed_off", outstandingBlocking: [] },
              { gate: "G3", name: "G3", status: "in_progress", outstandingBlocking: [] },
            ],
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
              aliases: [],
              family: "publication",
              academicLevels: [],
              typicalDisciplines: [],
              available: true,
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

  const [creatingFormatId, setCreatingFormatId] = useState<string | null>(null);

  async function handleCreate(outputTypeId: string) {
    if (creating) return;
    setCreating(true);
    setCreatingFormatId(outputTypeId);
    setError(null);
    try {
      const project = await createProject(outputTypeId);
      onOpen(project.projectId);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
      setCreatingFormatId(null);
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
    if (!projectToDelete || deletingId) return;
    const targetId = projectToDelete.projectId;
    setDeletingId(targetId);
    setError(null);

    try {
      if (!targetId.startsWith("demo-")) {
        await deleteProject(targetId);
      }
      setProjects((curr) => (curr ? curr.filter((p) => p.projectId !== targetId) : []));
      setProjectToDelete(null);
      // Re-sync project list with server in background
      listProjects()
        .then((r) => setProjects(r.items))
        .catch(() => {});
    } catch (e) {
      console.error("Failed to delete project:", e);
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
  }, [projects, selectedTypeFilter, searchQuery, typeMap]);

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans selection:bg-[var(--text-primary)] selection:text-[var(--bg-canvas)]">
      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden animate-in fade-in duration-150"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar (Navigation Pane) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 md:relative md:z-30 h-full flex flex-col justify-between border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex-shrink-0 select-none transition-all duration-300 ease-in-out ${
          mobileMenuOpen
            ? "translate-x-0 w-[260px] shadow-2xl"
            : "-translate-x-full md:translate-x-0 " + (isSidebarOpen ? "w-[260px]" : "w-0 border-r-0 overflow-hidden")
        }`}
      >
        {/* Top Section */}
        <div className="flex flex-col flex-shrink-0 w-[260px]">
          {/* Logo & Close/Collapse Header */}
          <div className="p-4 pb-3 flex items-center justify-between border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[var(--bg-button-primary)] text-[var(--text-button)] flex items-center justify-center flex-shrink-0 shadow-xs">
                <ScholarCoreLogo size="sm" className="text-[var(--text-button)]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-extrabold text-sm tracking-tight text-[var(--text-primary)] leading-none truncate font-sans">
                  Scholar Core
                </span>
                <span className="text-[10px] font-medium text-[var(--text-secondary)] mt-1 tracking-normal font-sans">
                  Workspace
                </span>
              </div>
            </div>

            {/* Desktop Collapse Icon */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="hidden md:flex p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer"
              title="Close navigation"
              aria-label="Close navigation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Primary + New Project Button (Full width of sidebar) */}
          <div className="px-3 pt-3 pb-1">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setChoosing(true);
              }}
              className="w-full py-2.5 px-6 rounded-full text-xs font-medium bg-[var(--bg-button-primary)] text-[var(--text-button)] hover:opacity-90 active:scale-95 transition-transform flex items-center justify-center gap-2 cursor-pointer shadow-sm group font-sans"
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Middle Section (Nav Links) */}
        <div className="flex-1 overflow-y-auto scholar-scrollbar py-2 px-3 flex flex-col gap-1 w-[260px]">
          <div className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-[var(--text-secondary)]/70 font-sans">
            Platform
          </div>

          {onOpenVault && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenVault();
              }}
              aria-label="Open Knowledge Vault"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer text-left w-full group font-sans"
            >
              <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Knowledge Vault</span>
            </button>
          )}

          {onOpenAgents && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAgents();
              }}
              aria-label="Open Editorial Agents"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer text-left w-full group font-sans"
            >
              <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>Editorial Agents</span>
            </button>
          )}

          {onOpenAiAccess && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAiAccess();
              }}
              aria-label="Manage AI Access"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer text-left w-full group font-sans"
            >
              <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span>AI Access</span>
            </button>
          )}
        </div>

        {/* Bottom Section */}
        <div className="flex-shrink-0 p-3 border-t border-[var(--border-subtle)] flex flex-col gap-2 w-[260px]">
          {/* Action Row: Settings Navigation Item + Minimal Icon-Only Theme Toggle */}
          <div className="flex items-center justify-between gap-1.5">
            {onOpenAccountSettings && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAccountSettings();
                }}
                aria-label="Settings"
                className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold tracking-tight text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer text-left group font-sans"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Settings</span>
              </button>
            )}

            {/* Minimal Icon-Only Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "Day" : "Night"} mode`}
              title={`Switch to ${theme === "dark" ? "Day (Sand & Snow)" : "Night (ChatGPT)"} mode`}
              className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 border border-[var(--border-subtle)] transition-all cursor-pointer flex-shrink-0"
            >
              {theme === "dark" ? (
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>

          {/* Multi-Account User Dropdown */}
          <UserAccountMenu
            userEmail={userEmail}
            onOpenAccountSettings={onOpenAccountSettings}
            onOpenVault={onOpenVault}
            onOpenAiAccess={onOpenAiAccess}
            dropUp={true}
            variant="sidebar"
          />
        </div>
      </aside>

      {/* Main Content Area (Right Pane) */}
      <main className="flex-1 h-full overflow-y-auto bg-[var(--bg-canvas)] text-[var(--text-primary)] scholar-scrollbar relative flex flex-col">
        {/* Sticky Top Bar for Sidebar Toggle on Desktop & Mobile */}
        <div className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between bg-[var(--bg-canvas)]/85 backdrop-blur-md border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            {/* Mobile Drawer Trigger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 shadow-[var(--shadow-card)] cursor-pointer"
              aria-label="Open navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Desktop Sidebar Toggle Icon Button (ChatGPT-style) */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 text-xs font-medium shadow-[var(--shadow-card)] cursor-pointer transition-all animate-in fade-in"
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-label={isSidebarOpen ? "Toggle sidebar" : "Expand sidebar"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18" />
                {isSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 9l-3 3 3 3" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 15l3-3-3-3" />
                )}
              </svg>
              {!isSidebarOpen && <span>Open Sidebar</span>}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-primary)] tracking-tight font-sans">Scholar Workspace</span>
              <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] bg-[var(--bg-card)] font-sans">
                Command Center
              </span>
            </div>
          </div>

          {/* Mobile Quick Action */}
          {projects && projects.length > 0 && !choosing && (
            <button
              type="button"
              onClick={() => setChoosing(true)}
              className="md:hidden px-4 py-1.5 rounded-full text-xs font-medium bg-[var(--bg-button-primary)] text-[var(--text-button)] hover:opacity-90 shadow-sm transition-transform active:scale-95 flex items-center gap-1.5 cursor-pointer font-sans"
            >
              <span className="font-bold">+</span>
              <span>New</span>
            </button>
          )}
        </div>        {/* Centered Reading Column (mimics focused AI chat window) */}
        <div className="max-w-4xl mx-auto px-6 py-8 w-full flex-1">
          {/* Onboarding welcome banner */}
          {welcomeVisible && (
            <div
              role="status"
              className="mb-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 flex items-start justify-between gap-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-button-primary)] text-[var(--text-button)] flex items-center justify-center flex-shrink-0 shadow-xs">
                  <ScholarCoreLogo size="sm" className="text-[var(--text-button)]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)] font-sans">Welcome to your Scholar Workspace</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 font-normal leading-relaxed font-sans">
                    Select an academic workspace to begin, upload reference PDFs to your Vault, or configure your editorial agents.
                  </p>
                </div>
              </div>
              <button
                aria-label="Dismiss"
                onClick={() => setWelcomeVisible(false)}
                className="p-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-8 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3.5 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-3">
              <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-semibold font-sans">{error}</span>
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
              {/* Workspace Categories (Quick-Launch Dedicated Workspaces) */}
              <section className="mb-12">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-[var(--text-secondary)] px-3 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] font-sans">
                        Scholar Workspace
                      </span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] font-sans">
                      Scholar Workspace
                    </h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1.5 font-normal leading-relaxed max-w-2xl font-sans">
                      Select a dedicated academic workspace to initialize, or continue your active research projects below.
                    </p>
                  </div>
                  {projects && projects.length > 0 && (
                    <button
                      onClick={() => setChoosing(true)}
                      className="px-6 py-2.5 rounded-full text-xs font-medium bg-[var(--bg-button-primary)] text-[var(--text-button)] hover:opacity-90 shadow-sm transition-transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto font-sans"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>+ New Project</span>
                    </button>
                  )}
                </div>

                {/* Quick-Launch Workspace Cards ("Snow on Sand") */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {FORMAT_TILES.map((tile) => {
                    const isBootingThis = creatingFormatId === tile.id;
                    const isOtherBooting = creating && !isBootingThis;
                    return (
                      <div
                        key={tile.id}
                        onClick={() => !creating && handleCreate(tile.id)}
                        className={`bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-[var(--shadow-card)] transition-all duration-200 flex flex-col justify-between text-left font-sans min-h-[220px] ${
                          isOtherBooting
                            ? "opacity-50 cursor-not-allowed"
                            : isBootingThis
                            ? "border-[var(--text-primary)] shadow-md cursor-wait"
                            : "hover:border-[var(--text-primary)]/40 hover:scale-[1.01] cursor-pointer group"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="w-9 h-9 rounded-xl bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center transition-colors group-hover:bg-[var(--bg-button-primary)] group-hover:text-[var(--text-button)] border border-[var(--border-subtle)]">
                              {isBootingThis ? (
                                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <FormatIcon id={tile.id} className="w-4 h-4" />
                              )}
                            </div>
                            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] bg-[var(--bg-canvas)]">
                              {tile.id}
                            </span>
                          </div>
                          <h4 className="font-bold text-base text-[var(--text-primary)] leading-tight mb-1 font-sans">
                            {tile.label}
                          </h4>
                          <p className="text-xs text-[var(--text-secondary)] font-normal line-clamp-2 leading-relaxed font-sans mb-2">
                            {tile.tag}
                          </p>
                          <span className="text-[11px] font-semibold text-[var(--accent-success)] inline-block">
                            {isBootingThis ? "Initializing workspace…" : "Ready to boot"}
                          </span>
                        </div>
                        <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                          {isBootingThis ? (
                            <div className="flex items-center gap-2 text-[var(--text-primary)] font-semibold">
                              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              <span>Booting…</span>
                            </div>
                          ) : (
                            <>
                              <span>Start {tile.label.split(" ")[0]}</span>
                              <span className="transition-transform group-hover:translate-x-1">→</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Active Projects Section with Live Search & Filter Tabs */}
              <section>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] font-sans">
                      Active Projects
                    </h2>
                    {projects && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] font-sans">
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
                        className="w-full !rounded-full !border !border-[var(--border-subtle)] !bg-[var(--bg-card)] pl-10 pr-9 py-2.5 text-xs font-normal !text-[var(--text-primary)] placeholder:!text-[var(--text-secondary)] outline-none focus:!ring-2 focus:!ring-[var(--text-primary)]/15 focus:!border-[var(--text-primary)]/40 transition-all shadow-[var(--shadow-card)]"
                        style={{ borderRadius: "9999px", backgroundColor: "var(--bg-card)" }}
                      />
                      <svg className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3 top-2.5 p-1 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer"
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
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border font-sans ${
                        selectedTypeFilter === "all"
                          ? "bg-[var(--bg-button-primary)] text-[var(--text-button)] border-[var(--bg-button-primary)] shadow-xs"
                          : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--text-primary)]/5 shadow-[var(--shadow-card)]"
                      }`}
                    >
                      <span>All</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full ${
                        selectedTypeFilter === "all" ? "bg-[var(--text-button)]/20 text-[var(--text-button)]" : "bg-[var(--bg-canvas)] text-[var(--text-secondary)]"
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
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border font-sans ${
                            isActive
                              ? "bg-[var(--bg-button-primary)] text-[var(--text-button)] border-[var(--bg-button-primary)] shadow-xs"
                              : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--text-primary)]/5 shadow-[var(--shadow-card)]"
                          }`}
                        >
                          <span className="w-3.5 h-3.5 flex items-center justify-center">
                            <FormatIcon id={tile.id} className="w-3.5 h-3.5" />
                          </span>
                          <span>{tile.label}</span>
                          {count > 0 && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full ${
                              isActive ? "bg-[var(--text-button)]/20 text-[var(--text-button)]" : "bg-[var(--bg-canvas)] text-[var(--text-secondary)]"
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
                    <div className="flex flex-col justify-center items-center py-20 text-center border border-[var(--border-subtle)] bg-[var(--bg-card)] rounded-2xl p-8 shadow-[var(--shadow-card)]">
                      <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-[var(--text-primary)] mb-1 font-sans">Failed to load manuscripts</p>
                      <p className="text-xs text-[var(--text-secondary)] max-w-sm mb-4 font-normal leading-relaxed font-sans">{error}</p>
                      <button
                        onClick={load}
                        className="px-6 py-2.5 rounded-full bg-[var(--bg-button-primary)] text-[var(--text-button)] text-xs font-medium hover:opacity-90 transition-transform active:scale-95 cursor-pointer shadow-xs font-sans"
                      >
                        Retry Connection
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center items-center py-24 border border-[var(--border-subtle)] bg-[var(--bg-card)] rounded-2xl shadow-[var(--shadow-card)]">
                      <div className="w-8 h-8 border-2 border-[var(--text-primary)] border-t-transparent rounded-full animate-spin mb-4" />
                      <span className="text-xs font-medium text-[var(--text-secondary)] font-sans">Loading manuscripts...</span>
                    </div>
                  )
                ) : projects.length === 0 ? (
                  <EmptyState onStart={() => setChoosing(true)} />
                ) : filteredProjects.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
                    <p className="text-sm font-semibold text-[var(--text-primary)] font-sans">No manuscripts match "{searchQuery}"</p>
                    <button
                      onClick={() => setSearchQuery("")}
                      className="mt-3 text-xs font-medium text-[var(--text-primary)] underline cursor-pointer font-sans"
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
        </div>
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
            className="w-full max-w-md rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-7 shadow-2xl relative text-left animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <h3 id="delete-modal-title" className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight mb-2.5 font-sans">
              Delete Project
            </h3>

            {/* Sub-label */}
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-7 font-normal font-sans">
              Are you sure you want to delete <span className="font-semibold text-[var(--text-primary)]">"{getProjectTitle(projectToDelete)}"</span>? All associated notes, drafts, and evidence will be permanently removed. This action cannot be undone.
            </p>

            {/* Action Buttons: Pinterest-style Cancel & Pinterest Red (#E60023) Delete */}
            <div className="flex items-center justify-end gap-3 pt-1 font-sans">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setProjectToDelete(null)}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-canvas)] hover:bg-[var(--text-primary)]/10 border border-[var(--border-subtle)] transition-all cursor-pointer disabled:opacity-50 font-sans"
              >
                Cancel
              </button>
              {/* Delete text option in iconic Pinterest Red (#E60023) */}
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-full text-sm font-bold text-[#E60023] hover:text-[#AD081B] bg-[#FFEBEF] dark:bg-[#E60023]/15 hover:bg-[#FFD6DE] dark:hover:bg-[#E60023]/25 transition-all cursor-pointer disabled:opacity-50 font-sans flex items-center justify-center"
              >
                {deletingId ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[#E60023] border-t-transparent rounded-full animate-spin mr-2" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete</span>
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
    <div className="relative group font-sans">
      <button
        onClick={onOpen}
        className="w-full text-left p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] hover:border-[var(--text-primary)]/40 hover:scale-[1.01] transition-all duration-200 flex flex-col justify-between cursor-pointer min-h-[220px]"
      >
        <div>
          {/* Card Top Metadata */}
          <div className="flex items-center justify-start gap-2 mb-3 pr-20">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
              {typeLabel}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium text-[var(--text-secondary)]/80 bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
              {project.hasDocument ? "Drafting stage" : "Evidence intake"}
            </span>
          </div>

          {/* Project Title */}
          <h3 className="text-base font-bold text-[var(--text-primary)] font-sans leading-snug line-clamp-2 mb-2">
            {displayTitle}
          </h3>

          <p className="text-xs text-[var(--text-secondary)] font-normal leading-relaxed font-sans">
            {signedOff} of {totalGates} quality gates verified
          </p>
        </div>

        {/* Bottom Technical Progress Indicator */}
        <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex justify-between text-xs font-medium text-[var(--text-secondary)] mb-2">
            <span>Workflow Completion</span>
            <span className="font-semibold text-[var(--text-primary)]">{percent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className="h-full bg-[var(--text-primary)] rounded-full transition-all duration-300"
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
          className="absolute top-5 right-5 z-20 px-3 py-1 rounded-full text-xs font-bold text-[#E60023] hover:text-[#AD081B] bg-[#FFEBEF] dark:bg-[#E60023]/15 hover:bg-[#FFD6DE] dark:hover:bg-[#E60023]/25 border border-[#E60023]/20 transition-all cursor-pointer shadow-2xs font-sans"
          title="Delete Project"
          aria-label="Delete Project"
        >
          Delete
        </button>
      )}
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-16 text-center flex flex-col items-center shadow-[var(--shadow-card)] font-sans">
      <div className="w-14 h-14 rounded-2xl bg-[var(--bg-button-primary)] text-[var(--text-button)] flex items-center justify-center mb-5 shadow-xs">
        <ScholarCoreLogo size="md" className="text-[var(--text-button)]" />
      </div>
      <h3 className="text-2xl font-extrabold text-[var(--text-primary)] font-sans mb-2 tracking-tight">
        Initialize your first project
      </h3>
      <p className="max-w-md text-sm text-[var(--text-secondary)] font-normal mb-6 leading-relaxed font-sans">
        Choose from curated academic workspaces, connect your Knowledge Vault, and let the multi-agent editorial board assist you.
      </p>
      <button
        onClick={onStart}
        className="rounded-full bg-[var(--bg-button-primary)] px-6 py-2.5 text-xs font-medium text-[var(--text-button)] hover:opacity-90 flex items-center gap-2 cursor-pointer shadow-sm transition-transform active:scale-95 font-sans"
      >
        <span className="font-bold text-sm">+</span>
        <span>New Project</span>
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
    <div className="max-w-4xl mx-auto py-6 animate-fade-in font-sans">
      <button
        onClick={onCancel}
        className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all px-4 py-2 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--text-primary)]/40 shadow-[var(--shadow-card)] cursor-pointer font-sans"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Return to Command Center</span>
      </button>

      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] font-sans mb-1.5">
          Select Output Format
        </h2>
        <p className="text-sm text-[var(--text-secondary)] font-normal leading-relaxed font-sans">
          Select the dedicated academic workspace to initialize for your research project.
        </p>
      </div>

      {!types ? (
        <div className="flex items-center justify-center py-20 border border-[var(--border-subtle)] bg-[var(--bg-card)] rounded-2xl shadow-[var(--shadow-card)]">
          <div className="w-8 h-8 border-2 border-[var(--text-primary)] border-t-transparent rounded-full animate-spin" />
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

          {/* Interactive Format Tiles Grid ("Snow on Sand") */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FORMAT_TILES.map((tile) => {
              const isSelected = selected === tile.id;

              return (
                <div
                  key={tile.id}
                  onClick={() => setSelected(tile.id)}
                  onDoubleClick={() => onPick(tile.id)}
                  className={`bg-[var(--bg-card)] border rounded-2xl p-6 shadow-[var(--shadow-card)] transition-all duration-200 cursor-pointer flex flex-col justify-between group text-left font-sans min-h-[220px] ${
                    isSelected
                      ? "border-2 border-[var(--text-primary)] ring-2 ring-[var(--text-primary)]/10"
                      : "border-[var(--border-subtle)] hover:border-[var(--text-primary)]/40 hover:scale-[1.01]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-9 h-9 rounded-xl bg-[var(--bg-canvas)] text-[var(--text-primary)] flex items-center justify-center transition-colors group-hover:bg-[var(--bg-button-primary)] group-hover:text-[var(--text-button)] border border-[var(--border-subtle)]">
                        <FormatIcon id={tile.id} className="w-4 h-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] bg-[var(--bg-canvas)]">
                          {tile.id}
                        </span>
                        {isSelected && (
                          <span className="text-xs font-semibold text-[var(--text-primary)] px-2 py-0.5 rounded-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] font-sans">
                            Selected
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-bold text-base text-[var(--text-primary)] font-sans mb-1">
                      {tile.label}
                    </h3>
                    <span className="inline-block text-xs font-medium text-[var(--text-secondary)] mb-2 font-sans">
                      {tile.tag}
                    </span>
                    <p className="text-xs text-[var(--text-secondary)] font-normal leading-relaxed mb-3 font-sans">
                      {tile.description}
                    </p>
                    <span className="text-[11px] font-semibold text-[var(--accent-success)] inline-block mb-3">
                      Ready to boot
                    </span>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium font-sans">
                    <span>Target: {tile.budget}</span>
                    <span className="text-[var(--accent-success)] font-semibold">Available</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-end font-sans">
            <button
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto rounded-full bg-[var(--bg-button-primary)] px-6 py-2.5 text-xs font-medium text-[var(--text-button)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-transform active:scale-95 font-sans"
            >
              {creating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-[var(--text-button)]/30 border-t-[var(--text-button)] rounded-full animate-spin" />
                  <span>Initializing Workspace...</span>
                </>
              ) : (
                <>
                  <span>{selected ? `Boot ${FORMAT_TILES.find((t) => t.id === selected)?.label || "Workspace"}` : "Select a Format to Boot"}</span>
                  <span aria-hidden="true" className="text-sm font-bold">→</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer info banner */}
      <footer className="mt-12 py-4 px-4 text-center text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] font-sans">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 font-normal">
          <span className="flex items-center gap-1.5">
            <strong className="font-semibold text-[var(--text-primary)]">Projects</strong>
            <span>— synced to account</span>
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-[var(--text-secondary)]/40">·</span>
          <span className="flex items-center gap-1.5">
            <strong className="font-semibold text-[var(--text-primary)]">Private Vault</strong>
            <span>— client-side encrypted</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
