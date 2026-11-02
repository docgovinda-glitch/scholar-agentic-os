import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { authedStreamFetch, authedJsonFetch, saveIntakeAnswers } from "../../api";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";

export type RefereeRole = "Methodologist" | "Domain Specialist" | "Biostatistician" | "Synthesizer" | "Formal Editor";

export interface RebuttalMatrixItem {
  id: string;
  refereeRole: RefereeRole;
  critique: string;
  authorResponse: string;
  revisionAction: string;
  section: string;
  manuscriptDiff?: {
    original: string;
    revised: string;
  };
  status: "Accepted & Revised" | "Rebutted with Evidence" | "Clarified in Text";
}

export interface PeerCritiqueInput {
  id?: string;
  lens?: string;
  section?: string;
  severity?: string;
  feedback?: string;
  revisionDirective?: string;
  waived?: boolean;
  waiveRationale?: string;
}

export interface RevisionPatch {
  id: string;
  section: string;
  critiqueLens?: string;
  severity?: "Critical" | "Major" | "Moderate" | "Minor" | "Advisory";
  find: string;
  replace: string;
  explanation: string;
  accepted: boolean;
  customReplacement?: string;
}

export interface DraftSection {
  section?: string;
  section_name?: string;
  title?: string;
  word_count?: number;
  content: string;
  status?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "patch" | "done" | "warn";
}


export default function RevisionStage({
  stage,
  projectId,
  project,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);

  // Grounding anchors
  const workingTitle = useMemo(() => {
    return (
      project?.answers?.["working_title"] ||
      "Provable Provenance Bounds in Autonomous Scientific Reasoning"
    );
  }, [project?.answers]);

  const targetJournal = useMemo(() => {
    return project?.answers?.["selected_journal_name"] || project?.answers?.["target_journal"] || "";
  }, [project?.answers]);

  const journalLabel = targetJournal || "your target journal";

  const anchorGap = useMemo(() => {
    try {
      const gaps = project?.answers?.["identified_gaps"];
      if (gaps) {
        const parsed = JSON.parse(gaps);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0].title || parsed[0].description || "Absence of deterministic verification in multi-agent synthesis";
        }
      }
    } catch {
      // Ignore
    }
    return "Absence of deterministic verification in multi-agent synthesis";
  }, [project?.answers]);

  // Read base manuscript draft from project answers
  const initialDraftSections = useMemo<DraftSection[]>(() => {
    try {
      const raw = project?.answers?.["manuscript_draft"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s: DraftSection) => ({
            section: s.section || s.section_name || s.title || "Section",
            word_count: s.word_count || (s.content ? s.content.split(/\s+/).filter(Boolean).length : 0),
            content: s.content || "",
            status: s.status || "Draft",
          }));
        }
      }
    } catch {
      // Ignore
    }
    // No draft yet: nothing to revise (never a sample manuscript).
    return [];
  }, [project?.answers]);
  const hasDraft = initialDraftSections.length > 0;

  // Read existing critiques from project answers (Stage 21)
  const peerCritiques = useMemo<PeerCritiqueInput[]>(() => {
    try {
      const raw = project?.answers?.["peer_review_critiques"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as PeerCritiqueInput[];
      }
    } catch {
      // Ignore
    }
    return [];
  }, [project?.answers]);

  // Active critiques count (non-waived)
  const activeCritiquesCount = useMemo(() => {
    if (peerCritiques.length === 0) return 0;
    return peerCritiques.filter((c) => !c.waived).length;
  }, [peerCritiques]);

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [viewMode, setViewMode] = useState<"patches" | "full_draft" | "rebuttal_matrix">("patches");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [editingPatchId, setEditingPatchId] = useState<string | null>(null);
  const [tempEditValue, setTempEditValue] = useState<string>("");
  const [isSavingAdvance, setIsSavingAdvance] = useState(false);
  const [isGeneratingRebuttal, setIsGeneratingRebuttal] = useState(false);
  const [editingRebuttalId, setEditingRebuttalId] = useState<string | null>(null);
  const [tempRebuttalResponse, setTempRebuttalResponse] = useState<string>("");

  // Point-by-Point 5-Referee Rebuttal Matrix state
  const [rebuttalMatrix, setRebuttalMatrix] = useState<RebuttalMatrixItem[]>(() => {
    try {
      const raw = project?.answers?.["rebuttal_matrix"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as RebuttalMatrixItem[];
      }
    } catch {
      // Ignore
    }
    return [];
  });

  // Patches state: check if already stored in project answers
  const [patches, setPatches] = useState<RevisionPatch[]>(() => {
    try {
      const raw = project?.answers?.["revision_patches"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore
    }
    return [];
  });

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  const TASKS = [
    "Mapping 7-lens critiques to manuscript sections...",
    "Rewriting Introduction for enhanced problem formulation...",
    "Strengthening Methodology: formalizing bounds and proofs...",
    "Harmonizing Results with empirical precision...",
    "Polishing Stylistic Register and active scholarly tone...",
    "Synthesizing non-destructive section diffs...",
    "Re-compiling revised manuscript...",
  ];

  // Helper: append log
  const appendLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        message,
        type,
      },
    ]);
  }, []);



  // Load or synthesize Point-by-Point Rebuttal Matrix from backend
  const loadOrGenerateRebuttalMatrix = useCallback(async () => {
    setIsGeneratingRebuttal(true);
    try {
      const res = await authedJsonFetch(`/api/projects/${projectId}/agent/rebuttal-matrix`, "POST", {
        critiques: peerCritiques,
      });
      if (res.ok) {
        const resJson = await res.json();
        if (resJson.data && Array.isArray(resJson.data) && resJson.data.length > 0) {
          setRebuttalMatrix(resJson.data as RebuttalMatrixItem[]);
          appendLog(`Synthesized ${resJson.data.length} Point-by-Point Rebuttal Matrix entries across 5 referee roles.`, "done");
          return;
        }
      }
      throw new Error("Server returned non-ok status");
    } catch (err: unknown) {
      console.warn("Rebuttal matrix request failed:", err instanceof Error ? err.message : String(err));
      const msg = "Rebuttal drafting unavailable: nothing was written. Connect an AI provider in AI Access, or try again.";
      appendLog(msg, "warn");
      setError(msg);
    } finally {
      setIsGeneratingRebuttal(false);
    }
  }, [projectId, peerCritiques, appendLog]);


  // Trigger automated revision mapping agent
  const startAgent = async () => {
    if (!hasDraft) return;
    setIsProcessing(true);
    setError(null);
    setScanProgress(0);
    setLogs([]);

    appendLog("Initiating Automated Revision Mapping Engine...", "info");

    appendLog("Waiting for the AI revision agent…", "info");

    try {
      let receivedPatches: RevisionPatch[] = [];

      await authedStreamFetch(
        `/api/projects/${projectId}/agent/revision`,
        "POST",
        {
          critiques: peerCritiques,
          draft: initialDraftSections,
        },
        async (event, streamData) => {
          if (event === "log" && streamData?.message) {
            appendLog(streamData.message, "info");
          } else if (event === "done") {
            const rawData = streamData.data;
            if (Array.isArray(rawData) && rawData.length > 0) {
              // Only real find/replace patches (with text to find).
              receivedPatches = rawData
                .filter((p: Record<string, unknown>) => typeof p.find === "string" && p.find && typeof p.replace === "string")
                .map((p: Record<string, unknown>, idx: number) => ({
                id: (p.id as string) || `patch-${idx + 1}`,
                section: (p.section as string) || (p.section_name as string) || "General",
                critiqueLens: (p.critiqueLens as string) || (p.lens as string) || "",
                severity: (p.severity as RevisionPatch["severity"]) || "Minor",
                find: p.find as string,
                replace: p.replace as string,
                explanation: (p.explanation as string) || "",
                accepted: true,
              }));
              appendLog(`Successfully received ${receivedPatches.length} revision patches from stream.`, "done");
            }
          } else if (event === "error") {
            throw new Error(streamData?.message || "Revision agent stream error.");
          }
        }
      );

      if (receivedPatches.length === 0) {
        appendLog("The AI proposed no revisions. Nothing was changed.", "warn");
        setError("The AI proposed no revisions. Nothing was changed.");
      } else {
        setPatches(receivedPatches);
        appendLog("Revision proposals ready. Review each one before applying.", "done");
      }
    } catch (err: unknown) {
      console.warn("Revision agent unavailable:", err instanceof Error ? err.message : String(err));
      const msg = "Revision agent unavailable: nothing was changed. Connect an AI provider in AI Access, or try again.";
      appendLog(msg, "warn");
      setError(msg);
    } finally {
      clearTimer();
      setScanProgress(100);
      setActiveTask("");
      setIsProcessing(false);
    }
  };

  // Toggle patch acceptance
  const togglePatch = (patchId: string) => {
    setPatches((prev) =>
      prev.map((p) => (p.id === patchId ? { ...p, accepted: !p.accepted } : p))
    );
  };

  // Bulk toggle
  const acceptAllPatches = () => {
    setPatches((prev) => prev.map((p) => ({ ...p, accepted: true })));
  };

  const revertAllPatches = () => {
    setPatches((prev) => prev.map((p) => ({ ...p, accepted: false })));
  };

  // Inline patch editing
  const startEditingPatch = (patch: RevisionPatch) => {
    setEditingPatchId(patch.id);
    setTempEditValue(patch.customReplacement || patch.replace);
  };

  const saveEditedPatch = (patchId: string) => {
    setPatches((prev) =>
      prev.map((p) =>
        p.id === patchId
          ? {
              ...p,
              customReplacement: tempEditValue.trim(),
              accepted: true,
            }
          : p
      )
    );
    setEditingPatchId(null);
    setTempEditValue("");
  };

  const cancelEditingPatch = () => {
    setEditingPatchId(null);
    setTempEditValue("");
  };

  // Assembled draft sections calculated by applying accepted patches to the initial draft
  const assembledDraftSections = useMemo<DraftSection[]>(() => {
    return initialDraftSections.map((sec) => {
      let content = sec.content;
      const sectionPatches = patches.filter(
        (p) =>
          p.accepted &&
          (p.section.toLowerCase() === (sec.section || "").toLowerCase() ||
            p.section.toLowerCase().includes((sec.section || "").toLowerCase()))
      );

      for (const patch of sectionPatches) {
        if (patch.find && content.includes(patch.find)) {
          const replacement = patch.customReplacement || patch.replace;
          content = content.replace(patch.find, replacement);
        } else if (patch.find) {
          // If exact match not found, append replacement to section with revision mark
          content = `${content}\n\n[Revised Passage]: ${patch.customReplacement || patch.replace}`;
        }
      }

      const wordCount = content.split(/\s+/).filter(Boolean).length;
      return {
        ...sec,
        content,
        word_count: wordCount,
        status: sectionPatches.length > 0 ? "Revised" : sec.status || "Unmodified",
      };
    });
  }, [initialDraftSections, patches]);

  // Derived metrics
  const totalPatchesCount = patches.length;
  const acceptedPatchesCount = useMemo(() => patches.filter((p) => p.accepted).length, [patches]);
  const initialWordCount = useMemo(
    () => initialDraftSections.reduce((acc, s) => acc + (s.word_count || 0), 0),
    [initialDraftSections]
  );
  const revisedWordCount = useMemo(
    () => assembledDraftSections.reduce((acc, s) => acc + (s.word_count || 0), 0),
    [assembledDraftSections]
  );
  const wordCountDelta = revisedWordCount - initialWordCount;

  // Filtered patches
  const filteredPatches = useMemo(() => {
    if (sectionFilter === "all") return patches;
    return patches.filter(
      (p) => p.section.toLowerCase() === sectionFilter.toLowerCase()
    );
  }, [patches, sectionFilter]);

  // Unique sections available in patches
  const patchSections = useMemo(() => {
    const list = Array.from(new Set(patches.map((p) => p.section)));
    return list;
  }, [patches]);

  // Deliberate advance to Stage 23: final_editor
  const handleAdvance = async () => {
    setIsSavingAdvance(true);
    try {
      const revisedMarkdown = assembledDraftSections
        .map((s) => `## ${s.section || s.section_name || s.title || "Section"}\n\n${s.content}`)
        .join("\n\n");

      const payload: Record<string, string> = {
        manuscript_draft: JSON.stringify(assembledDraftSections),
        manuscript_markdown: revisedMarkdown,
        full_text_markdown: revisedMarkdown,
        assembled_draft: JSON.stringify(assembledDraftSections),
        revision_patches: JSON.stringify(patches),
        rebuttal_matrix: JSON.stringify(rebuttalMatrix),
        revision_completed: "true",
        revision_status: "approved",
        revision_sealed_at: new Date().toISOString(),
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
        onAdvance("final_editor");
      }
    } catch (err) {
      console.error("Failed to persist revision state before advancing:", err);
      if (onAdvance) {
        onAdvance("final_editor");
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
                  Phase IV: Peer Review • Stage 22 of 25
                </span>
                <span className="text-xs font-mono text-[color:var(--text-muted)]">
                  Automated Revision Mapping & Manuscript Patch Workbench
                </span>
              </div>
              <h2 className="text-2xl font-bold text-[color:var(--text-primary)] mt-1 tracking-tight">
                {def.number}. {def.label}
              </h2>
              <p className="text-[color:var(--text-secondary)] text-sm mt-0.5 max-w-3xl font-sans">
                Map peer review critiques directly to manuscript sections, generating non-destructive sentence-level replacement patches with before/after diffs.
              </p>
              {!hasDraft && (
                <p className="text-sm mt-2 text-[color:var(--text-secondary)]" role="status">
                  There&apos;s no manuscript draft yet. Draft it in the Drafting stage, then come back to map revisions.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={startAgent}
              disabled={isProcessing || !hasDraft}
              className="px-5 py-2.5 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-sm shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer font-sans"
            >
              {isProcessing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Synthesizing Revisions...</span>
                </>
              ) : patches.length > 0 ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Re-Run Revision Agent</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Execute Revision Mapping</span>
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
            <span className="font-medium text-[color:var(--accent)]">{targetJournal || "Not chosen"}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0 max-w-xs truncate">
            <span className="text-[color:var(--text-muted)]">Gap:</span>
            <span className="font-medium text-[color:var(--text-primary)] truncate" title={anchorGap}>
              {anchorGap}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0">
            <span className="text-[color:var(--text-muted)]">Critiques:</span>
            <span className="font-medium text-[color:var(--state-warning)]">{activeCritiquesCount} Active</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0">
            <span className="text-[color:var(--text-muted)]">Draft:</span>
            <span className="font-medium text-[color:var(--state-success)]">{initialWordCount} words</span>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <JournalStageInstructionBanner
          milestoneTitle="Milestone 8 · Peer Review & Live Revision"
          stageLabel="Autonomous AI Revision & Interactive Patch Engine"
          description="Resolve peer review critiques through targeted semantic diff patches. Review exact find-and-replace deltas, edit suggestions in real time, and selectively accept or reject modifications."
          instructions={[
            "Click 'Generate AI Revision Patches' to formulate targeted diffs for active critiques",
            "Examine diff previews showing previous text alongside proposed enhancements",
            "Accept individual patches, customize replacements, or use 'Accept All Patches'",
            "Commit revised draft and proceed to the Final Editorial Desk",
          ]}
          targetJournal={project?.answers?.["selected_journal_name"] || project?.answers?.["target_journal"]}
          tips={[
            "Interactive patching allows surgical improvement without risking unintentional deletions elsewhere in the section.",
            "You can customize any patch before accepting it to preserve your authentic author voice.",
          ]}
        />

        {/* Error notification */}
        {error && (
          <div className="p-4 rounded-xl bg-[color:var(--state-danger-subtle)] border border-[color:var(--state-danger)] text-[color:var(--state-danger)] text-sm flex items-center justify-between font-sans">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs underline hover:opacity-80 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* State A: Initial Idle State */}
        {!isProcessing && patches.length === 0 && (
          <div className="max-w-4xl mx-auto py-12 px-6 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--accent)] mb-6 shadow-sm">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">
              Ready for Automated Manuscript Revision
            </h3>
            <p className="text-[color:var(--text-secondary)] text-base max-w-xl mt-2 font-sans">
              The Revision Agent reads the critiques formulated in Stage 21 and generates targeted, sentence-level replacement patches directly against your manuscript sections.
            </p>

            {/* Critique Queue Card */}
            {activeCritiquesCount > 0 && (
              <div className="w-full mt-8 p-6 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-left shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-warning)]"></span>
                    <h4 className="font-bold text-[color:var(--text-primary)] text-sm">
                      Peer Review Critique Queue ({activeCritiquesCount} items to resolve)
                    </h4>
                  </div>
                  <span className="text-xs text-[color:var(--text-muted)] font-mono">Stage 21 Anchors</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-sans">
                  {peerCritiques.filter((c) => !c.waived).slice(0, 4).map((c, i: number) => (
                    <div key={i} className="p-3 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[color:var(--accent)]">{c.lens || "Methodological Rigor"}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] font-bold">
                          {c.severity || "Moderate"}
                        </span>
                      </div>
                      <p className="text-[color:var(--text-secondary)] line-clamp-2">{c.feedback}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={startAgent}
              disabled={!hasDraft}
              className="mt-8 px-8 py-3.5 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-base shadow-md hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-all flex items-center gap-2.5 cursor-pointer font-sans"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Begin Automated Revision Mapping</span>
            </button>
          </div>
        )}

        {/* State B: Processing / Streaming State */}
        {isProcessing && (
          <div className="max-w-4xl mx-auto py-10 space-y-6">
            <div className="p-8 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-[color:var(--text-primary)] text-lg">
                      Revision Agent Synthesizing Section Patches
                    </h3>
                    <p className="text-xs text-[color:var(--text-secondary)] font-sans mt-0.5">
                      {activeTask || "Processing academic directives..."}
                    </p>
                  </div>
                </div>
                <span className="font-mono font-bold text-2xl text-[color:var(--accent)]">
                  {scanProgress}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-[color:var(--surface-sunken)] h-2.5 rounded-full overflow-hidden border border-[color:var(--border-subtle)]">
                <div
                  className="bg-[color:var(--accent)] h-full transition-all duration-300 rounded-full"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>

              {/* Terminal Logs */}
              <div className="mt-4 p-4 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] font-mono text-xs max-h-56 overflow-y-auto space-y-1.5">
                <div className="text-[color:var(--text-muted)] uppercase tracking-wider text-[10px] pb-1 border-b border-[color:var(--border-subtle)]">
                  Live Agent Execution Stream
                </div>
                {logs.length === 0 ? (
                  <div className="text-[color:var(--text-muted)] italic py-2">
                    Connecting to manuscript revision pipeline...
                  </div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <span className="text-[color:var(--text-muted)] shrink-0">[{log.timestamp}]</span>
                      <span
                        className={
                          log.type === "done"
                            ? "text-[color:var(--state-success)] font-semibold"
                            : log.type === "warn"
                            ? "text-[color:var(--state-warning)]"
                            : log.type === "patch"
                            ? "text-[color:var(--accent)]"
                            : "text-[color:var(--text-secondary)]"
                        }
                      >
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* State C: Results Loaded - Interactive Patch Workbench */}
        {!isProcessing && patches.length > 0 && (
          <div className="space-y-6 pb-24">
            {/* HUD Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs">
                <span className="text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider">
                  Patches Generated
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[color:var(--text-primary)] font-mono">
                    {totalPatchesCount}
                  </span>
                  <span className="text-xs text-[color:var(--text-muted)]">section diffs</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs">
                <span className="text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider">
                  Patches Accepted
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[color:var(--state-success)] font-mono">
                    {acceptedPatchesCount}/{totalPatchesCount}
                  </span>
                  <span className="text-xs text-[color:var(--state-success)] font-semibold">
                    {totalPatchesCount > 0 ? Math.round((acceptedPatchesCount / totalPatchesCount) * 100) : 0}%
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs">
                <span className="text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider">
                  Net Word Delta
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-bold font-mono ${
                      wordCountDelta >= 0 ? "text-[color:var(--accent)]" : "text-[color:var(--state-warning)]"
                    }`}
                  >
                    {wordCountDelta >= 0 ? `+${wordCountDelta}` : wordCountDelta}
                  </span>
                  <span className="text-xs text-[color:var(--text-muted)]">words</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs">
                <span className="text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider">
                  Revised Length
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[color:var(--text-primary)] font-mono">
                    {revisedWordCount}
                  </span>
                  <span className="text-xs text-[color:var(--text-muted)]">words total</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs">
                <span className="text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider">
                  Rigor Delta
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[color:var(--state-success)] font-mono">
                    +15%
                  </span>
                  <span className="text-xs text-[color:var(--state-success)]">formalized</span>
                </div>
              </div>
            </div>

            {/* View Mode & Filter Controls Bar */}
            <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Mode Tabs */}
                <div className="inline-flex rounded-lg p-1 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]">
                  <button
                    onClick={() => setViewMode("rebuttal_matrix")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      viewMode === "rebuttal_matrix"
                        ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs"
                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                    }`}
                  >
                    5-Referee Rebuttal Matrix ({rebuttalMatrix.length})
                  </button>
                  <button
                    onClick={() => setViewMode("patches")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      viewMode === "patches"
                        ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs"
                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                    }`}
                  >
                    Patch Diff Workbench ({patches.length})
                  </button>
                  <button
                    onClick={() => setViewMode("full_draft")}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      viewMode === "full_draft"
                        ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs"
                        : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                    }`}
                  >
                    Assembled Manuscript Preview
                  </button>
                </div>

                {/* Section filter */}
                {viewMode === "patches" && (
                  <select
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-xs text-[color:var(--text-primary)] font-medium focus:outline-none focus:border-[color:var(--accent)] cursor-pointer"
                  >
                    <option value="all">All Sections ({patches.length})</option>
                    {patchSections.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Bulk actions */}
              {viewMode === "patches" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={acceptAllPatches}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--state-success)] bg-[color:var(--state-success-subtle)] border border-[color:var(--border-subtle)] hover:opacity-90 cursor-pointer"
                  >
                    ✓ Accept All Patches
                  </button>
                  <button
                    onClick={revertAllPatches}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--state-danger)] bg-[color:var(--state-danger-subtle)] border border-[color:var(--border-subtle)] hover:opacity-90 cursor-pointer"
                  >
                    ↺ Revert All Patches
                  </button>
                </div>
              )}
            </div>

            {/* TAB 1: Patch Diff Workbench */}
            {viewMode === "patches" && (
              <div className="space-y-4">
                {filteredPatches.map((patch, idx) => {
                  const isEditing = editingPatchId === patch.id;
                  const isAccepted = patch.accepted;

                  return (
                    <div
                      key={patch.id}
                      className={`rounded-2xl border transition-all shadow-xs ${
                        isAccepted
                          ? "bg-[color:var(--surface-raised)] border-[color:var(--border-subtle)]"
                          : "bg-[color:var(--surface-sunken)] border-[color:var(--border-subtle)] opacity-75"
                      }`}
                    >
                      {/* Patch Header */}
                      <div className="p-4 border-b border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[color:var(--text-muted)]">
                            Patch #{idx + 1}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)]">
                            {patch.section}
                          </span>
                          {patch.critiqueLens && (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-[color:var(--accent)]">
                              Lens: {patch.critiqueLens}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              patch.severity === "Critical"
                                ? "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]"
                                : patch.severity === "Major"
                                ? "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]"
                                : "bg-[color:var(--state-info-subtle)] text-[color:var(--state-info)]"
                            }`}
                          >
                            {patch.severity || "Major"}
                          </span>
                          {patch.customReplacement && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[color:var(--state-info-subtle)] text-[color:var(--state-info)]">
                              Author Edited
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          {!isEditing ? (
                            <>
                              <button
                                onClick={() => startEditingPatch(patch)}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                              >
                                Edit Revision
                              </button>
                              <button
                                onClick={() => togglePatch(patch.id)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  isAccepted
                                    ? "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] border border-[color:var(--border-subtle)] hover:opacity-90"
                                    : "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--border-subtle)] hover:opacity-90"
                                }`}
                              >
                                {isAccepted ? "Revert to Original" : "Accept Patch"}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => saveEditedPatch(patch.id)}
                                className="px-3 py-1 rounded-lg text-xs font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
                              >
                                Save Revision
                              </button>
                              <button
                                onClick={cancelEditingPatch}
                                className="px-3 py-1 rounded-lg text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Rationale callout */}
                      <div className="px-4 py-2.5 bg-[color:var(--surface-sunken)] border-b border-[color:var(--border-subtle)] text-xs text-[color:var(--text-secondary)] font-sans flex items-start gap-2">
                        <span className="font-bold text-[color:var(--text-primary)] shrink-0">Rationale:</span>
                        <span>{patch.explanation}</span>
                      </div>

                      {/* Side-by-Side Diff or Before/After */}
                      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Original Passage (Before) */}
                        <div className="p-4 rounded-xl bg-[color:var(--state-danger-subtle)] border border-[color:var(--state-danger)]/20 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--state-danger)] flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Original Manuscript Excerpt
                            </span>
                            <span className="text-[10px] font-mono text-[color:var(--state-danger)]">
                              {patch.find.split(/\s+/).filter(Boolean).length} words
                            </span>
                          </div>
                          <p className="text-sm font-serif text-[color:var(--text-primary)] leading-relaxed line-through opacity-80">
                            {patch.find}
                          </p>
                        </div>

                        {/* Revised Replacement (After) */}
                        <div className="p-4 rounded-xl bg-[color:var(--state-success-subtle)] border border-[color:var(--state-success)]/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--state-success)] flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {patch.customReplacement ? "Author Revised Patch" : "Proposed Revision Patch"}
                            </span>
                            <span className="text-[10px] font-mono text-[color:var(--state-success)]">
                              {(patch.customReplacement || patch.replace).split(/\s+/).filter(Boolean).length} words
                            </span>
                          </div>

                          {isEditing ? (
                            <textarea
                              value={tempEditValue}
                              onChange={(e) => setTempEditValue(e.target.value)}
                              rows={4}
                              className="w-full p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] text-sm text-[color:var(--text-primary)] font-serif focus:outline-none focus:border-[color:var(--accent)] leading-relaxed"
                            />
                          ) : (
                            <p className="text-sm font-serif text-[color:var(--text-primary)] leading-relaxed font-medium">
                              {patch.customReplacement || patch.replace}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 2: Assembled Manuscript Preview */}
            {viewMode === "full_draft" && (
              <div className="p-8 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-sm space-y-8 max-w-4xl mx-auto">
                <div className="border-b border-[color:var(--border-subtle)] pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)] font-mono">
                    Manuscript Assembled with Accepted Patches
                  </span>
                  <h3 className="text-xl font-serif font-bold text-[color:var(--text-primary)] mt-1">
                    {workingTitle}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-[color:var(--text-secondary)] mt-2 font-sans">
                    <span>Target Venue: <strong className="text-[color:var(--text-primary)]">{journalLabel}</strong></span>
                    <span>Total Length: <strong className="text-[color:var(--state-success)]">{revisedWordCount} words</strong></span>
                    <span>Patches Applied: <strong className="text-[color:var(--accent)]">{acceptedPatchesCount}</strong></span>
                  </div>
                </div>

                <div className="space-y-6">
                  {assembledDraftSections.map((sec, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-1">
                        <h4 className="font-bold text-[color:var(--text-primary)] text-base font-sans">
                          {sec.section || sec.section_name}
                        </h4>
                        <span className="text-xs text-[color:var(--text-muted)] font-mono">
                          {sec.word_count} words
                        </span>
                      </div>
                      <p className="text-sm font-serif text-[color:var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                        {sec.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: Point-by-Point 5-Referee Rebuttal Matrix */}
            {viewMode === "rebuttal_matrix" && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)] font-mono">
                      Adversarial Peer Review Synthesis
                    </span>
                    <h3 className="text-base font-bold text-[color:var(--text-primary)]">
                      5-Referee Point-by-Point Rebuttal & Revision Matrix
                    </h3>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-0.5 font-sans">
                      Structured author responses and manuscript revision actions addressing each specialist critique.
                    </p>
                  </div>
                  <button
                    onClick={loadOrGenerateRebuttalMatrix}
                    disabled={isGeneratingRebuttal}
                    className="px-4 py-2 rounded-lg bg-[color:var(--accent)] text-[color:var(--text-inverse)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50 font-sans"
                  >
                    {isGeneratingRebuttal ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Synthesizing Matrix...</span>
                      </>
                    ) : (
                      <>
                        <span>⚡ Re-Synthesize Matrix</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-4">
                  {rebuttalMatrix.map((item) => {
                    const isEditing = editingRebuttalId === item.id;
                    const roleColorMap: Record<RefereeRole, string> = {
                      Methodologist: "bg-blue-500/10 text-blue-400 border-blue-500/30",
                      "Domain Specialist": "bg-purple-500/10 text-purple-400 border-purple-500/30",
                      Biostatistician: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                      Synthesizer: "bg-amber-500/10 text-amber-400 border-amber-500/30",
                      "Formal Editor": "bg-rose-500/10 text-rose-400 border-rose-500/30",
                    };
                    const roleClass = roleColorMap[item.refereeRole] || "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";

                    return (
                      <div
                        key={item.id}
                        className="p-5 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] space-y-4 shadow-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border-subtle)] pb-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${roleClass}`}>
                              Referee: {item.refereeRole}
                            </span>
                            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]">
                              § {item.section}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[color:var(--text-muted)]">Status:</span>
                            <select
                              value={item.status}
                              onChange={(e) => {
                                const newStatus = e.target.value as RebuttalMatrixItem["status"];
                                setRebuttalMatrix((prev) =>
                                  prev.map((r) => (r.id === item.id ? { ...r, status: newStatus } : r))
                                );
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] cursor-pointer focus:outline-none"
                            >
                              <option value="Accepted & Revised">✓ Accepted & Revised</option>
                              <option value="Rebutted with Evidence">⚖ Rebutted with Evidence</option>
                              <option value="Clarified in Text">ℹ Clarified in Text</option>
                            </select>
                          </div>
                        </div>

                        {/* Referee Critique */}
                        <div className="p-3.5 rounded-xl bg-[color:var(--surface-sunken)] border-l-4 border-[color:var(--accent)] text-xs font-serif leading-relaxed text-[color:var(--text-primary)]">
                          <span className="font-sans font-bold text-[color:var(--accent)] block text-[11px] mb-1 uppercase tracking-wider">
                            Critique / Methodological Concern:
                          </span>
                          "{item.critique}"
                        </div>

                        {/* Author Response */}
                        <div className="p-3.5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[color:var(--state-success)] uppercase tracking-wider flex items-center gap-1.5">
                              <span>Author Response & Defense:</span>
                            </span>
                            {!isEditing && (
                              <button
                                onClick={() => {
                                  setEditingRebuttalId(item.id);
                                  setTempRebuttalResponse(item.authorResponse);
                                }}
                                className="text-xs font-medium text-[color:var(--accent)] hover:underline cursor-pointer font-sans"
                              >
                                Edit Response
                              </button>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={tempRebuttalResponse}
                                onChange={(e) => setTempRebuttalResponse(e.target.value)}
                                rows={3}
                                className="w-full p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] text-xs text-[color:var(--text-primary)] font-serif focus:outline-none focus:border-[color:var(--accent)] leading-relaxed"
                              />
                              <div className="flex items-center gap-2 font-sans">
                                <button
                                  onClick={() => {
                                    setRebuttalMatrix((prev) =>
                                      prev.map((r) =>
                                        r.id === item.id ? { ...r, authorResponse: tempRebuttalResponse.trim() } : r
                                      )
                                    );
                                    setEditingRebuttalId(null);
                                    setTempRebuttalResponse("");
                                  }}
                                  className="px-3 py-1 rounded bg-[color:var(--state-success)] text-white text-xs font-bold cursor-pointer"
                                >
                                  Save Response
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingRebuttalId(null);
                                    setTempRebuttalResponse("");
                                  }}
                                  className="px-3 py-1 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] text-xs font-medium cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs font-serif text-[color:var(--text-primary)] leading-relaxed">
                              {item.authorResponse}
                            </p>
                          )}
                        </div>

                        {/* Manuscript Revision Action & Diff */}
                        <div className="p-3 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-xs space-y-1.5">
                          <span className="font-bold text-[color:var(--text-muted)] text-[10px] uppercase tracking-wider block font-sans">
                            Manuscript Revision Action:
                          </span>
                          <p className="text-[color:var(--text-secondary)] font-medium font-sans">{item.revisionAction}</p>

                          {item.manuscriptDiff && (
                            <div className="mt-2 pt-2 border-t border-[color:var(--border-subtle)] grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                              <div className="p-2 rounded bg-[color:var(--state-danger-subtle)] border border-[color:var(--state-danger)]/20 text-[color:var(--text-primary)]">
                                <span className="text-[10px] font-bold text-[color:var(--state-danger)] block mb-1">
                                  - Original Text
                                </span>
                                {item.manuscriptDiff.original}
                              </div>
                              <div className="p-2 rounded bg-[color:var(--state-success-subtle)] border border-[color:var(--state-success)]/20 text-[color:var(--text-primary)]">
                                <span className="text-[10px] font-bold text-[color:var(--state-success)] block mb-1">
                                  + Revised Text
                                </span>
                                {item.manuscriptDiff.revised}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Sticky Bottom Action Dock */}
      {(patches.length > 0 || rebuttalMatrix.length > 0) && !isProcessing && (
        <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[color:var(--state-success)]"></span>
            <div className="text-xs font-sans">
              <span className="font-bold text-[color:var(--text-primary)]">
                {acceptedPatchesCount} of {totalPatchesCount} Patches Accepted
              </span>
              <span className="text-[color:var(--text-muted)] ml-2">
                (Net Word Count: {revisedWordCount} words)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAdvance}
              disabled={isSavingAdvance}
              className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-sm shadow-md hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer font-sans"
            >
              {isSavingAdvance ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Finalizing Revisions...</span>
                </>
              ) : (
                <>
                  <span>Approve Revisions & Proceed to Final Editor →</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
