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
} from "lucide-react";
import { listProjects, deleteProject, listOutputTypes } from "../api";
import type { ProjectView, OutputTypeSummary } from "../types";
import SourceLibraryScreen from "./SourceLibraryScreen";
import SettingsView from "./SettingsView";
import { getConnectedCloudDrives, type CloudDriveAccount } from "../../services/vault/cloudDriveService";
import { loadVault } from "../../services/userVault";

export interface KnowledgeVaultProps {
  userId: string;
  initialTab?: "projects" | "sources" | "settings";
  onClose: () => void;
  onOpenProject?: (projectId: string) => void;
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

  // Load projects and types
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projRes, typeRes] = await Promise.all([
        listProjects().catch(() => ({ items: [] as ProjectView[] })),
        listOutputTypes().catch(() => ({ items: [] as OutputTypeSummary[] })),
      ]);
      setProjects(projRes?.items || []);
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

  // Filter projects by format and search query
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    let list = projects;
    if (selectedTypeFilter !== "all") {
      list = list.filter((p) => p.outputTypeId === selectedTypeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const title = (
          p.answers?.title ||
          p.answers?.research_question ||
          p.answers?.topic ||
          ""
        ).toLowerCase();
        const label = (typeMap.get(p.outputTypeId)?.label || p.outputTypeId).toLowerCase();
        return title.includes(q) || label.includes(q);
      });
    }
    return list;
  }, [projects, selectedTypeFilter, searchQuery, typeMap]);

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

  // Delete project
  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProject(projectToDelete.projectId);
      setProjects((prev) => prev ? prev.filter((p) => p.projectId !== projectToDelete.projectId) : []);
      setProjectToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete project";
      alert(`Could not delete project: ${msg}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans antialiased">
      {/* Knowledge Vault Top Navigation Header */}
      <header className="sticky top-0 z-30 px-6 py-4 bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-md border-b border-gray-200 dark:border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center shadow-xs flex-shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">
                Knowledge Vault
              </h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Workspace Repository
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              Manage research projects, literature evidence, and citation provenance.
            </p>
          </div>
        </div>

        {/* Secondary Tab Switcher & Actions */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <nav className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-neutral-800/80 border border-gray-200/80 dark:border-neutral-700/60">
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
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-neutral-800 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Return to main dashboard"
          >
            <span>← Back</span>
          </button>
        </div>
      </header>

      {/* Main Content Pane */}
      <main className="flex-1 w-full overflow-y-auto">
        {activeTab === "projects" && (
          <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-6">
            {/* Completion & Tracking Summary Bar */}
            {projects && projects.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] shadow-sm">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">
                    Active Projects
                  </span>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {metrics.total}
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {metrics.drafting} drafting • {metrics.intake} intake
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] shadow-sm">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">
                    Quality Gates
                  </span>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {metrics.gatesVerified} <span className="text-xs text-gray-400 font-normal">/ {metrics.totalGates}</span>
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    Verified milestone gates
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] shadow-sm col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Overall Progress Average
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {metrics.avgProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${metrics.avgProgress}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 block">
                    Synthesizing evidence across all research pipelines
                  </span>
                </div>
              </div>
            )}

            {/* Filter Pills and Live Search Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-gray-200 dark:border-neutral-800">
              {/* Format Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("all")}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border font-sans ${
                    selectedTypeFilter === "all"
                      ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-xs"
                      : "bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 shadow-sm"
                  }`}
                >
                  <span>All</span>
                  {projects && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full ${
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
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border font-sans ${
                        isActive
                          ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-xs"
                          : "bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 shadow-sm"
                      }`}
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center">
                        <FormatIcon id={tile.id} className="w-3.5 h-3.5" />
                      </span>
                      <span>{tile.label}</span>
                      {count > 0 && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full ${
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

              {/* Search projects... Input */}
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full !rounded-full !border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] pl-10 pr-9 py-2 text-xs font-normal text-[var(--text-primary)] placeholder:text-gray-400 outline-none focus:!ring-2 focus:ring-gray-200 dark:focus:ring-neutral-700 transition-all shadow-sm"
                />
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-2.5 pointer-events-none" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-2 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
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
            ) : (
              /* Projects Detailed Grid & Table */
              <div className="grid md:grid-cols-2 gap-4">
                {filteredProjects.map((project) => {
                  const percent = Math.round((project.intakeCompleteness || 0) * 100);
                  const signedOff = project.gates?.filter((g) => g.status === "signed_off").length || 0;
                  const totalGates = project.gates?.length || 5;
                  const displayTitle =
                    project.answers?.title?.trim() ||
                    project.answers?.research_question?.trim() ||
                    project.answers?.topic?.trim() ||
                    typeMap.get(project.outputTypeId)?.label ||
                    project.outputTypeId;
                  const typeLabel = typeMap.get(project.outputTypeId)?.label || project.outputTypeId;

                  return (
                    <div
                      key={project.projectId}
                      className="relative group border border-gray-200/90 dark:border-neutral-800 bg-white dark:bg-[#1C1C1E] rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-neutral-700 transition-all flex flex-col justify-between"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenProject?.(project.projectId)}
                        className="w-full text-left cursor-pointer"
                      >
                        {/* Card Top Badges */}
                        <div className="flex items-center gap-2 mb-3 pr-16">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-neutral-800 border border-gray-200/60 dark:border-neutral-700">
                            {typeLabel}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-neutral-800/80 border border-gray-200/60 dark:border-neutral-700">
                            {project.hasDocument ? "Drafting stage" : "Evidence intake"}
                          </span>
                        </div>

                        {/* Title */}
                        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {displayTitle}
                        </h3>

                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                          {signedOff} of {totalGates} quality gates verified
                        </p>

                        {/* Workflow Completion Progress Bar */}
                        <div className="pt-3 border-t border-gray-100 dark:border-neutral-800/80 w-full">
                          <div className="flex justify-between text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                            <span>Workflow Completion</span>
                            <span className="font-semibold text-gray-900 dark:text-gray-100">{percent}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full bg-gray-900 dark:bg-gray-100 rounded-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </button>

                      {/* Card Bottom Actions */}
                      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-neutral-800/80 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => onOpenProject?.(project.projectId)}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
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
                          className="px-3 py-1 rounded-full text-xs font-bold text-[#E60023] hover:text-[#AD081B] bg-[#FFEBEF] dark:bg-[#E60023]/15 hover:bg-[#FFD6DE] dark:hover:bg-[#E60023]/25 border border-[#E60023]/20 transition-all cursor-pointer"
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
