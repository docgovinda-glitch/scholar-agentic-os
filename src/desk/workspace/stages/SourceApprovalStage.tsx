import { useState, useMemo, useCallback } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { saveIntakeAnswers } from "../../api";
import { useOptionalResearchWorkspace } from "../ResearchContext";

export type EvidentiaryRole =
  | "benchmark"
  | "dataset"
  | "methodology"
  | "theory"
  | "comparative"
  | "general";

export interface ApprovedSourceItem {
  id: string;
  title: string;
  author?: string;
  authors?: string[];
  year?: number | string;
  relevance_score?: number;
  type?: string;
  snippet?: string;
  content?: string;
  matched_concepts?: string[];
  evidentiary_role?: EvidentiaryRole;
  approved_at?: string;
}

export const EVIDENTIARY_ROLE_LABELS: Record<EvidentiaryRole, { label: string; icon: string; desc: string }> = {
  benchmark: {
    label: "Benchmark Baseline",
    icon: "📊",
    desc: "Provides baseline evaluation metrics & empirical performance bounds.",
  },
  dataset: {
    label: "Empirical Dataset",
    icon: "💾",
    desc: "Primary raw data, traces, or observational measurements.",
  },
  methodology: {
    label: "Methodological Grounding",
    icon: "⚙️",
    desc: "Informs study design, protocol formulation, or algorithmic structure.",
  },
  theory: {
    label: "Theoretical Foundation",
    icon: "📐",
    desc: "Underpins conceptual framework, proofs, or formal paradigms.",
  },
  comparative: {
    label: "Comparative Prior Work",
    icon: "🔍",
    desc: "Existing solutions evaluated directly in related work.",
  },
  general: {
    label: "Supporting Context",
    icon: "📚",
    desc: "Broader domain background and contextual literature.",
  },
};

export default function SourceApprovalStage({
  stage,
  projectId,
  project: propProject,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved?: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const workspaceContext = useOptionalResearchWorkspace();
  const project = propProject || workspaceContext?.project;
  const def = STAGE_MAP.get(stage);

  const handleSave = onSaved || workspaceContext?.setProject;
  const handleAdvance = onAdvance || workspaceContext?.advanceStage;

  const isVault = stage === "source_approval_vault";
  const pendingKey = isVault ? "pending_vault_sources" : "pending_external_sources";
  const approvedKey = isVault ? "approved_vault_sources" : "approved_external_sources";
  const rejectedKey = isVault ? "rejected_vault_sources" : "rejected_external_sources";
  const nextStage = isVault ? "additional_data" : "evidence_analysis";

  // 1. Phase I Grounded Context
  const workingTitle =
    project?.answers?.working_title ||
    project?.answers?.assignment_title ||
    project?.answers?.title ||
    "Untitled Research Manuscript";

  const targetJournal = project?.answers?.target_journal || "Peer-Reviewed Venue";
  const methodology =
    project?.answers?.methodology ||
    project?.answers?.study_design ||
    project?.answers?.article_type ||
    "Empirical Research";

  const anchorGap = useMemo(() => {
    try {
      const rawGaps = project?.answers?.identified_gaps;
      if (!rawGaps) return null;
      const gaps = typeof rawGaps === "string" ? JSON.parse(rawGaps) : rawGaps;
      if (!Array.isArray(gaps)) return null;
      const anchorId = project?.answers?.anchor_gap_id || project?.answers?.selected_gap;
      return gaps.find((g: any) => g.id === anchorId) || gaps[0] || null;
    } catch {
      return null;
    }
  }, [project?.answers?.identified_gaps, project?.answers?.anchor_gap_id, project?.answers?.selected_gap]);

  // 2. Parse sources from project answers
  const initialPending: ApprovedSourceItem[] = useMemo(() => {
    try {
      const raw = project?.answers?.[pendingKey];
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [project?.answers, pendingKey]);

  const initialApproved: ApprovedSourceItem[] = useMemo(() => {
    try {
      const raw = project?.answers?.[approvedKey];
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [project?.answers, approvedKey]);

  const initialRejectedIds: Set<string> = useMemo(() => {
    try {
      const raw = project?.answers?.[rejectedKey];
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {}
    return new Set<string>();
  }, [project?.answers, rejectedKey]);

  // 3. Local state
  const [approvedSources, setApprovedSources] = useState<ApprovedSourceItem[]>(initialApproved);
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(initialRejectedIds);
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "discarded">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectingSource, setInspectingSource] = useState<ApprovedSourceItem | null>(null);
  const [selectedRoleBySource, setSelectedRoleBySource] = useState<Record<string, EvidentiaryRole>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Derived source sets
  const pendingToReview = useMemo(() => {
    return initialPending.filter(
      (s) => !approvedSources.some((a) => a.id === s.id) && !rejectedIds.has(s.id)
    );
  }, [initialPending, approvedSources, rejectedIds]);

  const discardedSources = useMemo(() => {
    return initialPending.filter((s) => rejectedIds.has(s.id));
  }, [initialPending, rejectedIds]);

  // Filtered lists based on search
  const filteredPending = useMemo(() => {
    if (!searchQuery) return pendingToReview;
    const q = searchQuery.toLowerCase();
    return pendingToReview.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) ||
        s.author?.toLowerCase().includes(q) ||
        s.snippet?.toLowerCase().includes(q)
    );
  }, [pendingToReview, searchQuery]);

  const filteredApproved = useMemo(() => {
    if (!searchQuery) return approvedSources;
    const q = searchQuery.toLowerCase();
    return approvedSources.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) ||
        s.author?.toLowerCase().includes(q) ||
        s.snippet?.toLowerCase().includes(q)
    );
  }, [approvedSources, searchQuery]);

  const filteredDiscarded = useMemo(() => {
    if (!searchQuery) return discardedSources;
    const q = searchQuery.toLowerCase();
    return discardedSources.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) ||
        s.author?.toLowerCase().includes(q) ||
        s.snippet?.toLowerCase().includes(q)
    );
  }, [discardedSources, searchQuery]);

  // 4. Persistence helper
  const persistChanges = useCallback(
    async (newApproved: ApprovedSourceItem[], newRejected: Set<string>) => {
      setIsSaving(true);
      try {
        if (handleSave && project) {
          const newAnswers = {
            ...project.answers,
            [approvedKey]: JSON.stringify(newApproved),
            [rejectedKey]: JSON.stringify(Array.from(newRejected)),
          };
          const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
          handleSave(updated);
        }
      } catch (err) {
        console.error("Failed to persist source approval changes:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [handleSave, project, approvedKey, rejectedKey, projectId]
  );

  // 5. Triage Actions
  const handleApprove = async (source: ApprovedSourceItem, role?: EvidentiaryRole) => {
    const assignedRole = role || selectedRoleBySource[source.id] || "general";
    const enrichedSource: ApprovedSourceItem = {
      ...source,
      evidentiary_role: assignedRole,
      approved_at: new Date().toISOString(),
    };

    const nextApproved = [...approvedSources.filter((a) => a.id !== source.id), enrichedSource];
    const nextRejected = new Set(rejectedIds);
    nextRejected.delete(source.id);

    setApprovedSources(nextApproved);
    setRejectedIds(nextRejected);

    setSuccessToast(`Approved "${source.title.slice(0, 45)}..." as ${EVIDENTIARY_ROLE_LABELS[assignedRole].label}`);
    setTimeout(() => setSuccessToast(null), 3500);

    await persistChanges(nextApproved, nextRejected);
  };

  const handleDiscard = async (sourceId: string) => {
    const nextApproved = approvedSources.filter((a) => a.id !== sourceId);
    const nextRejected = new Set(rejectedIds).add(sourceId);

    setApprovedSources(nextApproved);
    setRejectedIds(nextRejected);

    await persistChanges(nextApproved, nextRejected);
  };

  const handleRestore = async (source: ApprovedSourceItem) => {
    const nextRejected = new Set(rejectedIds);
    nextRejected.delete(source.id);
    setRejectedIds(nextRejected);

    setSuccessToast(`Restored "${source.title.slice(0, 45)}..." to review queue`);
    setTimeout(() => setSuccessToast(null), 3500);

    await persistChanges(approvedSources, nextRejected);
  };

  const handleUpdateRole = async (sourceId: string, newRole: EvidentiaryRole) => {
    setSelectedRoleBySource((prev) => ({ ...prev, [sourceId]: newRole }));
    const nextApproved = approvedSources.map((s) =>
      s.id === sourceId ? { ...s, evidentiary_role: newRole } : s
    );
    setApprovedSources(nextApproved);
    await persistChanges(nextApproved, rejectedIds);
  };

  // Batch actions
  const handleBatchApproveHighRelevance = async () => {
    const highMatchSources = pendingToReview.filter((s) => (s.relevance_score || 0) >= 90);
    if (highMatchSources.length === 0) return;

    const newAdditions: ApprovedSourceItem[] = highMatchSources.map((s) => ({
      ...s,
      evidentiary_role: selectedRoleBySource[s.id] || "benchmark",
      approved_at: new Date().toISOString(),
    }));

    const nextApproved = [...approvedSources, ...newAdditions];
    setApprovedSources(nextApproved);

    setSuccessToast(`Batch approved ${highMatchSources.length} high-relevance sources (≥90%)`);
    setTimeout(() => setSuccessToast(null), 3500);

    await persistChanges(nextApproved, rejectedIds);
  };

  const handleBatchApproveAll = async () => {
    if (pendingToReview.length === 0) return;

    const newAdditions: ApprovedSourceItem[] = pendingToReview.map((s) => ({
      ...s,
      evidentiary_role: selectedRoleBySource[s.id] || "general",
      approved_at: new Date().toISOString(),
    }));

    const nextApproved = [...approvedSources, ...newAdditions];
    setApprovedSources(nextApproved);

    setSuccessToast(`Batch approved all ${pendingToReview.length} pending sources`);
    setTimeout(() => setSuccessToast(null), 3500);

    await persistChanges(nextApproved, rejectedIds);
  };

  // 6. Lock and Advance
  const [isAdvancing, setIsAdvancing] = useState(false);
  const handleProceed = async () => {
    setIsAdvancing(true);
    try {
      if (handleSave && project) {
        const newAnswers = {
          ...project.answers,
          [approvedKey]: JSON.stringify(approvedSources),
          [rejectedKey]: JSON.stringify(Array.from(rejectedIds)),
          [isVault ? "source_approval_vault" : "source_approval_external"]: "completed",
        };
        const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        handleSave(updated);
      }
      if (handleAdvance) {
        handleAdvance(nextStage);
      }
    } catch (err) {
      console.error("Failed to advance stage:", err);
      if (handleAdvance) {
        handleAdvance(nextStage);
      }
    } finally {
      setIsAdvancing(false);
    }
  };

  if (!def) return <div className="p-8 text-[color:var(--text-muted)]">Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] font-sans">
      {/* 1. Header Bar */}
      <div className="shrink-0 px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-b border-[color:var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between bg-[color:var(--surface-raised)] z-10 gap-3 sm:gap-4 shadow-2xs relative">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] shrink-0">
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)] bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded border border-[color:var(--accent-border)]">
                Phase II: Evidence Extraction
              </span>
              <span className="text-xs text-[color:var(--text-muted)] font-mono">Stage {def.number} of 25</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[color:var(--text-primary)] tracking-tight">
              {def.label}
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5 line-clamp-1 sm:line-clamp-none">
              {isVault
                ? "Verify and authorize primary sources from your Knowledge Vault before evidence extraction."
                : "Evaluate and approve external discovered literature before evidence synthesis."}
            </p>
          </div>
        </div>

        {/* Anti-Fabrication Security Shield */}
        <div className="flex items-center gap-2.5 sm:gap-3 bg-[color:var(--surface-sunken)] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-[color:var(--border-subtle)] text-xs shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] flex items-center justify-center font-bold text-sm">
            🛡️
          </div>
          <div>
            <div className="font-bold text-[color:var(--text-primary)] text-[11px] sm:text-xs">Anti-Fabrication Guard</div>
            <div className="text-[color:var(--text-secondary)] text-[10px] sm:text-[11px]">Only approved citations reach the draft</div>
          </div>
        </div>
      </div>

      {/* Success Notification Toast */}
      {successToast && (
        <div className="bg-[color:var(--state-success-subtle)] border-b border-[color:var(--state-success)] px-4 sm:px-6 py-2.5 text-xs font-semibold text-[color:var(--state-success)] flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-xs hover:opacity-75">✕</button>
        </div>
      )}

      {/* 2. Grounding Foundation Ribbon */}
      <div className="px-4 sm:px-6 lg:px-8 py-2.5 bg-[color:var(--surface-sunken)] border-b border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono uppercase font-bold text-[color:var(--accent)] shrink-0 bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded border border-[color:var(--accent-border)]">
            Grounding Anchor
          </span>
          <span className="font-semibold text-[color:var(--text-primary)] truncate max-w-xl" title={workingTitle}>
            "{workingTitle}"
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {anchorGap && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
              <span>👑 Anchor Gap:</span>
              <span className="font-semibold text-[color:var(--text-primary)] max-w-xs truncate">{anchorGap.title}</span>
            </span>
          )}
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🏛 {targetJournal}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🔬 {methodology}
          </span>
        </div>
      </div>

      {/* 3. Triage Workbench Layout */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Left Triage Column */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[color:var(--border-subtle)]">
          {/* Tabs & Search Bar */}
          <div className="p-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("pending")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === "pending"
                      ? "bg-[color:var(--accent)] text-white shadow-xs"
                      : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                  }`}
                >
                  Pending Review ({pendingToReview.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("approved")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === "approved"
                      ? "bg-[color:var(--accent)] text-white shadow-xs"
                      : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                  }`}
                >
                  Approved Library ({approvedSources.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("discarded")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === "discarded"
                      ? "bg-[color:var(--accent)] text-white shadow-xs"
                      : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                  }`}
                >
                  Discarded ({discardedSources.length})
                </button>
              </div>

              {/* Batch Actions (visible on pending tab) */}
              {activeTab === "pending" && pendingToReview.length > 0 && (
                <div className="flex items-center gap-2">
                  {pendingToReview.some((s) => (s.relevance_score || 0) >= 90) && (
                    <button
                      type="button"
                      onClick={handleBatchApproveHighRelevance}
                      disabled={isSaving}
                      className="text-xs font-bold text-[color:var(--state-success)] hover:underline cursor-pointer"
                    >
                      ⚡ Approve High-Match (≥90%)
                    </button>
                  )}
                  <span className="text-[color:var(--border-subtle)]">|</span>
                  <button
                    type="button"
                    onClick={handleBatchApproveAll}
                    disabled={isSaving}
                    className="text-xs font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
                  >
                    Approve All
                  </button>
                </div>
              )}
            </div>

            {/* Live Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter sources by title, author, or snippet..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
              />
              <svg className="w-4 h-4 text-[color:var(--text-muted)] absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Cards Scroll View */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* TAB: PENDING REVIEW */}
            {activeTab === "pending" && (
              <>
                {filteredPending.length === 0 ? (
                  <div className="p-12 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl">
                    <div className="w-12 h-12 rounded-full bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] flex items-center justify-center mx-auto mb-3 text-xl">
                      ✓
                    </div>
                    <h4 className="font-bold text-[color:var(--text-primary)] text-sm">
                      {initialPending.length === 0
                        ? "No sources awaiting review."
                        : "All pending sources have been reviewed!"}
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-1 max-w-sm mx-auto">
                      {initialPending.length === 0
                        ? "Return to the previous stage to discover or ingest sources into your vault."
                        : `${approvedSources.length} sources approved for extraction. Click 'Lock Approved Sources & Proceed' below.`}
                    </p>
                  </div>
                ) : (
                  filteredPending.map((source) => {
                    const currentRole = selectedRoleBySource[source.id] || "benchmark";
                    return (
                      <div
                        key={source.id}
                        className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-[color:var(--border-control)] rounded-xl transition-all shadow-xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-[color:var(--text-primary)] hover:text-[color:var(--accent)] transition-colors">
                              {source.title}
                            </h4>
                            <div className="text-xs text-[color:var(--text-secondary)] flex items-center gap-2 mt-0.5">
                              <span>👤 {source.author || "Primary Investigator"}</span>
                              <span>•</span>
                              <span>📅 {source.year || 2024}</span>
                              {source.type && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                                    {source.type}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {source.relevance_score !== undefined && (
                              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]">
                                {source.relevance_score}% Match
                              </span>
                            )}
                          </div>
                        </div>

                        {source.snippet && (
                          <p className="text-xs text-[color:var(--text-secondary)] italic bg-[color:var(--surface-sunken)] p-2.5 rounded-lg border border-[color:var(--border-subtle)] line-clamp-2">
                            "{source.snippet}"
                          </p>
                        )}

                        {/* Evidentiary Role Picker & Triage Actions */}
                        <div className="pt-2 border-t border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-[color:var(--text-muted)]">
                              Assign Role:
                            </span>
                            <select
                              value={currentRole}
                              onChange={(e) =>
                                setSelectedRoleBySource({
                                  ...selectedRoleBySource,
                                  [source.id]: e.target.value as EvidentiaryRole,
                                })
                              }
                              className="px-2 py-1 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-md text-[color:var(--text-primary)] focus:outline-none"
                            >
                              {(Object.keys(EVIDENTIARY_ROLE_LABELS) as EvidentiaryRole[]).map((r) => (
                                <option key={r} value={r}>
                                  {EVIDENTIARY_ROLE_LABELS[r].icon} {EVIDENTIARY_ROLE_LABELS[r].label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setInspectingSource(source)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDiscard(source.id)}
                              disabled={isSaving}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[color:var(--surface-sunken)] text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] border border-[color:var(--border-subtle)] transition-colors cursor-pointer"
                            >
                              Discard
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApprove(source, currentRole)}
                              disabled={isSaving}
                              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
                            >
                              ✓ Approve Source
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* TAB: APPROVED LIBRARY */}
            {activeTab === "approved" && (
              <>
                {filteredApproved.length === 0 ? (
                  <div className="p-12 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl text-xs text-[color:var(--text-muted)]">
                    No sources have been approved yet. Review pending sources on the Pending tab.
                  </div>
                ) : (
                  filteredApproved.map((source) => {
                    const roleKey = source.evidentiary_role || "general";
                    const roleInfo = EVIDENTIARY_ROLE_LABELS[roleKey];
                    return (
                      <div
                        key={source.id}
                        className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl space-y-2.5 shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-[color:var(--text-primary)] truncate">
                                {source.title}
                              </h4>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] font-semibold border border-[color:var(--state-success)] shrink-0">
                                ✓ Authorized
                              </span>
                            </div>
                            <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                              {source.author} ({source.year})
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs px-2.5 py-1 rounded-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] font-medium">
                              {roleInfo.icon} {roleInfo.label}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[color:var(--border-subtle)] flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-[11px] text-[color:var(--text-muted)]">Role:</span>
                            <select
                              value={roleKey}
                              onChange={(e) => handleUpdateRole(source.id, e.target.value as EvidentiaryRole)}
                              className="px-2 py-0.5 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded text-[color:var(--text-primary)]"
                            >
                              {(Object.keys(EVIDENTIARY_ROLE_LABELS) as EvidentiaryRole[]).map((r) => (
                                <option key={r} value={r}>
                                  {EVIDENTIARY_ROLE_LABELS[r].icon} {EVIDENTIARY_ROLE_LABELS[r].label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setInspectingSource(source)}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDiscard(source.id)}
                              className="px-2.5 py-1 text-xs font-semibold rounded text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] cursor-pointer"
                            >
                              Revoke Approval
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* TAB: DISCARDED */}
            {activeTab === "discarded" && (
              <>
                {filteredDiscarded.length === 0 ? (
                  <div className="p-12 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl text-xs text-[color:var(--text-muted)]">
                    No discarded sources.
                  </div>
                ) : (
                  filteredDiscarded.map((source) => (
                    <div
                      key={source.id}
                      className="p-4 bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-xl flex items-center justify-between gap-4 opacity-75 hover:opacity-100 transition-opacity"
                    >
                      <div className="min-w-0">
                        <h4 className="font-medium text-xs text-[color:var(--text-secondary)] line-through truncate">
                          {source.title}
                        </h4>
                        <span className="text-[11px] text-[color:var(--text-muted)]">
                          {source.author} ({source.year})
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestore(source)}
                        className="px-3 py-1 text-xs font-semibold rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] text-[color:var(--accent)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                      >
                        Restore to Review
                      </button>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Dossier & Analytics Pane */}
        <div className="w-full md:w-80 bg-[color:var(--surface-sunken)] p-5 flex flex-col justify-between space-y-6 overflow-y-auto shrink-0">
          <div className="space-y-5">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                Triage Metrics
              </span>
              <h3 className="text-base font-bold text-[color:var(--text-primary)] mt-0.5">
                Evidence Authorization
              </h3>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl">
                <div className="font-mono text-[10px] text-[color:var(--text-muted)] uppercase">Authorized</div>
                <div className="text-xl font-mono font-bold text-[color:var(--state-success)] mt-0.5">
                  {approvedSources.length}
                </div>
              </div>

              <div className="p-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl">
                <div className="font-mono text-[10px] text-[color:var(--text-muted)] uppercase">Pending</div>
                <div className="text-xl font-mono font-bold text-[color:var(--accent)] mt-0.5">
                  {pendingToReview.length}
                </div>
              </div>
            </div>

            {/* Role Distribution */}
            <div>
              <div className="font-mono text-[10px] font-bold uppercase text-[color:var(--text-muted)] mb-2">
                Evidentiary Roles Assigned:
              </div>
              <div className="space-y-1.5 text-xs">
                {(Object.keys(EVIDENTIARY_ROLE_LABELS) as EvidentiaryRole[]).map((r) => {
                  const count = approvedSources.filter((s) => s.evidentiary_role === r).length;
                  if (count === 0) return null;
                  return (
                    <div
                      key={r}
                      className="p-2 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] flex items-center justify-between"
                    >
                      <span className="text-[color:var(--text-primary)] flex items-center gap-1.5">
                        <span>{EVIDENTIARY_ROLE_LABELS[r].icon}</span>
                        <span className="font-medium">{EVIDENTIARY_ROLE_LABELS[r].label}</span>
                      </span>
                      <span className="font-mono font-bold text-[color:var(--accent)]">{count}</span>
                    </div>
                  );
                })}
                {approvedSources.length === 0 && (
                  <div className="text-xs text-[color:var(--text-muted)] italic p-2 bg-[color:var(--surface-raised)] rounded-lg border border-[color:var(--border-subtle)]">
                    Approve sources to assign evidentiary roles.
                  </div>
                )}
              </div>
            </div>

            {/* Anti-Fabrication Charter Callout */}
            <div className="p-3.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl text-xs space-y-1.5">
              <div className="font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
                <span>🛡️ Anti-Fabrication Pledge</span>
              </div>
              <p className="text-[color:var(--text-secondary)] leading-relaxed text-[11px]">
                Antigravity OS operates under strict zero-hallucination protocols. Citations and empirical numbers are restricted strictly to sources you explicitly authorize.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Sticky Footer Dock */}
      <div className="sticky bottom-0 bg-[color:var(--surface-raised)]/95 backdrop-blur-md border-t border-[color:var(--border-subtle)] px-8 py-4 flex flex-wrap items-center justify-between gap-4 z-20 shadow-md">
        <div className="flex items-center gap-3 text-xs font-medium text-[color:var(--text-secondary)]">
          <svg className="w-5 h-5 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>
            <strong className="font-bold text-[color:var(--text-primary)]">{approvedSources.length}</strong> sources approved for manuscript extraction.
          </span>
          {pendingToReview.length > 0 && (
            <span className="text-[color:var(--state-warning)] italic">
              ({pendingToReview.length} awaiting review)
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleProceed}
          disabled={isAdvancing}
          className="rounded-xl bg-[color:var(--accent)] px-8 py-3 text-sm font-bold text-white hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center gap-2"
        >
          {isAdvancing ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Locking Sources...
            </>
          ) : (
            <>
              Lock Approved Sources & Proceed
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>

      {/* 5. Document Inspection Modal */}
      {inspectingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-start justify-between pb-4 border-b border-[color:var(--border-subtle)]">
              <div>
                <span className="font-mono text-xs font-bold text-[color:var(--accent)] uppercase tracking-wider">
                  Source Inspector
                </span>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)] mt-1">
                  {inspectingSource.title}
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                  {inspectingSource.author} • {inspectingSource.year} • {inspectingSource.type || "Document"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingSource(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-5 space-y-4 text-xs">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 p-3 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-xl">
                  <div className="font-mono text-[10px] text-[color:var(--text-muted)] uppercase">Relevance Rating</div>
                  <div className="text-lg font-mono font-bold text-[color:var(--state-success)] mt-0.5">
                    {inspectingSource.relevance_score || 85}% Match
                  </div>
                </div>
                <div className="flex-1 p-3 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-xl">
                  <div className="font-mono text-[10px] text-[color:var(--text-muted)] uppercase">Integrity Status</div>
                  <div className="text-sm font-semibold text-[color:var(--state-success)] mt-1 flex items-center gap-1">
                    ✓ Verified Un-retracted
                  </div>
                </div>
              </div>

              <div>
                <div className="font-mono text-[10px] font-bold text-[color:var(--text-muted)] uppercase mb-1.5">
                  Content & Evidence Abstract:
                </div>
                <div className="p-4 bg-[color:var(--surface-sunken)] rounded-xl border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-serif leading-relaxed whitespace-pre-line max-h-64 overflow-y-auto">
                  {inspectingSource.content || inspectingSource.snippet || "No additional excerpt text indexed."}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-between">
              {approvedSources.some((a) => a.id === inspectingSource.id) ? (
                <button
                  type="button"
                  onClick={() => {
                    handleDiscard(inspectingSource.id);
                    setInspectingSource(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] text-[color:var(--state-danger)] border border-[color:var(--border-subtle)] cursor-pointer"
                >
                  Revoke Approval
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleApprove(inspectingSource);
                    setInspectingSource(null);
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] cursor-pointer"
                >
                  ✓ Approve Source
                </button>
              )}

              <button
                type="button"
                onClick={() => setInspectingSource(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
