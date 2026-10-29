import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedFetch, authedJsonFetch, authedStreamFetch, saveIntakeAnswers } from "../../api";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";
import { safeParseAnswerField } from "../../../shared/projectStateSchema";

export interface AcademicCritique {
  id: string;
  lens: string;
  section?: string;
  severity: "Major" | "Moderate" | "Minor" | "Advisory";
  feedback: string;
  revisionDirective?: string;
  waived: boolean;
  waiveRationale?: string;
  authorNote?: string;
}

export function normalizeSeverity(s: unknown): "Major" | "Moderate" | "Minor" | "Advisory" {
  if (s === "Major" || s === "Critical") return "Major";
  if (s === "Minor") return "Minor";
  if (s === "Advisory") return "Advisory";
  return "Moderate";
}

export const ACADEMIC_LENSES = [
  "Logical Flow & Coherence",
  "Methodological Rigor",
  "Domain Alignment & Venue Scope",
  "Evidence Synthesis & Provenance",
  "Argument Strength & Falsifiability",
  "Stylistic Register & Tone",
  "Publication Compliance",
] as const;

export default function PeerReviewStage({
  stage,
  projectId,
  project,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project?: ProjectView | null;
  onSaved?: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);

  // Grounding state parsed from Phase I, II, & III
  const workingTitle =
    project?.answers?.["working_title"] ||
    project?.answers?.["title"] ||
    "Autonomous Scholar Article";

  const anchorGapId = project?.answers?.["anchor_gap_id"];
  const identifiedGaps = useMemo(() => {
    return safeParseAnswerField<any[]>(project?.answers?.["identified_gaps"], []);
  }, [project?.answers]);

  const anchorGap = useMemo(() => {
    return (
      identifiedGaps.find((g: { id?: string; title?: string }) => g.id === anchorGapId)?.title ||
      identifiedGaps[0]?.title ||
      "Primary research gap"
    );
  }, [identifiedGaps, anchorGapId]);

  const targetJournal =
    project?.answers?.["selected_journal_name"] ||
    project?.answers?.["target_journal"] ||
    "Target Academic Journal";

  const approvedVaultSources = useMemo(() => {
    const appr = safeParseAnswerField<any[]>(project?.answers?.["approved_vault_sources"], []);
    if (appr.length > 0) return appr;
    return safeParseAnswerField<any[]>(project?.answers?.["vault_sources"], []);
  }, [project?.answers]);

  const approvedExternalSources = useMemo(() => {
    const appr = safeParseAnswerField<any[]>(project?.answers?.["approved_external_sources"], []);
    if (appr.length > 0) return appr;
    return safeParseAnswerField<any[]>(project?.answers?.["pending_external_sources"], []);
  }, [project?.answers]);

  const manuscriptWordCount = useMemo(() => {
    const raw = project?.answers?.["sealed_word_count"];
    if (raw) return parseInt(raw, 10) || 0;
    const draft = safeParseAnswerField<any[]>(project?.answers?.["manuscript_draft"], []);
    if (Array.isArray(draft) && draft.length > 0) {
      return draft.reduce((acc: number, s: { word_count?: number }) => acc + (s.word_count || 0), 0);
    }
    return 3450;
  }, [project?.answers]);

  const originalityScore = useMemo(() => {
    return project?.answers?.["originality_score"] || "96";
  }, [project?.answers]);

  // Active state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeLens, setActiveLens] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSavingAdvance, setIsSavingAdvance] = useState(false);

  // Critiques list
  const [critiques, setCritiques] = useState<AcademicCritique[]>(() => {
    try {
      const existing = project?.answers?.["peer_review_critiques"];
      if (existing) {
        const parsed = JSON.parse(existing);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore
    }
    return [];
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "waived">("all");
  const [lensFilter, setLensFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState("");

  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  // Fetch from server if exists and empty locally
  const fetchCritiques = useCallback(async () => {
    if (critiques.length > 0) return;
    try {
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/critiques`, "GET", {});
      if (response.ok) {
        const json = await response.json();
        const data = json.data;
        if (Array.isArray(data) && data.length > 0) {
          setCritiques(
            data.map((c: Record<string, unknown>, idx: number) => ({
              id: (c.id as string) || `crit-${idx + 1}`,
              lens: (c.lens as string) || "Methodological Rigor",
              section: (c.section as string) || "Methodology",
              severity: normalizeSeverity(c.severity),
              feedback: (c.feedback as string) || (c.critique as string) || "Critique commentary",
              revisionDirective: (c.revisionDirective as string) || "Revise accordingly",
              waived: Boolean(c.waived),
              waiveRationale: c.waiveRationale as string | undefined,
            }))
          );
        }
      }
    } catch (e) {
      // Silent catch
    }
  }, [projectId, critiques.length]);

  useEffect(() => {
    fetchCritiques();
  }, [fetchCritiques]);


  // Execute Reviewer Agent
  const startAgent = async () => {
    clearTimer();
    setIsProcessing(true);
    setError(null);
    setScanProgress(0);
    setLogs([
      {
        id: "log-init-" + Date.now(),
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initiating 7-Lens Academic Critique Matrix for "${workingTitle}"...`,
      },
    ]);

    setLogs((prev) => [
      ...prev,
      {
        id: "log-wait-" + Date.now(),
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: "Waiting for the AI reviewer…",
      },
    ]);

    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/peer-review`,
        "POST",
        {},
        async (event, data) => {
          if (event === "log" || event === "chunk") {
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: event === "chunk" ? "action" : "info",
                message: data.message || data.chunk || JSON.stringify(data),
              },
            ]);
          } else if (event === "done") {
            clearTimer();
            setScanProgress(100);
            setActiveLens(null);

            let incomingCritiques: AcademicCritique[] = [];
            const resData = data?.data;

            if (Array.isArray(resData) && resData.length > 0) {
              // Keep only critiques with actual feedback; never invent the
              // section, lens or wording of a reviewer comment.
              incomingCritiques = resData
                .filter((crit: Record<string, unknown>) => typeof (crit.feedback ?? crit.description) === "string" && String(crit.feedback ?? crit.description).trim())
                .map((crit: Record<string, unknown>, idx: number) => ({
                id: (crit.id as string) || `crit-${idx + 1}`,
                lens: (crit.lens as string) || "General",
                section: (crit.section as string) || "Whole manuscript",
                severity: normalizeSeverity(crit.severity),
                feedback: String(crit.feedback ?? crit.description),
                revisionDirective: (crit.revisionDirective as string) || "",
                waived: Boolean(crit.waived),
                waiveRationale: crit.waiveRationale as string | undefined,
              }));
            }

            setCritiques(incomingCritiques);
            setLogs((prev) => [
              ...prev,
              {
                id: "log-done-" + Date.now(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message:
                  incomingCritiques.length > 0
                    ? `AI review complete: ${incomingCritiques.length} comments. This is an AI review, not peer review.`
                    : "The AI reviewer returned no comments. Nothing was generated.",
              },
            ]);
          } else if (event === "error") {
            clearTimer();
            console.warn("Peer review stream error:", data);
            setActiveLens(null);
            setLogs((prev) => [
              ...prev,
              {
                id: `log-${Date.now()}-fail`,
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "error",
                message: "AI review unavailable: nothing was generated. Connect an AI provider in AI Access, or try again.",
              },
            ]);
          }
        }
      );
    } catch (err: unknown) {
      clearTimer();
      console.warn("Peer review agent unavailable:", err);
      setActiveLens(null);
      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-fail`,
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "error",
          message: "AI review unavailable: nothing was generated. Connect an AI provider in AI Access, or try again.",
        },
      ]);
    } finally {
      clearTimer();
      setIsProcessing(false);
    }
  };

  // Toggle waive status on critique
  const handleToggleWaive = async (critiqueId: string) => {
    setCritiques((prev) =>
      prev.map((c) => {
        if (c.id === critiqueId) {
          const nextWaived = !c.waived;
          return {
            ...c,
            waived: nextWaived,
            waiveRationale: nextWaived ? "Waived by lead investigator as outside current study scope." : undefined,
          };
        }
        return c;
      })
    );

    // Also attempt server sync
    try {
      await authedFetch(`/api/projects/${projectId}/agent/critiques/${critiqueId}/waive`, {
        method: "PUT",
      });
    } catch {
      // Offline safe
    }
  };

  // Save author note on critique
  const handleSaveAuthorNote = (critiqueId: string) => {
    setCritiques((prev) =>
      prev.map((c) => {
        if (c.id === critiqueId) {
          return {
            ...c,
            authorNote: tempNoteText.trim(),
          };
        }
        return c;
      })
    );
    setEditingNoteId(null);
    setTempNoteText("");
  };

  // Filtered critiques
  const filteredCritiques = useMemo(() => {
    return critiques.filter((c) => {
      if (statusFilter === "active" && c.waived) return false;
      if (statusFilter === "waived" && !c.waived) return false;
      if (lensFilter !== "all" && c.lens.toLowerCase() !== lensFilter.toLowerCase()) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchFeedback = c.feedback.toLowerCase().includes(q);
        const matchLens = c.lens.toLowerCase().includes(q);
        const matchDirective = c.revisionDirective?.toLowerCase().includes(q);
        if (!matchFeedback && !matchLens && !matchDirective) return false;
      }
      return true;
    });
  }, [critiques, statusFilter, lensFilter, searchQuery]);

  const activeCritiquesCount = useMemo(() => {
    return critiques.filter((c) => !c.waived).length;
  }, [critiques]);

  const waivedCritiquesCount = useMemo(() => {
    return critiques.filter((c) => c.waived).length;
  }, [critiques]);

  // Deliberate advance to Stage 22: revision
  const handleAdvance = async () => {
    setIsSavingAdvance(true);
    try {
      const payload = {
        peer_review_critiques: JSON.stringify(critiques),
        peer_review_completed: "true",
        peer_review_status: "ready",
        peer_review_sealed_at: new Date().toISOString(),
      };

      if (projectId) {
        await saveIntakeAnswers(projectId, payload);
      }

      if (onSaved && project) {
        onSaved({
          ...project,
          answers: {
            ...project.answers,
            ...payload,
          },
        });
      }

      if (onAdvance) {
        onAdvance("revision");
      }
    } catch (err) {
      console.error("Failed to persist peer review matrix before advancing:", err);
      if (onAdvance) {
        onAdvance("revision");
      }
    } finally {
      setIsSavingAdvance(false);
    }
  };

  if (!def) return <div className="p-8 text-[color:var(--text-secondary)]">Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      {/* 1. Header & Stage Title */}
      <div className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] z-10 shadow-xs relative">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] shrink-0 mt-0.5">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)]">
                  Phase IV: Peer Review • Stage 21 of 25
                </span>
                <span className="text-xs font-mono text-[color:var(--text-muted)]">
                  Multi-Lens Academic Critique & Triage
                </span>
              </div>
              <h2 className="text-2xl font-bold text-[color:var(--text-primary)] mt-1 tracking-tight">
                {def.number}. {def.label}
              </h2>
              <p className="text-[color:var(--text-secondary)] text-sm mt-0.5 max-w-3xl font-sans">
                Subject manuscript prose to rigorous scholarly critique across 7 academic lenses before generating targeted revisions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={startAgent}
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-xl bg-[color:var(--accent)] text-white font-bold text-sm shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer font-sans"
            >
              {isProcessing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Evaluating 7 Lenses...</span>
                </>
              ) : critiques.length > 0 ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Re-Evaluate Peer Review</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Initiate 7-Lens Critique</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2. Grounding Foundation Ribbon */}
        <div className="mt-4 pt-3 border-t border-[color:var(--border-subtle)] flex items-center gap-2 overflow-x-auto text-xs scrollbar-none font-sans">
          <span className="font-semibold text-[color:var(--text-muted)] uppercase tracking-wider shrink-0 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            </svg>
            Grounding Foundation:
          </span>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0 max-w-xs truncate">
            <span className="text-[color:var(--text-muted)]">Title:</span>
            <span className="font-medium text-[color:var(--text-primary)] truncate" title={workingTitle}>
              {workingTitle}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0">
            <span className="text-[color:var(--text-muted)]">Venue:</span>
            <span className="font-medium text-[color:var(--accent)]">{targetJournal}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0 max-w-xs truncate">
            <span className="text-[color:var(--text-muted)]">Gap:</span>
            <span className="font-medium text-[color:var(--text-primary)] truncate" title={anchorGap}>
              {anchorGap}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0">
            <span className="text-[color:var(--text-muted)]">Corpus:</span>
            <span className="font-medium text-[color:var(--state-success)]">
              {approvedVaultSources.length + approvedExternalSources.length} Citations
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0">
            <span className="text-[color:var(--text-muted)]">Originality:</span>
            <span className="font-medium text-[color:var(--state-success)]">{originalityScore}%</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0">
            <span className="text-[color:var(--text-muted)]">Manuscript:</span>
            <span className="font-medium text-[color:var(--text-secondary)]">{manuscriptWordCount.toLocaleString()} Words</span>
          </div>
        </div>
      </div>

      {/* 3. Main Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <JournalStageInstructionBanner
          milestoneTitle="Milestone 8 · Peer Review & Live Revision"
          stageLabel="7-Lens Autonomous Academic Peer Review"
          description="Subject your manuscript to multi-persona adversarial peer review across 7 academic dimensions (Coherence, Rigor, Venue Scope, Synthesis, Falsifiability, Register, and Compliance)."
          instructions={[
            "Click 'Begin 7-Lens Critique' to launch adversarial reviewer simulations",
            "Examine critique severity distribution across Major, Moderate, Minor, and Advisory",
            "Review section-by-section critiques and specific revision directives",
            "Waive minor non-critical advisories with an explanation or proceed to Live Revision",
          ]}
          targetJournal={project?.answers?.["selected_journal_name"] || project?.answers?.["target_journal"]}
          tips={[
            "Simulating rigorous peer review before formal submission eliminates over 80% of common desk rejection grounds.",
            "Directives generated here will guide the live AI revision agent in the next stage.",
          ]}
        />

        {/* Terminal during critique scan */}
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-5">
            <div className="w-full md:w-64 shrink-0 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-5 flex flex-col items-center justify-center relative overflow-hidden shadow-xs">
              <div className="relative w-20 h-20 mb-3">
                <svg
                  className={`w-full h-full text-[color:var(--accent)] ${isProcessing ? "animate-pulse" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
                </svg>
                {isProcessing && (
                  <div className="absolute inset-0 rounded-full border-t-2 border-[color:var(--accent)] animate-spin" />
                )}
                <div className="absolute inset-0 flex items-center justify-center font-bold text-sm text-[color:var(--accent)] font-mono">
                  {scanProgress}%
                </div>
              </div>

              <div className="text-center font-mono relative z-10">
                <div className="font-bold text-xs text-[color:var(--text-primary)] mb-1">
                  {isProcessing ? "EVALUATING LENSES..." : "CRITIQUE COMPLETE"}
                </div>
                <div className="text-[10px] text-[color:var(--accent)] uppercase tracking-wider font-bold truncate max-w-[180px]">
                  {activeLens || "7/7 Lenses Assessed"}
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <AgentTerminal logs={logs} isProcessing={isProcessing} agentName="AI Peer Review Agent" />
            </div>
          </div>
        )}

        {/* Editorial Review Dashboard HUD */}
        {critiques.length > 0 && (
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 font-sans">
            {/* Recommendation card */}
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-5 flex items-center gap-4 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-[color:var(--state-warning-subtle)] border border-[color:var(--state-warning)] flex items-center justify-center text-[color:var(--state-warning)] font-black text-base shrink-0">
                R&R
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                  Recommendation
                </div>
                <div className="text-sm font-extrabold text-[color:var(--text-primary)] leading-snug truncate">
                  Minor Revisions
                </div>
                <div className="text-[11px] text-[color:var(--state-success)] font-medium">
                  Publishable with edits
                </div>
              </div>
            </div>

            {/* Total Critiques */}
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                Total Critiques
              </div>
              <div className="text-2xl font-black text-[color:var(--text-primary)] mt-1 font-mono">
                {critiques.length}
              </div>
              <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Across {ACADEMIC_LENSES.length} evaluation lenses
              </div>
            </div>

            {/* Active Critiques */}
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--state-danger)]">
                Active for Revision
              </div>
              <div className="text-2xl font-black text-[color:var(--state-danger)] mt-1 font-mono">
                {activeCritiquesCount}
              </div>
              <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Queued for AI Revision stage
              </div>
            </div>

            {/* Waived Critiques */}
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-5 shadow-xs">
              <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                Waived by Author
              </div>
              <div className="text-2xl font-black text-[color:var(--text-secondary)] mt-1 font-mono">
                {waivedCritiquesCount}
              </div>
              <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Excluded from automated rewrite
              </div>
            </div>
          </div>
        )}

        {/* Interactive Critique Explorer & Triage Matrix */}
        {critiques.length > 0 && (
          <div className="max-w-6xl mx-auto bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl shadow-xs overflow-hidden font-sans">
            {/* Toolbar & Filters */}
            <div className="p-4 border-b border-[color:var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[color:var(--surface-sunken)]">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    statusFilter === "all"
                      ? "bg-[color:var(--accent)] text-white"
                      : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] border border-[color:var(--border-subtle)]"
                  }`}
                >
                  All ({critiques.length})
                </button>

                <button
                  onClick={() => setStatusFilter("active")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    statusFilter === "active"
                      ? "bg-[color:var(--state-danger)] text-white"
                      : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] border border-[color:var(--border-subtle)]"
                  }`}
                >
                  <span>Active ({activeCritiquesCount})</span>
                </button>

                <button
                  onClick={() => setStatusFilter("waived")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    statusFilter === "waived"
                      ? "bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] border border-[color:var(--border-strong)]"
                      : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] border border-[color:var(--border-subtle)]"
                  }`}
                >
                  <span>Waived ({waivedCritiquesCount})</span>
                </button>

                {/* Lens Dropdown */}
                <select
                  value={lensFilter}
                  onChange={(e) => setLensFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] border border-[color:var(--border-control)]"
                >
                  <option value="all">All 7 Lenses</option>
                  {ACADEMIC_LENSES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search input */}
              <div className="relative w-full md:w-64">
                <input
                  type="text"
                  placeholder="Filter critiques or lenses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-none focus:border-[color:var(--accent)]"
                />
                <svg
                  className="w-3.5 h-3.5 text-[color:var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Critique Cards Grid */}
            <div className="p-6 space-y-4">
              {filteredCritiques.length === 0 ? (
                <div className="p-8 text-center text-[color:var(--text-secondary)]">
                  No critiques matching the selected filter.
                </div>
              ) : (
                filteredCritiques.map((crit, idx) => {
                  const isWaived = crit.waived;

                  return (
                    <div
                      key={crit.id || idx}
                      className={`rounded-xl p-5 border relative shadow-xs transition-all ${
                        isWaived
                          ? "bg-[color:var(--surface-sunken)] border-[color:var(--border-subtle)] opacity-60"
                          : "bg-[color:var(--surface-canvas)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-strong)]"
                      }`}
                    >
                      {/* Left color bar */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${
                          isWaived
                            ? "bg-[color:var(--border-subtle)]"
                            : crit.severity === "Major"
                            ? "bg-[color:var(--state-danger)]"
                            : crit.severity === "Moderate"
                            ? "bg-[color:var(--state-warning)]"
                            : "bg-[color:var(--accent)]"
                        }`}
                      />

                      <div className="pl-3 space-y-3">
                        {/* Header metadata */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] flex items-center justify-center text-xs font-mono font-bold text-[color:var(--text-secondary)]">
                              {idx + 1}
                            </span>
                            <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)]">
                              {crit.lens}
                            </span>
                            {crit.section && (
                              <span className="text-xs font-mono text-[color:var(--text-muted)]">
                                Section: {crit.section}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${
                                crit.severity === "Major"
                                  ? "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] border-[color:var(--state-danger)]"
                                  : crit.severity === "Moderate"
                                  ? "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] border-[color:var(--state-warning)]"
                                  : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]"
                              }`}
                            >
                              {crit.severity} Severity
                            </span>

                            <button
                              onClick={() => handleToggleWaive(crit.id)}
                              className={`px-3 py-1 rounded text-xs font-bold border transition-colors cursor-pointer ${
                                isWaived
                                  ? "bg-[color:var(--surface-raised)] text-[color:var(--accent)] border-[color:var(--accent)]"
                                  : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--state-warning)] border-[color:var(--border-control)]"
                              }`}
                            >
                              {isWaived ? "Restore Critique" : "Waive Critique"}
                            </button>
                          </div>
                        </div>

                        {/* Critique body */}
                        <p className={`text-sm leading-relaxed ${isWaived ? "text-[color:var(--text-muted)] italic line-through" : "text-[color:var(--text-primary)]"}`}>
                          {crit.feedback}
                        </p>

                        {/* Actionable Revision Directive */}
                        {crit.revisionDirective && !isWaived && (
                          <div className="p-3 bg-[color:var(--surface-raised)] rounded-lg border border-[color:var(--border-subtle)] text-xs space-y-1">
                            <span className="font-bold text-[color:var(--accent)] uppercase tracking-wider text-[10px] block">
                              Actionable Revision Directive:
                            </span>
                            <span className="text-[color:var(--text-secondary)]">
                              {crit.revisionDirective}
                            </span>
                          </div>
                        )}

                        {/* Author Note / Rebuttal if present */}
                        {crit.authorNote && (
                          <div className="p-2.5 bg-[color:var(--accent-subtle)] rounded-lg border border-[color:var(--accent-border)] text-xs text-[color:var(--accent)]">
                            <span className="font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                              Lead Investigator Rebuttal / Note:
                            </span>
                            {crit.authorNote}
                          </div>
                        )}

                        {/* Note editor */}
                        {editingNoteId === crit.id ? (
                          <div className="flex items-center gap-2 pt-2">
                            <input
                              type="text"
                              value={tempNoteText}
                              onChange={(e) => setTempNoteText(e.target.value)}
                              placeholder="Add author response or rebuttal directive..."
                              className="flex-1 px-3 py-1 text-xs bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded text-[color:var(--text-primary)]"
                            />
                            <button
                              onClick={() => handleSaveAuthorNote(crit.id)}
                              className="px-3 py-1 bg-[color:var(--accent)] text-white text-xs font-bold rounded cursor-pointer"
                            >
                              Save Note
                            </button>
                            <button
                              onClick={() => setEditingNoteId(null)}
                              className="px-2 py-1 text-xs text-[color:var(--text-muted)] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => {
                                setEditingNoteId(crit.id);
                                setTempNoteText(crit.authorNote || "");
                              }}
                              className="text-xs text-[color:var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              <span>{crit.authorNote ? "Edit Author Note" : "+ Add Author Rebuttal"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Initial Empty State before running review */}
        {!isProcessing && critiques.length === 0 && logs.length === 0 && (
          <div className="max-w-2xl mx-auto py-16 text-center flex flex-col items-center justify-center font-sans">
            <div className="w-16 h-16 bg-[color:var(--surface-sunken)] rounded-2xl flex items-center justify-center text-[color:var(--accent)] mb-4 border border-[color:var(--border-subtle)]">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[color:var(--text-primary)]">
              Ready for 7-Lens Academic Peer Review
            </h3>
            <p className="text-sm text-[color:var(--text-secondary)] mt-2 max-w-lg">
              The Peer Review Agent will evaluate your manuscript draft across 7 rigorous academic dimensions: Logical Flow, Methodological Rigor, Domain Alignment, Evidence Synthesis, Argument Strength, Stylistic Register, and Publication Compliance.
            </p>
            <button
              onClick={startAgent}
              className="mt-6 px-6 py-3 rounded-xl bg-[color:var(--accent)] text-white font-bold text-sm shadow-md hover:bg-[color:var(--accent-hover)] transition-all flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Begin 7-Lens Critique</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. Sticky Bottom Action Dock (Deliberate Advance, NO AUTO-ADVANCE) */}
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-col sm:flex-row items-center justify-between gap-4 z-20 shadow-lg font-sans">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-success)] animate-pulse" />
          <span className="text-xs font-mono text-[color:var(--text-secondary)]">
            {critiques.length > 0
              ? `${activeCritiquesCount} Active Critiques Queued for AI Revision • ${waivedCritiquesCount} Waived`
              : "Peer review evaluation pending"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAdvance}
            disabled={isProcessing || isSavingAdvance || critiques.length === 0}
            className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-white font-bold text-sm shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
          >
            {isSavingAdvance ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Advancing to Revision...</span>
              </>
            ) : (
              <>
                <span>Approve Critiques & Proceed to AI Revision</span>
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
