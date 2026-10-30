import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { saveIntakeAnswers, authedStreamFetch } from "../../api";
import { useOptionalResearchWorkspace } from "../ResearchContext";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";

export type ClaimStrength = "Strong" | "Moderate" | "Weak";
export type ClaimType =
  | "Empirical Support"
  | "Benchmark Statistic"
  | "Theoretical Proof"
  | "Methodological Rationale"
  | "Comparative Baseline"
  | "General Claim";

export interface EvidenceItem {
  id: string;
  quote: string;
  source: string;
  claim_type: ClaimType;
  strength: ClaimStrength;
  tags: string[];
  page_or_loc?: string;
  notes?: string;
}

export interface ClaimFormState {
  id?: string;
  quote: string;
  source: string;
  claim_type: ClaimType;
  strength: ClaimStrength;
  tags: string;
  page_or_loc: string;
  notes: string;
}

const INITIAL_CLAIM_FORM: ClaimFormState = {
  quote: "",
  source: "",
  claim_type: "Empirical Support",
  strength: "Strong",
  tags: "",
  page_or_loc: "",
  notes: "",
};

export default function EvidenceExtractionStage({
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

  // Approved Vault Sources & Datasets
  const approvedSources = useMemo(() => {
    try {
      const raw = project?.answers?.approved_vault_sources;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [project?.answers?.approved_vault_sources]);

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

  // 2. Extracted Evidence State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<EvidenceItem[] | null>(() => {
    try {
      const saved = project?.answers?.extracted_evidence;
      if (saved) {
        const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return null;
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // 3. Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [strengthFilter, setStrengthFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // 4. Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [claimForm, setClaimForm] = useState<ClaimFormState>(INITIAL_CLAIM_FORM);
  const [isEditing, setIsEditing] = useState(false);

  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  // Persistence helper
  const persistEvidence = useCallback(
    async (nextResults: EvidenceItem[]) => {
      if (project) {
        const newAnswers = {
          ...project.answers,
          extracted_evidence: JSON.stringify(nextResults),
          evidence_extraction: "completed",
        };
        const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        if (handleSave) {
          handleSave(updated);
        }
      }
    },
    [handleSave, project, projectId]
  );


  // 5. Extraction Runner
  const startExtraction = async () => {
    clearTimer();
    setIsProcessing(true);
    setError(null);
    setLogs([
      {
        id: `log-${Date.now()}-1`,
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: "Starting evidence extraction…",
      },
      {
        id: `log-${Date.now()}-2`,
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Grounding multi-dimensional extraction across ${approvedSources.length} authorized vault sources and ${attachedDatasets.length} primary datasets...`,
      },
    ]);


    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/evidence-extraction`,
        "POST",
        {
          sources: approvedSources,
          datasets: attachedDatasets,
          workingTitle,
          anchorGapTitle: anchorGap?.title,
          targetJournal,
          methodology,
          deepExtraction: true,
        },
        async (event, data) => {
          if (event === "log" || event === "chunk") {
            setLogs((prev) => [
              ...prev,
              {
                id: `log-${Date.now()}-${Math.random()}`,
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: event === "chunk" ? "action" : "info",
                message: data.message || data.chunk || JSON.stringify(data),
              },
            ]);
          } else if (event === "done") {
            clearTimer();
            // Only claims the AI extracted (with a quote); no invented source
            // name or "Strong" rating.
            const minedItems: EvidenceItem[] = (Array.isArray(data.data) ? data.data : [])
              .filter((d: any) => typeof d?.quote === "string" && d.quote.trim())
              .map((d: any, i: number) => ({
                id: d.id || `ev-mined-${Date.now()}-${i}`,
                quote: d.quote,
                source: d.source || "",
                claim_type: (d.claim_type as ClaimType) || "Empirical Support",
                strength: (d.strength as ClaimStrength) || "Weak",
                tags: Array.isArray(d.tags) ? d.tags : [],
                page_or_loc: d.page_or_loc || "",
                notes: d.notes || "",
              }));

            // An empty answer must not wipe evidence the user already has.
            if (minedItems.length > 0) {
              setResults(minedItems);
              await persistEvidence(minedItems);
            }

            setLogs((prev) => [
              ...prev,
              {
                id: `log-${Date.now()}-done`,
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message:
                  minedItems.length > 0
                    ? `Extraction complete: ${minedItems.length} claims extracted. Check each against its source.`
                    : "The AI extracted no claims. Nothing was added.",
              },
            ]);

            setSuccessToast(minedItems.length > 0 ? `Extracted ${minedItems.length} claims. Review, edit, or add your own.` : "No claims extracted.");
            setTimeout(() => setSuccessToast(null), 5000);
          } else if (event === "error") {
            throw new Error(data.message || "Streaming endpoint returned an error.");
          }
        }
      );
    } catch (err: any) {
      clearTimer();
      console.warn("AI request failed:", err);
      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-fail`,
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "error",
          message: "Evidence extraction unavailable: nothing was added. Connect an AI provider in AI Access, or try again.",
        },
      ]);
    } finally {
      clearTimer();
      setIsProcessing(false);
    }
  };

  // 6. Claim CRUD Handlers
  const handleOpenAddModal = () => {
    setClaimForm(INITIAL_CLAIM_FORM);
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: EvidenceItem) => {
    setClaimForm({
      id: item.id,
      quote: item.quote,
      source: item.source,
      claim_type: item.claim_type,
      strength: item.strength,
      tags: item.tags.join(", "),
      page_or_loc: item.page_or_loc || "",
      notes: item.notes || "",
    });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handleSaveClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimForm.quote.trim()) return;

    const tagList = claimForm.tags
      ? claimForm.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : ["Evidence"];

    let nextResults: EvidenceItem[];
    if (isEditing && claimForm.id) {
      nextResults = (results || []).map((r) =>
        r.id === claimForm.id
          ? {
              ...r,
              quote: claimForm.quote.trim(),
              source: claimForm.source.trim() || "Empirical Observation",
              claim_type: claimForm.claim_type,
              strength: claimForm.strength,
              tags: tagList,
              page_or_loc: claimForm.page_or_loc.trim(),
              notes: claimForm.notes.trim(),
            }
          : r
      );
      setSuccessToast("Evidence claim updated.");
    } else {
      const newItem: EvidenceItem = {
        id: `ev-custom-${Date.now()}`,
        quote: claimForm.quote.trim(),
        source: claimForm.source.trim() || "Direct Observation / Empirical Dataset",
        claim_type: claimForm.claim_type,
        strength: claimForm.strength,
        tags: tagList,
        page_or_loc: claimForm.page_or_loc.trim(),
        notes: claimForm.notes.trim(),
      };
      nextResults = [newItem, ...(results || [])];
      setSuccessToast("New evidence claim added to matrix.");
    }

    setResults(nextResults);
    await persistEvidence(nextResults);
    setIsModalOpen(false);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const handleDeleteClaim = async (id: string) => {
    const nextResults = (results || []).filter((r) => r.id !== id);
    setResults(nextResults);
    await persistEvidence(nextResults);
    setSuccessToast("Evidence claim removed.");
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Filtered evidence items
  const filteredResults = useMemo(() => {
    if (!results) return null;
    return results.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        item.quote.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (strengthFilter !== "all" && item.strength !== strengthFilter) return false;
      if (typeFilter !== "all" && item.claim_type !== typeFilter) return false;

      return true;
    });
  }, [results, searchQuery, strengthFilter, typeFilter]);

  // Metric counts
  const strengthCounts = useMemo(() => {
    const counts = { Strong: 0, Moderate: 0, Weak: 0 };
    if (results) {
      results.forEach((r) => {
        if (counts[r.strength] !== undefined) counts[r.strength]++;
      });
    }
    return counts;
  }, [results]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      "Empirical Support": 0,
      "Benchmark Statistic": 0,
      "Theoretical Proof": 0,
      "Methodological Rationale": 0,
      "Comparative Baseline": 0,
      "General Claim": 0,
    };
    if (results) {
      results.forEach((r) => {
        if (counts[r.claim_type] !== undefined) counts[r.claim_type]++;
        else counts[r.claim_type] = 1;
      });
    }
    return counts;
  }, [results]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopyQuote = (id: string, text: string) => {
    try {
      navigator.clipboard?.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.warn("Clipboard write failed:", err);
    }
  };

  // Lock and Advance
  const [isAdvancing, setIsAdvancing] = useState(false);
  const handleProceed = async () => {
    setIsAdvancing(true);
    try {
      if (results) {
        await persistEvidence(results);
      }
      if (handleAdvance) {
        handleAdvance("external_research");
      }
    } catch (err) {
      console.error("Failed to advance stage:", err);
      if (handleAdvance) {
        handleAdvance("external_research");
      }
    } finally {
      setIsAdvancing(false);
    }
  };

  const getStrengthBadgeClasses = (strength: ClaimStrength) => {
    switch (strength) {
      case "Strong":
        return "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border-[color:var(--state-success)]";
      case "Moderate":
        return "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] border-[color:var(--state-warning)]";
      case "Weak":
        return "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] border-[color:var(--state-danger)]";
    }
  };

  const getClaimTypeBadgeClasses = (type: ClaimType) => {
    switch (type) {
      case "Empirical Support":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      case "Benchmark Statistic":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
      case "Theoretical Proof":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";
      case "Methodological Rationale":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      case "Comparative Baseline":
        return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30";
      default:
        return "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]";
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
                Phase II: Evidence Extraction
              </span>
              <span className="text-xs text-[color:var(--text-muted)] font-mono">Stage {def.number} of 25</span>
            </div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">
              {def.label}
            </h2>
            <p className="text-sm text-[color:var(--text-secondary)] mt-0.5">
              Deploy the Data Miner Agent to extract verbatim quotes, empirical statistics, and evidentiary proofs from your authorized corpus.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-sm font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <svg className="w-4 h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            + Add Evidence Claim
          </button>

          <button
            type="button"
            onClick={startExtraction}
            disabled={isProcessing}
            className="px-5 py-2 rounded-lg bg-[color:var(--accent)] text-[color:var(--text-inverse)] text-sm font-bold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Mining Evidence...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {results ? "Re-Mine Evidence" : "Run Data Miner Agent"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Notification Toast */}
      {successToast && (
        <div className="bg-[color:var(--state-success-subtle)] border-b border-[color:var(--state-success)] px-6 py-2.5 text-xs font-semibold text-[color:var(--state-success)] flex items-center justify-between animate-fade-in">
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
            📚 {approvedSources.length} Authorized Sources
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            📊 {attachedDatasets.length} Datasets Attached
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🏛 {targetJournal}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🔬 {methodology}
          </span>
        </div>
      </div>

      {/* 3. Main Scrollable Workspace */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <JournalStageInstructionBanner
          milestoneTitle="Milestone 4 · Claim Extraction & Synthesis"
          stageLabel="Claim Extraction & Evidentiary Matrix"
          description="Extract verified empirical claims, benchmark statistics, theoretical theorems, and methodological arguments from your approved sources and datasets."
          instructions={[
            "Click 'Run AI Deep Extraction' to parse claims from authorized sources and datasets",
            "Classify claims across Empirical Support, Benchmark Statistic, and Theoretical Proof",
            "Tag claims with section targets (e.g., #Results, #Methodology, #Discussion)",
            "Manually add or edit claims using '+ New Claim' to ensure completeness",
          ]}
          targetJournal={project?.answers?.["target_journal"]}
          tips={[
            "Every claim extracted here is assigned a permanent source identifier, preventing citation mismatch in your final manuscript.",
            "Higher claim density in Results and Discussion directly correlates with smoother peer review.",
          ]}
        />

        {/* Terminal logs during extraction */}
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-5xl mx-auto">
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="Data Miner Agent"
            />
          </div>
        )}

        {/* Error Callout */}
        {error && (
          <div className="max-w-5xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-sm flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Empty State before extraction */}
        {!results && !isProcessing && (
          <div className="max-w-4xl mx-auto p-12 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs space-y-4">
            <div className="w-16 h-16 bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-[color:var(--accent)] rounded-2xl flex items-center justify-center mx-auto text-2xl">
              ⛏️
            </div>
            <h3 className="text-xl font-bold text-[color:var(--text-primary)]">
              Data Miner Ready for Extraction
            </h3>
            <p className="text-sm text-[color:var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              The agent will analyze your <strong className="text-[color:var(--text-primary)]">{approvedSources.length} approved vault sources</strong> and <strong className="text-[color:var(--text-primary)]">{attachedDatasets.length} empirical datasets</strong> to extract verbatim quotations, statistical parameters, and empirical proof blocks.
            </p>

            <div className="pt-2 flex justify-center gap-3">
              <button
                type="button"
                onClick={startExtraction}
                className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-sm shadow-md hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Launch Evidence Extraction
              </button>

              <button
                type="button"
                onClick={handleOpenAddModal}
                className="px-5 py-2.5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-xs font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                + Add Custom Claim
              </button>
            </div>
          </div>
        )}

        {/* Extracted Evidence Matrix */}
        {results && (
          <div className="max-w-5xl mx-auto space-y-5">
            {/* Dashboard Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl">
                <div className="font-mono text-[10px] text-[color:var(--text-muted)] uppercase">Total Claims</div>
                <div className="text-xl font-mono font-bold text-[color:var(--text-primary)] mt-0.5">
                  {results.length}
                </div>
              </div>
              <div className="p-3.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl">
                <div className="font-mono text-[10px] text-[color:var(--state-success)] uppercase">Strong Claims</div>
                <div className="text-xl font-mono font-bold text-[color:var(--state-success)] mt-0.5">
                  {strengthCounts.Strong}
                </div>
              </div>
              <div className="p-3.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl">
                <div className="font-mono text-[10px] text-[color:var(--state-warning)] uppercase">Moderate Claims</div>
                <div className="text-xl font-mono font-bold text-[color:var(--state-warning)] mt-0.5">
                  {strengthCounts.Moderate}
                </div>
              </div>
              <div className="p-3.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl">
                <div className="font-mono text-[10px] text-[color:var(--accent)] uppercase">Corpus Sources</div>
                <div className="text-xl font-mono font-bold text-[color:var(--accent)] mt-0.5">
                  {approvedSources.length + attachedDatasets.length}
                </div>
              </div>
            </div>

            {/* Deep Extraction Lens Distribution */}
            <div className="p-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase font-bold text-[color:var(--accent)] bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded border border-[color:var(--accent-border)]">
                  Multi-Dimensional Lenses
                </span>
                <span className="text-[color:var(--text-secondary)] font-medium">
                  {results.length} total claims synthesized across 5 academic dimensions
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  📊 {typeCounts["Empirical Support"] || 0} Empirical
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  📈 {typeCounts["Benchmark Statistic"] || 0} Benchmarks
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  📐 {typeCounts["Theoretical Proof"] || 0} Proofs
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  🧪 {typeCounts["Methodological Rationale"] || 0} Protocols
                </span>
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  ⚖️ {typeCounts["Comparative Baseline"] || 0} Baselines
                </span>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[240px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search claims by quote, citation, or tag..."
                    className="w-full pl-9 pr-4 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                  <svg className="w-4 h-4 text-[color:var(--text-muted)] absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                {/* Strength Filter Pills */}
                <div className="flex items-center gap-1">
                  {(["all", "Strong", "Moderate", "Weak"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStrengthFilter(s)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                        strengthFilter === s
                          ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)] shadow-xs"
                          : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                      }`}
                    >
                      {s === "all" ? "All Strengths" : `${s} (${strengthCounts[s] || 0})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lens Typology Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[color:var(--border-subtle)] text-xs">
                <span className="font-mono text-[10px] uppercase font-bold text-[color:var(--text-muted)] mr-1">
                  Lens Filter:
                </span>
                <button
                  type="button"
                  onClick={() => setTypeFilter("all")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    typeFilter === "all"
                      ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)] shadow-xs"
                      : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                  }`}
                >
                  All Types ({results.length})
                </button>
                {([
                  { type: "Empirical Support" as const, label: "Empirical Support", icon: "📊" },
                  { type: "Benchmark Statistic" as const, label: "Benchmark Statistic", icon: "📈" },
                  { type: "Theoretical Proof" as const, label: "Theoretical Proof", icon: "📐" },
                  { type: "Methodological Rationale" as const, label: "Methodological Rationale", icon: "🧪" },
                  { type: "Comparative Baseline" as const, label: "Comparative Baseline", icon: "⚖️" },
                ]).map((ct) => {
                  const count = typeCounts[ct.type] || 0;
                  return (
                    <button
                      key={ct.type}
                      type="button"
                      onClick={() => setTypeFilter(ct.type)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                        typeFilter === ct.type
                          ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)] shadow-xs"
                          : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                      }`}
                    >
                      <span>{ct.icon}</span>
                      <span>{ct.label}</span>
                      <span className="opacity-75 font-mono text-[10px]">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Evidence Cards List */}
            {filteredResults && filteredResults.length === 0 ? (
              <div className="p-10 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl text-xs text-[color:var(--text-muted)]">
                No evidence claims match your active search or filter.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredResults?.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-[color:var(--border-control)] rounded-2xl transition-all shadow-xs space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase font-mono tracking-wider border ${getStrengthBadgeClasses(
                            item.strength
                          )}`}
                        >
                          {item.strength} Evidence
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-md font-semibold border ${getClaimTypeBadgeClasses(
                            item.claim_type
                          )}`}
                        >
                          {item.claim_type}
                        </span>
                        {item.page_or_loc && (
                          <span className="text-[11px] text-[color:var(--text-muted)] font-mono bg-[color:var(--surface-sunken)] px-2 py-0.5 rounded border border-[color:var(--border-subtle)]">
                            📍 {item.page_or_loc}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyQuote(item.id, item.quote)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer transition-colors flex items-center gap-1.5"
                          title="Copy verbatim excerpt"
                        >
                          {copiedId === item.id ? (
                            <>
                              <span className="text-[color:var(--state-success)]">✓ Copied</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-[color:var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          className="px-3 py-1 text-xs font-semibold rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer transition-colors"
                        >
                          Edit Claim
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClaim(item.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] rounded-lg cursor-pointer transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Verbatim Excerpt Block */}
                    <blockquote className="text-base font-serif text-[color:var(--text-primary)] leading-relaxed border-l-4 border-[color:var(--accent)] pl-4 py-1 italic bg-[color:var(--surface-canvas)] rounded-r-xl">
                      "{item.quote}"
                    </blockquote>

                    {/* Evidentiary Notes / Analytical Context */}
                    {item.notes && (
                      <div className="p-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-secondary)] flex items-start gap-2.5">
                        <span className="text-[color:var(--accent)] text-sm shrink-0">💡</span>
                        <div>
                          <span className="font-bold text-[color:var(--text-primary)] mr-1.5">Analytical Context:</span>
                          <span className="leading-relaxed">{item.notes}</span>
                        </div>
                      </div>
                    )}

                    {/* Source Attribution & Tags */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-[color:var(--border-subtle)]">
                      <div className="flex items-center gap-2 font-medium text-[color:var(--text-secondary)]">
                        <svg className="w-4 h-4 text-[color:var(--accent)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <span>Attribution: <strong className="text-[color:var(--text-primary)]">{item.source}</strong></span>
                      </div>

                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.tags.map((t, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] px-2 py-0.5 rounded-md bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)] font-mono"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Sticky Footer Dock */}
      <div className="sticky bottom-0 bg-[color:var(--surface-raised)]/95 backdrop-blur-md border-t border-[color:var(--border-subtle)] px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-4 z-20 shadow-md">
        <div className="flex items-center gap-3 text-xs font-medium text-[color:var(--text-secondary)]">
          <svg className="w-5 h-5 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>
            <strong className="font-bold text-[color:var(--text-primary)]">{results?.length || 0}</strong> evidence claims synthesized in matrix.
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleProceed}
            disabled={isAdvancing}
            className="rounded-xl bg-[color:var(--accent)] px-8 py-3 text-sm font-bold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center gap-2"
          >
            {isAdvancing ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Locking Evidence...
              </>
            ) : (
              <>
                Lock Evidence Ledger & Proceed to External Discovery
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 5. Claim Editor & Creator Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl max-w-xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-start justify-between pb-4 border-b border-[color:var(--border-subtle)]">
              <div>
                <span className="font-mono text-xs font-bold text-[color:var(--accent)] uppercase tracking-wider">
                  {isEditing ? "Edit Evidence Claim" : "New Evidence Claim"}
                </span>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)] mt-0.5">
                  {isEditing ? "Modify Extracted Quote" : "Synthesize Custom Claim"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveClaim} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Verbatim Quote / Empirical Finding <span className="text-[color:var(--state-danger)]">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={claimForm.quote}
                  onChange={(e) => setClaimForm({ ...claimForm, quote: e.target.value })}
                  placeholder="Paste excerpt, statistical finding, or empirical proof..."
                  className="w-full px-3 py-2 text-xs font-serif bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Citation Attribution <span className="text-[color:var(--state-danger)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={claimForm.source}
                    onChange={(e) => setClaimForm({ ...claimForm, source: e.target.value })}
                    placeholder="e.g. Castro & Liskov (2002)"
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Location / Page / Section
                  </label>
                  <input
                    type="text"
                    value={claimForm.page_or_loc}
                    onChange={(e) => setClaimForm({ ...claimForm, page_or_loc: e.target.value })}
                    placeholder="e.g. p. 412, Section 4.2"
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Claim Typology
                  </label>
                  <select
                    value={claimForm.claim_type}
                    onChange={(e) => setClaimForm({ ...claimForm, claim_type: e.target.value as ClaimType })}
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  >
                    <option value="Empirical Support">Empirical Support</option>
                    <option value="Benchmark Statistic">Benchmark Statistic</option>
                    <option value="Theoretical Proof">Theoretical Proof</option>
                    <option value="Methodological Rationale">Methodological Rationale</option>
                    <option value="Comparative Baseline">Comparative Baseline</option>
                    <option value="General Claim">General Claim</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Evidentiary Strength
                  </label>
                  <select
                    value={claimForm.strength}
                    onChange={(e) => setClaimForm({ ...claimForm, strength: e.target.value as ClaimStrength })}
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  >
                    <option value="Strong">Strong (Direct empirical proof/statistic)</option>
                    <option value="Moderate">Moderate (Contextual finding)</option>
                    <option value="Weak">Weak (Ancillary claim)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Semantic Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={claimForm.tags}
                  onChange={(e) => setClaimForm({ ...claimForm, tags: e.target.value })}
                  placeholder="e.g. latency, WAN, byzantine consensus"
                  className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-colors shadow-xs cursor-pointer"
                >
                  {isEditing ? "Save Claim Changes" : "Save Evidence Claim"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
