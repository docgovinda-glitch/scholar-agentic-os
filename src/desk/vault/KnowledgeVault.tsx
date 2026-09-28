/**
 * Knowledge Vault — Academic Project & Source Management
 *
 * Implements progressive disclosure architecture:
 * 1. Detailed Projects Data Table, Filter Pills, and Completion Tracking UI.
 * 2. Literature Sources Library with citations, semantic search, and retraction checking.
 * 3. Vault & Cloud Drive Settings.
 *
 * Designed with elevated soft dark mode aesthetics (#171717 / #1C1C1E), strictly avoiding pure black.
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  BookOpen,
  FileText,
  Sparkles,
  Layout,
  GraduationCap,
  Layers,
  Database,
  Settings,
  ArrowRight,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Plus,
  RefreshCw,
  Pencil,
  Check,
  LayoutGrid,
  List,
} from "lucide-react";
import { listProjects, deleteProject, listOutputTypes, saveIntakeAnswers } from "../api";
import type { ProjectView, OutputTypeSummary } from "../types";
import {
  getProjectDisplayName,
  getProjectHeadingPlaceholder,
  matchesProjectSearch,
  isDuplicateProjectTitle,
  getFormatLabel,
} from "../projectNaming";
import SourceLibraryScreen from "./SourceLibraryScreen";
import SettingsView from "./SettingsView";
import { getConnectedCloudDrives, type CloudDriveAccount } from "../../services/vault/cloudDriveService";
import { loadVault } from "../../services/userVault";

export interface KnowledgeVaultProps {
  userId: string;
  initialTab?: "projects" | "sources" | "settings";
  onClose: () => void;
  onOpenProject?: (projectId: string) => void;
  onProjectRenamed?: (projectId: string, newTitle: string) => void;
  onLock?: () => void;
  onResetVault?: () => void;
}

export const VAULT_FORMAT_TILES = [
  { id: "OT-10", label: "Journal Article" },
  { id: "OT-01", label: "Assignment" },
  { id: "OT-19", label: "Research Proposal" },
  { id: "OT-22", label: "Presentation" },
  { id: "OT-20", label: "Thesis / Dissertation" },
];

function FormatIcon({ id, className = "w-4 h-4" }: { id: string; className?: string }) {
  switch (id) {
    case "OT-01":
      return <BookOpen className={className} />;
    case "OT-10":
      return <FileText className={className} />;
    case "OT-19":
    case "OT-02":
      return <Sparkles className={className} />;
    case "OT-22":
    case "OT-03":
      return <Layout className={className} />;
    case "OT-20":
      return <GraduationCap className={className} />;
    default:
      return <FileText className={className} />;
  }
}

export default function KnowledgeVault({
  userId,
  initialTab = "projects",
  onClose,
  onOpenProject,
  onProjectRenamed,
  onLock,
  onResetVault,
}: KnowledgeVaultProps) {
  const [activeTab, setActiveTab] = useState<"projects" | "sources" | "settings">(initialTab);
  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");
  const [projectToDelete, setProjectToDelete] = useState<ProjectView | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [connectedDrives, setConnectedDrives] = useState<CloudDriveAccount[]>([]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // Persistent Project View Mode: "card" (Icon/Card View) | "list" (List View)
  const [projectViewMode, setProjectViewModeState] = useState<"card" | "list">(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const saved = window.localStorage.getItem("scholar_vault_project_view_mode");
        if (saved === "list" || saved === "card") return saved;
      }
    } catch {}
    return "card";
  });

  const setProjectViewMode = (mode: "card" | "list") => {
    setProjectViewModeState(mode);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("scholar_vault_project_view_mode", mode);
      }
    } catch {}
  };

  // Load projects and types
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projRes, typeRes] = await Promise.all([
        listProjects().catch(() => ({ items: [] as ProjectView[] })),
        listOutputTypes().catch(() => ({ items: [] as OutputTypeSummary[] })),
      ]);
      let items = projRes?.items || [];
      try {
        const stored = sessionStorage.getItem("scholar_deleted_project_ids");
        if (stored) {
          const deleted = new Set(JSON.parse(stored));
          items = items.filter((p) => !deleted.has(p.projectId));
        }
      } catch {
        // ignore
      }
      setProjects(items);
      setTypes(typeRes?.items || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load projects";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    getConnectedCloudDrives(userId)
      .then(setConnectedDrives)
      .catch(() => {});
  }, [userId]);

  const typeMap = useMemo(() => {
    const map = new Map<string, OutputTypeSummary>();
    if (types) {
      for (const t of types) map.set(t.id, t);
    }
    return map;
  }, [types]);

  // Filter projects by format and search query using canonical search matching
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    let list = projects;
    if (selectedTypeFilter !== "all") {
      list = list.filter((p) => p.outputTypeId === selectedTypeFilter);
    }
    if (searchQuery.trim()) {
      list = list.filter((p) => matchesProjectSearch(p, searchQuery, projects));
    }
    return list;
  }, [projects, selectedTypeFilter, searchQuery]);

  // Save renamed project heading inline
  const handleSaveRename = async (projectId: string) => {
    const targetProject = projects?.find((p) => p.projectId === projectId);
    if (!targetProject) return;

    const trimmed = editingTitle.trim();
    const finalTitle = trimmed || getProjectDisplayName(targetProject, projects || []);

    if (isDuplicateProjectTitle(finalTitle, projectId, projects || [])) {
      setRenameError(`A project named "${finalTitle}" already exists. Please choose a unique name.`);
      return;
    }

    const previousProjects = projects;
    setProjects((prev) =>
      prev
        ? prev.map((p) =>
            p.projectId === projectId
              ? {
                  ...p,
                  title: finalTitle,
                  answers: {
                    ...p.answers,
                    title: finalTitle,
                    working_title: finalTitle,
                    assignment_title: finalTitle,
                  },
                }
              : p
          )
        : []
    );

    setEditingProjectId(null);
    setRenameError(null);
    onProjectRenamed?.(projectId, finalTitle);

    try {
      await saveIntakeAnswers(projectId, {
        title: finalTitle,
        working_title: finalTitle,
        assignment_title: finalTitle,
      });
    } catch (err) {
      console.error("Failed to rename project:", err);
      setProjects(previousProjects);
      alert("Failed to save project heading. Please try again.");
    }
  };

  // Progress metrics
  const metrics = useMemo(() => {
    if (!projects || projects.length === 0) {
      return { total: 0, drafting: 0, intake: 0, avgProgress: 0, totalGates: 0, gatesVerified: 0 };
    }
    const total = projects.length;
    const drafting = projects.filter((p) => p.hasDocument).length;
    const intake = total - drafting;
    const avgProgress = Math.round(
      projects.reduce((acc, p) => acc + (p.intakeCompleteness || 0) * 100, 0) / total
    );
    let gatesVerified = 0;
    let totalGates = 0;
    for (const p of projects) {
      gatesVerified += p.gates?.filter((g) => g.status === "signed_off").length || 0;
      totalGates += p.gates?.length || 5;
    }
    return { total, drafting, intake, avgProgress, totalGates, gatesVerified };
  }, [projects]);

  // Delete project (optimistic update)
  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    const targetProject = projectToDelete;
    const previousProjects = projects;

    const markDeleted = (id: string) => {
      try {
        const stored = sessionStorage.getItem("scholar_deleted_project_ids");
        const list = stored ? JSON.parse(stored) : [];
        if (!list.includes(id)) {
          list.push(id);
          sessionStorage.setItem("scholar_deleted_project_ids", JSON.stringify(list));
        }
      } catch {
        // ignore
      }
    };

    const unmarkDeleted = (id: string) => {
      try {
        const stored = sessionStorage.getItem("scholar_deleted_project_ids");
        if (stored) {
          const list = JSON.parse(stored).filter((item: string) => item !== id);
          sessionStorage.setItem("scholar_deleted_project_ids", JSON.stringify(list));
        }
      } catch {
        // ignore
      }
    };

    // Immediately close modal, mark deleted, and update local state
    setProjectToDelete(null);
    markDeleted(targetProject.projectId);
    setProjects((prev) => (prev ? prev.filter((p) => p.projectId !== targetProject.projectId) : []));

    try {
      if (!targetProject.projectId.startsWith("demo-")) {
        await deleteProject(targetProject.projectId);
      }
    } catch (err: unknown) {
      console.error("Failed to delete project:", err);
      // Rollback on failure
      unmarkDeleted(targetProject.projectId);
      setProjects(previousProjects);
      const msg = err instanceof Error ? err.message : "Failed to delete project";
      alert(`Could not delete project: ${msg}`);
    }
  };


  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans antialiased">
      {/* Knowledge Vault Top Navigation Header */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 py-3 bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-md border-b border-gray-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto w-full flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center shadow-xs flex-shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">
                  Knowledge Vault
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 whitespace-nowrap">
                  Workspace Repository
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-normal truncate max-w-md">
                Manage research projects, literature evidence, and citation provenance.
              </p>
            </div>
          </div>

          {/* Secondary Tab Switcher & Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
            <nav className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-neutral-800/80 border border-gray-200/80 dark:border-neutral-700/60 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("projects")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "projects"
                    ? "bg-white dark:bg-[#171717] text-gray-900 dark:text-gray-100 shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Projects</span>
                {projects && projects.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-gray-200 dark:bg-neutral-700 text-gray-700 dark:text-gray-300">
                    {projects.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("sources")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "sources"
                    ? "bg-white dark:bg-[#171717] text-gray-900 dark:text-gray-100 shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Sources</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("settings")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "settings"
                    ? "bg-white dark:bg-[#171717] text-gray-900 dark:text-gray-100 shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
            </nav>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-neutral-800 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer h-9 shrink-0"
              title="Return to main dashboard"
            >
              <span>← Back</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Pane */}
      <main className="flex-1 w-full overflow-y-auto">
        {activeTab === "projects" && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
            {/* Completion & Tracking Summary Bar */}
            {projects && projects.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-xl border border-gray-200/90 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] shadow-2xs flex flex-col justify-between min-h-[104px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Active Projects
                    </span>
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 my-1">
                    {metrics.total}
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal truncate">
                    {metrics.drafting} drafting • {metrics.intake} intake
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-gray-200/90 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] shadow-2xs flex flex-col justify-between min-h-[104px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Quality Gates
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 my-1">
                    {metrics.gatesVerified} <span className="text-xs text-gray-400 font-normal">/ {metrics.totalGates}</span>
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal truncate">
                    Verified milestone gates
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-gray-200/90 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] shadow-2xs flex flex-col justify-between min-h-[104px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Overall Progress Average
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 font-mono">
                      {metrics.avgProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden my-auto">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${metrics.avgProgress}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block leading-normal truncate">
                    Synthesizing evidence across all research pipelines
                  </span>
                </div>
              </div>
            )}

            {/* Search, Filter & View Controls Toolbar */}
            <div className="flex flex-col gap-3 pb-3 border-b border-gray-200 dark:border-neutral-800">
              {/* Controls Bar: Search & View Mode Switcher */}
              <div className="flex items-center justify-between gap-3">
                {/* Search projects... Input */}
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-9 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] pl-10 pr-9 text-xs font-normal text-[var(--text-primary)] placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-neutral-700 transition-all shadow-2xs"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* View Mode Toggle Switcher */}
                <div
                  className="flex items-center p-0.5 rounded-xl bg-gray-100 dark:bg-neutral-800/80 border border-gray-200/80 dark:border-neutral-700/60 shrink-0 h-9"
                  role="group"
                  aria-label="Project view switcher"
                >
                  <button
                    type="button"
                    onClick={() => setProjectViewMode("card")}
                    title="Icon / Card View"
                    aria-label="Card View"
                    data-testid="project-view-card-btn"
                    className={`h-full px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      projectViewMode === "card"
                        ? "bg-white dark:bg-[#171717] text-gray-900 dark:text-gray-100 shadow-2xs"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Cards</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setProjectViewMode("list")}
                    title="List View"
                    aria-label="List View"
                    data-testid="project-view-list-btn"
                    className={`h-full px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      projectViewMode === "list"
                        ? "bg-white dark:bg-[#171717] text-gray-900 dark:text-gray-100 shadow-2xs"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>List</span>
                  </button>
                </div>
              </div>

              {/* Format Filter Tabs Track (Single horizontal row with clean smooth scroll) */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("all")}
                  className={`h-7 px-3 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border font-sans shrink-0 ${
                    selectedTypeFilter === "all"
                      ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-2xs"
                      : "bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 shadow-2xs"
                  }`}
                >
                  <span className="whitespace-nowrap">All</span>
                  {projects && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums leading-none ${
                      selectedTypeFilter === "all"
                        ? "bg-white/20 dark:bg-black/20 text-white dark:text-gray-900"
                        : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-400"
                    }`}>
                      {projects.length}
                    </span>
                  )}
                </button>

                {VAULT_FORMAT_TILES.map((tile) => {
                  const count = projects ? projects.filter((p) => p.outputTypeId === tile.id).length : 0;
                  const isActive = selectedTypeFilter === tile.id;
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={() => setSelectedTypeFilter(tile.id)}
                      className={`h-7 px-3 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border font-sans shrink-0 ${
                        isActive
                          ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-2xs"
                          : "bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 shadow-2xs"
                      }`}
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        <FormatIcon id={tile.id} className="w-3.5 h-3.5" />
                      </span>
                      <span className="whitespace-nowrap">{tile.label}</span>
                      {count > 0 && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums leading-none ${
                          isActive
                            ? "bg-white/20 dark:bg-black/20 text-white dark:text-gray-900"
                            : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-400"
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detailed Projects Data Table & Cards */}
            {loading ? (
              <div className="flex flex-col justify-center items-center py-20 border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-sm">
                <div className="w-8 h-8 border-2 border-gray-900 dark:border-gray-100 border-t-transparent rounded-full animate-spin mb-4" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Loading projects...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col justify-center items-center py-16 text-center border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] rounded-2xl p-8 shadow-sm">
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">Failed to load projects</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-4 leading-relaxed">{error}</p>
                <button
                  onClick={loadData}
                  className="px-6 py-2.5 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-medium hover:opacity-90 transition-transform active:scale-95 cursor-pointer shadow-xs"
                >
                  Retry Connection
                </button>
              </div>
            ) : !projects || projects.length === 0 ? (
              <div className="text-center py-16 px-6 border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-sm flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-neutral-800 flex items-center justify-center text-gray-400 mb-4">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">No projects yet</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-6 leading-relaxed">
                  Start your first academic research project from the main dashboard template cards.
                </p>
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-semibold hover:opacity-90 transition-all cursor-pointer shadow-sm"
                >
                  Browse Workspaces →
                </button>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="p-12 text-center rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] shadow-sm">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  No projects match "{searchQuery}"
                </p>
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-3 text-xs font-medium text-gray-900 dark:text-gray-100 underline cursor-pointer"
                >
                  Clear search filter
                </button>
              </div>
            ) : projectViewMode === "list" ? (
              /* VIEW MODE 1: Clean Structured List View */
              <div className="space-y-3" data-testid="project-list-view">
                {filteredProjects.map((project) => {
                  const percent = Math.round((project.intakeCompleteness || 0) * 100);
                  const signedOff = project.gates?.filter((g) => g.status === "signed_off").length || 0;
                  const totalGates = project.gates?.length || 5;
                  const displayTitle = getProjectDisplayName(project, projects || []);
                  const typeLabel = typeMap.get(project.outputTypeId)?.label || getFormatLabel(project.outputTypeId);
                  const isEditing = editingProjectId === project.projectId;

                  return (
                    <div
                      key={project.projectId}
                      data-testid={`project-list-item-${project.projectId}`}
                      className="group border border-gray-200/90 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] rounded-2xl p-4 sm:px-5 sm:py-4 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-neutral-700 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      {/* Left Side: Icon, Badges, Heading */}
                      <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                        <div
                          onClick={() => onOpenProject?.(project.projectId)}
                          className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 flex items-center justify-center shrink-0 cursor-pointer border border-gray-200/60 dark:border-neutral-700/60 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                          title={`Open ${displayTitle}`}
                        >
                          <FormatIcon id={project.outputTypeId} className="w-5 h-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Badges line */}
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-neutral-800 border border-gray-200/60 dark:border-neutral-700">
                              {typeLabel}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-neutral-800/80 border border-gray-200/60 dark:border-neutral-700">
                              {project.hasDocument ? "Drafting stage" : "Evidence intake"}
                            </span>
                            <span className="text-[11px] text-gray-400 dark:text-neutral-500 font-mono hidden sm:inline">
                              {signedOff} of {totalGates} gates verified
                            </span>
                          </div>

                          {/* Editable Title or Interactive Header */}
                          {isEditing ? (
                            <div
                              className="w-full max-w-lg"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <div className="flex items-center gap-1.5 w-full">
                                <input
                                  type="text"
                                  value={editingTitle}
                                  onChange={(e) => {
                                    setEditingTitle(e.target.value);
                                    if (renameError) setRenameError(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void handleSaveRename(project.projectId);
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      setEditingProjectId(null);
                                      setRenameError(null);
                                    }
                                  }}
                                  placeholder={getProjectHeadingPlaceholder(project)}
                                  autoFocus
                                  className="flex-1 px-3 py-1 text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-[#121212] border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleSaveRename(project.projectId)}
                                  className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer shrink-0"
                                  title="Save heading"
                                  aria-label="Save heading"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProjectId(null);
                                    setRenameError(null);
                                  }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
                                  title="Cancel"
                                  aria-label="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {renameError && (
                                <span className="text-[11px] text-red-500 font-medium mt-1 block">
                                  {renameError}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group/heading">
                              <h3
                                onClick={() => onOpenProject?.(project.projectId)}
                                className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 leading-snug truncate group-hover/heading:text-blue-600 dark:group-hover/heading:text-blue-400 transition-colors cursor-pointer"
                                title={displayTitle}
                              >
                                {displayTitle}
                              </h3>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditingProjectId(project.projectId);
                                  setEditingTitle(displayTitle);
                                  setRenameError(null);
                                }}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-md cursor-pointer shrink-0"
                                title="Edit project heading"
                                aria-label="Edit project heading"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Side: Progress Bar & Actions */}
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between lg:justify-end gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-gray-100 dark:border-neutral-800/80">
                        {/* Progress */}
                        <div className="w-32 sm:w-40 shrink-0">
                          <div className="flex justify-between text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                            <span>Completion</span>
                            <span className="font-semibold text-gray-900 dark:text-gray-100 font-mono">{percent}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenProject?.(project.projectId)}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>Open Workspace</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectToDelete(project);
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#E60023] hover:text-[#AD081B] bg-[#FFEBEF] dark:bg-[#E60023]/15 hover:bg-[#FFD6DE] dark:hover:bg-[#E60023]/25 border border-[#E60023]/20 transition-all cursor-pointer"
                            title="Delete Project"
                            aria-label="Delete Project"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* VIEW MODE 2: Visual Icon / Card View Grid */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="project-card-grid">
                {filteredProjects.map((project) => {
                  const percent = Math.round((project.intakeCompleteness || 0) * 100);
                  const signedOff = project.gates?.filter((g) => g.status === "signed_off").length || 0;
                  const totalGates = project.gates?.length || 5;
                  const displayTitle = getProjectDisplayName(project, projects || []);
                  const typeLabel = typeMap.get(project.outputTypeId)?.label || getFormatLabel(project.outputTypeId);
                  const isEditing = editingProjectId === project.projectId;

                  return (
                    <div
                      key={project.projectId}
                      className="group border border-gray-200/90 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-neutral-700 transition-all flex flex-col justify-between"
                    >
                      <div className="w-full text-left">
                        {/* Top Row: Format Icon, Badges, and Gate Counter */}
                        <div className="flex items-start justify-between gap-3 mb-3.5">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              onClick={() => onOpenProject?.(project.projectId)}
                              className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 flex items-center justify-center shrink-0 cursor-pointer border border-gray-200/60 dark:border-neutral-700/60 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                              title={`Open ${displayTitle}`}
                            >
                              <FormatIcon id={project.outputTypeId} className="w-5 h-5" />
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-neutral-800 border border-gray-200/60 dark:border-neutral-700 whitespace-nowrap">
                                {typeLabel}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-neutral-800/80 border border-gray-200/60 dark:border-neutral-700 whitespace-nowrap">
                                {project.hasDocument ? "Drafting stage" : "Evidence intake"}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 dark:bg-neutral-800/60 border border-gray-200/60 dark:border-neutral-700/60 text-[11px] text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span>{signedOff}/{totalGates} gates</span>
                          </div>
                        </div>

                        {/* Distinct Editable Heading */}
                        {isEditing ? (
                          <div
                            className="mb-3 w-full"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <div className="flex items-center gap-1.5 w-full">
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => {
                                  setEditingTitle(e.target.value);
                                  if (renameError) setRenameError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleSaveRename(project.projectId);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    setEditingProjectId(null);
                                    setRenameError(null);
                                  }
                                }}
                                placeholder={getProjectHeadingPlaceholder(project)}
                                autoFocus
                                className="flex-1 px-3 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-[#121212] border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSaveRename(project.projectId)}
                                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer shrink-0"
                                title="Save heading"
                                aria-label="Save heading"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProjectId(null);
                                  setRenameError(null);
                                }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
                                title="Cancel"
                                aria-label="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {renameError && (
                              <span className="text-[11px] text-red-500 font-medium mt-1 block">
                                {renameError}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2 mb-3 group/heading">
                            <h3
                              onClick={() => onOpenProject?.(project.projectId)}
                              className="text-base font-bold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 group-hover/heading:text-blue-600 dark:group-hover/heading:text-blue-400 transition-colors cursor-pointer flex-1"
                              title={displayTitle}
                            >
                              {displayTitle}
                            </h3>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingProjectId(project.projectId);
                                setEditingTitle(displayTitle);
                                setRenameError(null);
                              }}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-md cursor-pointer shrink-0 mt-0.5"
                              title="Edit project heading"
                              aria-label="Edit project heading"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div
                          onClick={() => onOpenProject?.(project.projectId)}
                          className="cursor-pointer"
                        >
                          {/* Workflow Completion Progress Bar */}
                          <div className="pt-3 border-t border-gray-100 dark:border-neutral-800/80 w-full">
                            <div className="flex justify-between items-center text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                              <span>Workflow Completion</span>
                              <span className="font-semibold text-gray-900 dark:text-gray-100 font-mono">{percent}%</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
                              <div
                                className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Bottom Actions */}
                      <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-neutral-800/80 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => onOpenProject?.(project.projectId)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Open Workspace</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectToDelete(project);
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#E60023] hover:text-[#AD081B] bg-[#FFEBEF] dark:bg-[#E60023]/15 hover:bg-[#FFD6DE] dark:hover:bg-[#E60023]/25 border border-[#E60023]/20 transition-all cursor-pointer"
                          title="Delete Project"
                          aria-label="Delete Project"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sources Tab */}
        {activeTab === "sources" && (
          <SourceLibraryScreen
            userId={userId}
            onClose={onClose}
            onOpenProject={onOpenProject}
            onLock={onLock}
            onResetVault={onResetVault}
          />
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <SettingsView
            userId={userId}
            connectedDrives={connectedDrives}
            onRefreshDrives={() => {
              getConnectedCloudDrives(userId)
                .then(setConnectedDrives)
                .catch(() => {});
            }}
            onResetVault={onResetVault}
          />
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#1C1C1E] rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-neutral-800 text-left">
            <h3 id="delete-modal-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
              Delete Project
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
              Are you sure you want to delete <strong className="text-gray-900 dark:text-gray-200 font-semibold">"{projectToDelete.answers?.title || "Untitled Project"}"</strong>? This action cannot be undone and will permanently remove all draft chapters and evidence matrices.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-full text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 rounded-full text-xs font-bold text-[#E60023] hover:text-[#AD081B] bg-[#FFEBEF] dark:bg-[#E60023]/15 hover:bg-[#FFD6DE] dark:hover:bg-[#E60023]/25 border border-[#E60023]/20 transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
