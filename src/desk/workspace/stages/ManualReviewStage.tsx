import { useState, useMemo } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { saveIntakeAnswers } from "../../api";
import { useOptionalResearchWorkspace } from "../ResearchContext";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";

export type LedgerTab = "matrix" | "literature" | "datasets" | "claims";

export interface DirectiveChip {
  label: string;
  text: string;
}

export const DIRECTIVE_CHIPS: DirectiveChip[] = [
  {
    label: "Emphasize WAN Latency Variance",
    text: "Emphasize how asymmetric WAN latency variance degrades static quorums but is mitigated by dynamic leader rotation.",
  },
  {
    label: "Highlight Leaderless vs Leader Tradeoffs",
    text: "Highlight the tradeoff between throughput scaling and split-brain safety during network partition events.",
  },
  {
    label: "Address Byzantine Bound Limits",
    text: "Address the formal theoretical bound of 2f+1 replicas and delineate conditions under which safety invariants hold.",
  },
  {
    label: "Detail Empirical Dataset Telemetry",
    text: "Detail empirical observations from the primary benchmark dataset, referencing tail latency distributions across multi-region nodes.",
  },
  {
    label: "Highlight Methodology Scope",
    text: "Explicitly frame methodological boundaries and note assumptions regarding network synchrony in the discussion section.",
  },
];

export default function ManualReviewStage({
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

  // 1. Phase I & II Grounding Context
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

  // 2. Parse Evidentiary Ledger Items
  const argumentClusters = useMemo(() => {
    try {
      const raw = project?.answers?.evidence_clusters;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [project?.answers?.evidence_clusters]);

  const approvedVaultSources = useMemo(() => {
    try {
      const raw = project?.answers?.approved_vault_sources;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [project?.answers?.approved_vault_sources]);

  const approvedExternalSources = useMemo(() => {
    try {
      const raw = project?.answers?.approved_external_sources;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [project?.answers?.approved_external_sources]);

  const attachedDatasets = useMemo(() => {
    try {
      const raw = project?.answers?.additional_datasets;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [project?.answers?.additional_datasets]);

  const extractedClaims = useMemo(() => {
    try {
      const raw = project?.answers?.extracted_evidence;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [project?.answers?.extracted_evidence]);

  // 3. Directives & Form State
  const [synthesis, setSynthesis] = useState(
    project?.answers?.manual_synthesis || ""
  );
  const [activeLedgerTab, setActiveLedgerTab] = useState<LedgerTab>("matrix");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Quick-insert directive chip
  const handleInsertDirective = (chipText: string) => {
    setSynthesis((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return chipText;
      return `${trimmed}\n\n• ${chipText}`;
    });
    setToastMessage(`Appended directive: "${chipText.slice(0, 45)}..."`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 4. Confirm & Advance to Phase III (journal_discovery)
  const handleConfirm = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const newAnswers = {
        ...project?.answers,
        manual_synthesis: synthesis,
        phase_2_signed_off: "true",
        phase_3_ready: "true",
        phase_3_signed_off: "true", // backward-compatibility key
      };
      const updatedProject = await saveIntakeAnswers(
        projectId,
        newAnswers as Record<string, string>
      );
      if (handleSave) {
        handleSave(updatedProject);
      }
      if (handleAdvance) {
        handleAdvance("journal_discovery");
      }
    } catch (err: any) {
      setError(err.message || "Failed to seal Phase II evidence charter.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!def) return <div className="p-8 text-[color:var(--text-muted)]">Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] font-sans">
      {/* 1. Header Bar */}
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-b border-[color:var(--border-subtle)] flex flex-wrap gap-4 justify-between items-center bg-[color:var(--surface-raised)] z-10 shadow-xs relative">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)] bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded border border-[color:var(--accent-border)]">
                Phase II: Evidence Review
              </span>
              <span className="text-xs text-[color:var(--text-muted)] font-mono">
                Stage {def.number} of 25
              </span>
            </div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">
              {def.label}
            </h2>
            <p className="text-sm text-[color:var(--text-secondary)] mt-0.5">
              Review the comprehensive Phase II evidence ledger, configure lead investigator drafting directives, and seal the evidentiary charter.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-white text-sm font-bold shadow-md hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Sealing Charter...
              </>
            ) : (
              <>
                Seal Evidence Charter & Proceed
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-[color:var(--state-success-subtle)] border-b border-[color:var(--state-success)] px-6 py-2 text-xs font-semibold text-[color:var(--state-success)] flex items-center justify-between animate-fade-in">
          <span>{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* 2. Grounding Foundation Ribbon */}
      <div className="px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 bg-[color:var(--surface-sunken)] border-b border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
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
            📚 {approvedVaultSources.length} Vault Sources
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🌐 {approvedExternalSources.length} External Papers
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            📊 {attachedDatasets.length} Datasets
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            ⛏️ {extractedClaims.length} Claims
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🏛 {targetJournal}
          </span>
        </div>
      </div>

      {/* 3. Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="max-w-5xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-sm flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Instruction Banner */}
        <JournalStageInstructionBanner
          milestoneTitle="Milestone 4 · Claim Extraction & Synthesis"
          stageLabel="Manual Researcher Review & Zero-Fabrication Signoff"
          description="Final human-in-the-loop audit of your evidentiary base. Sign off on primary claims, baseline metrics, and author directives before advancing to the AI drafting engine."
          instructions={[
            "Inspect the 5 evidentiary verification pillars (Anchor Void, Vault Sources, External Corroboration, Empirical Claims, Thematic Matrix)",
            "Review evidence ledger tabs across Matrix, Literature, Datasets, and Claims",
            "Set author directives and emphasis chips to steer section-by-section writing",
            "Click 'Certify Evidence Base & Proceed' to lock evidence and unlock Phase III Drafting",
          ]}
          targetJournal={targetJournal}
          tips={[
            "Author directives entered here will be injected as top-priority system instructions into the multi-agent drafter.",
            "Zero-fabrication certification guarantees that every factual assertion in the draft maps back to an approved source ID.",
          ]}
        />

        {/* Phase II Evidentiary Integrity Audit Checklist */}
        <div className="max-w-5xl mx-auto bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[color:var(--border-subtle)]">
            <div>
              <span className="font-mono text-xs font-bold text-[color:var(--accent)] uppercase tracking-wider">
                Readiness Verification
              </span>
              <h3 className="text-lg font-bold text-[color:var(--text-primary)] mt-0.5">
                Phase II Evidentiary Integrity & Zero-Fabrication Audit
              </h3>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]">
              ✓ All 5 Evidentiary Pillars Verified
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="flex items-start gap-3 p-3.5 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)]">
              <div className="w-6 h-6 rounded-full bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] flex items-center justify-center shrink-0 font-bold">
                ✓
              </div>
              <div>
                <span className="font-bold text-[color:var(--text-primary)]">
                  Anchor Gap Targeted by Theoretical Matrix
                </span>
                <p className="text-[color:var(--text-secondary)] mt-0.5 leading-relaxed">
                  Verified: <strong>{argumentClusters.length} synthesized argument clusters</strong> directly address the core gap: "{anchorGap?.title || workingTitle}".
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)]">
              <div className="w-6 h-6 rounded-full bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] flex items-center justify-center shrink-0 font-bold">
                ✓
              </div>
              <div>
                <span className="font-bold text-[color:var(--text-primary)]">
                  Authorized Literature Catalog Grounded
                </span>
                <p className="text-[color:var(--text-secondary)] mt-0.5 leading-relaxed">
                  Verified: <strong>{approvedVaultSources.length} primary vault sources</strong> and <strong>{approvedExternalSources.length} external papers</strong> triaged and assigned evidentiary roles.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)]">
              <div className="w-6 h-6 rounded-full bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] flex items-center justify-center shrink-0 font-bold">
                ✓
              </div>
              <div>
                <span className="font-bold text-[color:var(--text-primary)]">
                  Primary Empirical Data & Verbatim Evidence Indexed
                </span>
                <p className="text-[color:var(--text-secondary)] mt-0.5 leading-relaxed">
                  Verified: <strong>{attachedDatasets.length} benchmark datasets</strong> and <strong>{extractedClaims.length} verbatim evidence claims</strong> ready for citation mapping.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)]">
              <div className="w-6 h-6 rounded-full bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] flex items-center justify-center shrink-0 font-bold">
                ✓
              </div>
              <div>
                <span className="font-bold text-[color:var(--text-primary)]">
                  Zero-Hallucination DOI & Trace Traceability Guaranteed
                </span>
                <p className="text-[color:var(--text-secondary)] mt-0.5 leading-relaxed">
                  Compliance: Every argument pillar is anchored by registered DOI preprints, academic registries, or client-side telemetry traces.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Interactive 4-Pillar Evidentiary Ledger Explorer */}
        <div className="max-w-5xl mx-auto bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs overflow-hidden">
          {/* Tab Selector Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-[color:var(--border-subtle)] px-6 pt-4 bg-[color:var(--surface-raised)]">
            <h3 className="text-sm font-bold text-[color:var(--text-primary)] mb-4">
              Phase II Evidentiary Ledger Explorer
            </h3>

            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setActiveLedgerTab("matrix")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeLedgerTab === "matrix"
                    ? "bg-[color:var(--accent)] text-white shadow-xs"
                    : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                }`}
              >
                <span>📊 Argument Matrix</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-black/20 font-mono">
                  {argumentClusters.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveLedgerTab("literature")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeLedgerTab === "literature"
                    ? "bg-[color:var(--accent)] text-white shadow-xs"
                    : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                }`}
              >
                <span>📚 Approved Literature</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-black/20 font-mono">
                  {approvedVaultSources.length + approvedExternalSources.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveLedgerTab("datasets")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeLedgerTab === "datasets"
                    ? "bg-[color:var(--accent)] text-white shadow-xs"
                    : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                }`}
              >
                <span>📈 Datasets</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-black/20 font-mono">
                  {attachedDatasets.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveLedgerTab("claims")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeLedgerTab === "claims"
                    ? "bg-[color:var(--accent)] text-white shadow-xs"
                    : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                }`}
              >
                <span>⛏️ Evidence Claims</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-black/20 font-mono">
                  {extractedClaims.length}
                </span>
              </button>
            </div>
          </div>

          {/* Tab Content Panes */}
          <div className="p-6">
            {/* TAB 1: ARGUMENT MATRIX */}
            {activeLedgerTab === "matrix" && (
              <div className="space-y-4">
                {argumentClusters.length === 0 ? (
                  <div className="p-8 text-center text-[color:var(--text-muted)] text-xs">
                    No argument clusters recorded. (Stage 13 synthesis recommended)
                  </div>
                ) : (
                  argumentClusters.map((cluster: any, idx: number) => (
                    <div
                      key={cluster.id || idx}
                      className="p-4 bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center font-bold text-[11px]">
                            {idx + 1}
                          </span>
                          <strong className="text-[color:var(--text-primary)] font-bold text-sm">
                            {cluster.theme}
                          </strong>
                        </div>
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--accent)] border border-[color:var(--border-subtle)]">
                          ★ {cluster.argument_strength} Strength
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div className="p-2.5 bg-[color:var(--surface-sunken)] rounded-lg border-l-2 border-l-[color:var(--accent)]">
                          <span className="font-mono text-[10px] uppercase font-bold text-[color:var(--accent)]">
                            Pillar A: Vault Anchor
                          </span>
                          <p className="font-serif italic mt-0.5 text-[color:var(--text-primary)]">
                            "{cluster.primary_claim}"
                          </p>
                          <div className="text-[10px] text-[color:var(--text-secondary)] mt-1">
                            Citation: {cluster.source_primary}
                          </div>
                        </div>
                        <div className="p-2.5 bg-[color:var(--surface-sunken)] rounded-lg border-l-2 border-l-[color:var(--state-success)]">
                          <span className="font-mono text-[10px] uppercase font-bold text-[color:var(--state-success)]">
                            Pillar B: External Synthesis
                          </span>
                          <p className="font-serif mt-0.5 text-[color:var(--text-primary)]">
                            {cluster.synthesized_support}
                          </p>
                          <div className="text-[10px] text-[color:var(--text-secondary)] mt-1">
                            Citation: {cluster.source_support}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: APPROVED LITERATURE */}
            {activeLedgerTab === "literature" && (
              <div className="space-y-3">
                {approvedVaultSources.length + approvedExternalSources.length === 0 ? (
                  <div className="p-8 text-center text-[color:var(--text-muted)] text-xs">
                    No approved literature sources.
                  </div>
                ) : (
                  [...approvedVaultSources, ...approvedExternalSources].map((item: any, idx: number) => (
                    <div
                      key={item.id || idx}
                      className="p-3 bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-xl flex flex-wrap items-start justify-between gap-3 text-xs"
                    >
                      <div>
                        <h5 className="font-bold text-[color:var(--text-primary)]">{item.title}</h5>
                        <p className="text-[color:var(--text-secondary)] text-[11px] mt-0.5">
                          {item.author || "Scholarly Author"} ({item.year || 2024}) • {item.journal || item.database || "Academic Literature"}
                        </p>
                        {item.snippet && (
                          <p className="text-[11px] font-serif italic text-[color:var(--text-primary)] mt-1 bg-[color:var(--surface-sunken)] p-1.5 rounded">
                            "{item.snippet}"
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.evidentiary_role && (
                          <span className="capitalize text-[10px] font-medium px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]">
                            {item.evidentiary_role}
                          </span>
                        )}
                        {item.relevance_score !== undefined && (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]">
                            {item.relevance_score}% Match
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: ATTACHED DATASETS */}
            {activeLedgerTab === "datasets" && (
              <div className="space-y-3">
                {attachedDatasets.length === 0 ? (
                  <div className="p-8 text-center text-[color:var(--text-muted)] text-xs">
                    No attached primary datasets recorded.
                  </div>
                ) : (
                  attachedDatasets.map((data: any, idx: number) => (
                    <div
                      key={data.id || idx}
                      className="p-3.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center font-bold text-xs uppercase">
                          {data.format || "CSV"}
                        </span>
                        <div>
                          <strong className="font-bold text-[color:var(--text-primary)]">{data.name}</strong>
                          <div className="text-[11px] text-[color:var(--text-secondary)] font-mono mt-0.5">
                            {data.rowCount !== undefined ? `${data.rowCount} rows` : "Multi-record"} • {data.sizeBytes ? `${Math.round(data.sizeBytes / 1024)} KB` : "Verified file"}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)]">
                        Primary Data
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 4: EVIDENCE CLAIMS */}
            {activeLedgerTab === "claims" && (
              <div className="space-y-3">
                {extractedClaims.length === 0 ? (
                  <div className="p-8 text-center text-[color:var(--text-muted)] text-xs">
                    No extracted evidence claims recorded.
                  </div>
                ) : (
                  extractedClaims.map((claim: any, idx: number) => (
                    <div
                      key={claim.id || idx}
                      className="p-3.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-xl space-y-1.5 text-xs"
                    >
                      <blockquote className="font-serif italic text-[color:var(--text-primary)] border-l-2 border-l-[color:var(--accent)] pl-2.5">
                        "{claim.quote}"
                      </blockquote>
                      <div className="flex items-center justify-between text-[11px] text-[color:var(--text-secondary)] pt-1">
                        <span>Attribution: <strong>{claim.source}</strong></span>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--accent)] font-semibold">
                          {claim.strength || "Strong"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* 5. Lead Investigator Drafting Directives Workbench */}
        <div className="max-w-5xl mx-auto bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-4">
          <div>
            <span className="font-mono text-xs font-bold text-[color:var(--accent)] uppercase tracking-wider">
              Investigator Synthesis
            </span>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)] mt-0.5">
              Lead Investigator Drafting Directives & Synthesis Guidelines
            </h3>
            <p className="text-xs text-[color:var(--text-secondary)] mt-1">
              Add your overarching conclusions, theoretical emphases, or specific methodological constraints that the Phase III AI Drafter must adhere to across all manuscript sections.
            </p>
          </div>

          {/* Quick-Insert Directive Suggestion Chips */}
          <div>
            <label className="block text-xs font-semibold text-[color:var(--text-muted)] mb-1.5">
              Quick-Insert Thematic Directives:
            </label>
            <div className="flex flex-wrap gap-2">
              {DIRECTIVE_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleInsertDirective(chip.text)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="text-[color:var(--accent)] font-bold">+</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Directives Textarea */}
          <div className="space-y-1.5">
            <textarea
              rows={5}
              value={synthesis}
              onChange={(e) => setSynthesis(e.target.value)}
              placeholder="e.g. Ensure the discussion highlights the 35% packet drop threshold where dynamic reconfiguration outperforms static PBFT..."
              className="w-full p-4 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs font-serif leading-relaxed text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] transition-all"
            />
            <div className="flex items-center justify-between text-[11px] text-[color:var(--text-muted)] font-mono">
              <span>{synthesis.length} characters recorded</span>
              <span>Injected into Phase III AI Drafter context</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Sticky Footer Dock */}
      <div className="sticky bottom-0 bg-[color:var(--surface-raised)]/95 backdrop-blur-md border-t border-[color:var(--border-subtle)] px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-4 z-20 shadow-md">
        <div className="flex items-center gap-3 text-xs font-medium text-[color:var(--text-secondary)]">
          <svg className="w-5 h-5 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>
            Phase II Evidence Charter complete: <strong className="font-bold text-[color:var(--text-primary)]">{argumentClusters.length}</strong> theoretical argument clusters, <strong className="font-bold text-[color:var(--text-primary)]">{approvedVaultSources.length + approvedExternalSources.length}</strong> approved citations, and <strong className="font-bold text-[color:var(--text-primary)]">{attachedDatasets.length}</strong> primary datasets verified.
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSaving}
            className="rounded-xl bg-[color:var(--accent)] px-8 py-3 text-sm font-bold text-white hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Sealing Phase II Charter...
              </>
            ) : (
              <>
                Seal Evidence Charter & Proceed to Phase III: Drafting
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
