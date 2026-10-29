import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedStreamFetch, saveIntakeAnswers, executeAgenticLLM } from "../../api";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";
import { safeParseAnswerField } from "../../../shared/projectStateSchema";
import { showAppToast } from "../../../components/ui/FeedbackSystem";
import {
  buildSectionDraftPrompts,
} from "../agentPrompts/draftPrompts";
import {
  Sparkles,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Wand2,
  Edit3,
  Copy,
  Check,
  RotateCcw,
  BookOpen,
} from "lucide-react";

export interface ManuscriptSection {
  id?: string;
  section: string;
  section_name?: string;
  status: "Drafted" | "Reviewing" | "Revised";
  length?: number;
  word_count?: number;
  target_words?: number;
  content: string;
}

export default function DraftStage({
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

  // Grounding state parsed from Phase I, II & III
  const workingTitle =
    project.answers?.["working_title"] || "Autonomous Scholar Article";
  const methodology =
    project.answers?.["methodology"] ||
    project.answers?.["study_design"] ||
    project.answers?.["article_type"] ||
    "Empirical Computational Modeling";
  const anchorGapId = project.answers?.["anchor_gap_id"];
  const identifiedGaps = useMemo(() => {
    return safeParseAnswerField<any[]>(project.answers?.["identified_gaps"], []);
  }, [project.answers]);
  const anchorGap = useMemo(() => {
    return (
      identifiedGaps.find((g: any) => g.id === anchorGapId)?.title ||
      identifiedGaps[0]?.title ||
      "Primary research gap"
    );
  }, [identifiedGaps, anchorGapId]);

  const approvedVaultSources = useMemo(() => {
    const appr = safeParseAnswerField<any[]>(project.answers?.["approved_vault_sources"], []);
    if (appr.length > 0) return appr;
    return safeParseAnswerField<any[]>(project.answers?.["vault_sources"], []);
  }, [project.answers]);

  const approvedExternalSources = useMemo(() => {
    const appr = safeParseAnswerField<any[]>(project.answers?.["approved_external_sources"], []);
    if (appr.length > 0) return appr;
    return safeParseAnswerField<any[]>(project.answers?.["pending_external_sources"], []);
  }, [project.answers]);

  const attachedDatasets = useMemo(() => {
    const ds = safeParseAnswerField<any[]>(project.answers?.["primary_datasets"], []);
    if (ds.length > 0) return ds;
    return safeParseAnswerField<any[]>(project.answers?.["additional_data"], []);
  }, [project.answers]);

  const argumentClusters = useMemo(() => {
    const matrix = safeParseAnswerField<any[]>(project.answers?.["evidence_matrix"], []);
    if (matrix.length > 0) return matrix;
    return safeParseAnswerField<any[]>(project.answers?.["thematic_clusters"], []);
  }, [project.answers]);

  const targetJournal =
    project.answers?.["target_journal"] || "ACM Transactions on Computer Systems (TOCS)";

  const journalConstraints = useMemo(() => {
    return safeParseAnswerField<{ citation_style?: string; max_words?: number | string; [key: string]: unknown }>(project.answers?.["journal_constraints"], {});
  }, [project.answers]);

  // Initial sections parsed from project answers
  const initialSections = useMemo<ManuscriptSection[]>(() => {
    const saved = project.answers?.["manuscript_draft"] || project.answers?.["assembled_draft"];
    if (saved) {
      const parsed = safeParseAnswerField<ManuscriptSection[]>(saved, []);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    return [];
  }, [project.answers]);

  const [sections, setSections] = useState<ManuscriptSection[]>(initialSections);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number>(0);
  const [isEditingSection, setIsEditingSection] = useState<boolean>(false);
  const [editContentBuffer, setEditContentBuffer] = useState<string>("");

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // Section-by-Section AI Customization State
  const [sectionDirective, setSectionDirective] = useState<string>("");
  const [selectedTone, setSelectedTone] = useState<string>("Nature / Science empirical register");
  const [isRegeneratingSection, setIsRegeneratingSection] = useState<boolean>(false);
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState<boolean>(false);
  const [newSectionTitle, setNewSectionTitle] = useState<string>("");
  const [newSectionBudget, setNewSectionBudget] = useState<number>(1000);

  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  // Synchronize state if answers update externally
  useEffect(() => {
    if (initialSections.length > 0 && sections.length === 0) {
      setSections(initialSections);
    }
  }, [initialSections, sections.length]);


  // Start Multi-Agent Drafter for all sections
  const startAgent = async () => {
    clearTimer();
    setIsProcessing(true);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "-1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Multi-Agent Academic Drafter Pipeline for "${targetJournal}"...`,
      },
      {
        id: Date.now().toString() + "-2",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "action",
        message: `Agent [Orchestrator]: Ingesting ${approvedVaultSources.length + approvedExternalSources.length} approved citations and ${argumentClusters.length} argument clusters...`,
      },
      {
        id: Date.now().toString() + "-3",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "action",
        message: `Agent [Drafter]: Assembling manuscript sections adhering to ${targetJournal} constraints...`,
      },
    ]);


    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/draft`,
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
            const rawData = data.data || [];
            // Only sections the AI actually wrote; an empty answer never
            // replaces the user's draft.
            const parsedList: ManuscriptSection[] = (Array.isArray(rawData) ? rawData : [])
              .filter((item: any) => typeof item?.content === "string" && item.content.trim())
              .map((item: any, idx: number) => ({
                id: item.id || `sec-${idx + 1}`,
                section: item.section || item.section_name || `Section ${idx + 1}`,
                status: "Drafted",
                length: item.content.trim().split(/\s+/).length,
                content: item.content,
              }));

            const finalSections = parsedList;
            if (finalSections.length > 0) {
              setSections(finalSections);
              setSelectedSectionIdx(0);
            }

            // Persist into project answers
            if (finalSections.length > 0) try {
              const newAnswers = {
                ...project.answers,
                manuscript_draft: JSON.stringify(finalSections),
                assembled_draft: JSON.stringify(finalSections),
                draft_completed: "true",
              };
              const updatedProject = await saveIntakeAnswers(
                projectId,
                newAnswers as Record<string, string>
              );
              onSaved(updatedProject);
            } catch (saveErr) {
              console.warn("Failed to auto-persist draft", saveErr);
            }

            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + "-done",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message:
                  finalSections.length > 0
                    ? `AI draft ready: ${finalSections.length} sections. Check every claim and citation before relying on it.`
                    : "The AI returned no draft text. Your draft was not changed.",
              },
            ]);
          } else if (event === "error") {
            clearTimer();
            throw new Error(data.message || "Drafting agent encountered an error.");
          }
        }
      );
    } catch (err: any) {
      clearTimer();
      console.warn("Drafting agent unavailable:", err);
      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-fail`,
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "error",
          message: "Drafting unavailable: your draft was not changed. Connect an AI provider in AI Access, or try again.",
        },
      ]);
    } finally {
      clearTimer();
      setIsProcessing(false);
    }
  };

  // Active section
  const currentSection = sections[selectedSectionIdx] || sections[0];

  // Regenerate Active Section with custom directives & quick action chips
  const handleRegenerateActiveSection = async (quickActionChoice?: string) => {
    if (!currentSection) return;
    setIsRegeneratingSection(true);
    setError(null);

    const { systemPrompt, userPrompt } = buildSectionDraftPrompts({
      sectionTitle: currentSection.section || currentSection.section_name || "Section",
      targetWordCount: currentSection.target_words || 1000,
      workingTitle,
      targetJournal,
      anchorGap,
      methodology,
      approvedSources: approvedVaultSources.concat(approvedExternalSources),
      empiricalDataSummary: attachedDatasets[0]?.name ? `Telemetry benchmark trace: ${attachedDatasets[0]?.name}` : undefined,
      userDirective: sectionDirective.trim() || undefined,
      quickAction: quickActionChoice,
      existingContent: currentSection.content,
      toneStyle: selectedTone,
    });

    try {
      let draftedProse = "";
      try {
        draftedProse = await executeAgenticLLM(systemPrompt, userPrompt, "reasoning");
      } catch (aiErr) {
        // No stand-in prose: leave the section as it is and say why.
        console.warn("Section redraft failed:", aiErr);
        setError("AI drafting unavailable: this section was not changed. Connect an AI provider in AI Access, or try again.");
      }

      if (draftedProse) {
        const words = draftedProse.trim().split(/\s+/).filter(Boolean).length;
        const updated = [...sections];
        updated[selectedSectionIdx] = {
          ...currentSection,
          content: draftedProse,
          length: words,
          word_count: words,
          status: "Revised",
        };
        setSections(updated);

        // Auto-persist
        const newAnswers = {
          ...project.answers,
          manuscript_draft: JSON.stringify(updated),
          assembled_draft: JSON.stringify(updated),
        };
        const savedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        onSaved(savedProject);
      }
    } catch (err: any) {
      setError(`Failed to regenerate section: ${err.message}`);
    } finally {
      setIsRegeneratingSection(false);
    }
  };

  // Outline Manipulation Handlers
  const handleAddSection = async () => {
    if (!newSectionTitle.trim()) return;
    const newSec: ManuscriptSection = {
      id: `sec-${Date.now()}`,
      section: newSectionTitle.trim(),
      status: "Drafted",
      length: 0,
      target_words: newSectionBudget || 1000,
      content: `### ${newSectionTitle.trim()}\n\n[Section draft pending generation...]`,
    };
    const updated = [...sections, newSec];
    setSections(updated);
    setSelectedSectionIdx(updated.length - 1);
    setNewSectionTitle("");
    setIsAddSectionModalOpen(false);

    try {
      const newAnswers = {
        ...project.answers,
        manuscript_draft: JSON.stringify(updated),
        assembled_draft: JSON.stringify(updated),
      };
      const saved = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(saved);
    } catch (e) {
      console.warn("Failed to persist new section", e);
    }
  };

  const handleDeleteSection = async (idxToDelete: number) => {
    if (sections.length <= 1) {
      showAppToast("A manuscript must retain at least one core section.", "warning");
      return;
    }
    const updated = sections.filter((_, i) => i !== idxToDelete);
    setSections(updated);
    if (selectedSectionIdx >= updated.length) {
      setSelectedSectionIdx(Math.max(0, updated.length - 1));
    }
    try {
      const newAnswers = {
        ...project.answers,
        manuscript_draft: JSON.stringify(updated),
        assembled_draft: JSON.stringify(updated),
      };
      const saved = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(saved);
    } catch (e) {
      console.warn("Failed to persist section removal", e);
    }
  };

  const handleMoveSection = async (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sections.length - 1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const updated = [...sections];
    const [moved] = updated.splice(idx, 1);
    updated.splice(targetIdx, 0, moved);
    setSections(updated);
    setSelectedSectionIdx(targetIdx);

    try {
      const newAnswers = {
        ...project.answers,
        manuscript_draft: JSON.stringify(updated),
        assembled_draft: JSON.stringify(updated),
      };
      const saved = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(saved);
    } catch (e) {
      console.warn("Failed to persist section reordering", e);
    }
  };

  // Start editing active section manually
  const handleStartEditing = () => {
    if (currentSection) {
      setEditContentBuffer(currentSection.content);
      setIsEditingSection(true);
    }
  };

  // Save edited section manually
  const handleSaveSection = async () => {
    if (!currentSection) return;
    const words = editContentBuffer.trim().split(/\s+/).filter(Boolean).length;
    const updatedSections = [...sections];
    updatedSections[selectedSectionIdx] = {
      ...currentSection,
      content: editContentBuffer,
      length: words,
      word_count: words,
      status: "Revised",
    };

    setSections(updatedSections);
    setIsEditingSection(false);

    try {
      const newAnswers = {
        ...project.answers,
        manuscript_draft: JSON.stringify(updatedSections),
        assembled_draft: JSON.stringify(updatedSections),
      };
      const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updated);
    } catch (err) {
      console.warn("Failed to persist section edit", err);
    }
  };

  // Copy active section markdown
  const handleCopySection = () => {
    if (!currentSection) return;
    navigator.clipboard?.writeText(currentSection.content);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  // Total word count calculation
  const totalWordCount = useMemo(() => {
    return sections.reduce((acc, s) => {
      const count = s.length || (s.content ? s.content.trim().split(/\s+/).filter(Boolean).length : 0);
      return acc + count;
    }, 0);
  }, [sections]);

  // Target quota
  const targetQuota = useMemo(() => {
    if (journalConstraints.max_words) {
      const parsed = parseInt(String(journalConstraints.max_words), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 10000;
  }, [journalConstraints.max_words]);

  // Confirm and advance to Stage 18 (citation_audit)
  const handleConfirmDraft = async () => {
    if (sections.length === 0) {
      setError("Please generate a manuscript draft before advancing.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const fullTextMarkdown = sections
        .map((s) => {
          const titleHeader = s.content.trim().startsWith("#") ? "" : `## ${s.section}\n\n`;
          return `${titleHeader}${s.content.trim()}`;
        })
        .join("\n\n---\n\n");

      const newAnswers = {
        ...project.answers,
        manuscript_draft: JSON.stringify(sections),
        assembled_draft: JSON.stringify(sections),
        manuscript_markdown: fullTextMarkdown,
        full_text_markdown: fullTextMarkdown,
        manuscript_text: fullTextMarkdown,
        draft_completed: "true",
      };
      const updatedProject = await saveIntakeAnswers(
        projectId,
        newAnswers as Record<string, string>
      );
      onSaved(updatedProject);
      if (onAdvance) {
        onAdvance("citation_audit");
      }
    } catch (err: any) {
      setError(err.message || "Failed to seal manuscript draft.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      {/* 1. Header with Phase Badge and Primary Actions */}
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-b border-[color:var(--border-subtle)] flex flex-wrap justify-between items-center gap-4 bg-[color:var(--surface-raised)] z-10 shadow-xs relative">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-semibold border border-[color:var(--accent-border)]">
                Phase III: Drafting • Stage 17 of 25
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--accent)] font-semibold border border-[color:var(--border-subtle)]">
                Target: {targetJournal}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)] mt-1">
              {def.label}
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Multi-agent academic composition engine synthesizing all verified evidence, quotes, and data into a complete publication draft.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startAgent}
            disabled={isProcessing}
            className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-white text-xs font-bold shadow-sm hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                <span>Assembling Manuscript Prose...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{sections.length > 0 ? "Regenerate Full Draft" : "Initialize Multi-Agent Drafter"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Grounding Foundation Ribbon */}
      <div className="px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 bg-[color:var(--surface-sunken)] border-b border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] shrink-0">
            Manuscript Anchor:
          </span>
          <span className="font-serif italic text-[color:var(--text-primary)] font-medium truncate max-w-md">
            "{workingTitle}"
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {anchorGap && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[11px] font-mono text-[color:var(--text-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)]" />
              Gap: {anchorGap.slice(0, 36)}...
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[11px] font-mono text-[color:var(--text-secondary)]">
            <strong className="text-[color:var(--text-primary)]">{approvedVaultSources.length + approvedExternalSources.length}</strong> Citations
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[11px] font-mono text-[color:var(--text-secondary)]">
            <strong className="text-[color:var(--text-primary)]">{attachedDatasets.length}</strong> Datasets
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[11px] font-mono text-[color:var(--text-secondary)]">
            <strong className="text-[color:var(--text-primary)]">{argumentClusters.length}</strong> Clusters
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Minimalist Apple x ChatGPT Stage Instruction Banner */}
        <JournalStageInstructionBanner
          milestoneTitle="Milestone 6 · Manuscript Studio & AI Drafting"
          stageLabel="IMRaD Manuscript Composition Studio"
          description="Synthesize your approved claims, empirical benchmark traces, and mathematical formulations into publication-grade sections. Customize your outline, adjust word budgets, or draft section-by-section with tailored AI directives."
          instructions={[
            "Customize the IMRaD section taxonomy or add specialized sections (e.g., System Architecture, Related Work)",
            "Run the Multi-Agent Drafter or draft specific sections with custom directives",
            "Use 1-click enhancement chips to deepen discussions, expand methodology, or elevate tone",
            "Review and polish prose before sealing the draft for citation integrity audit",
          ]}
          targetJournal={targetJournal}
          wordCountBudget={targetQuota}
          citationStyle={journalConstraints.citation_style || "Peer-Reviewed Journal Standard"}
          tips={[
            "Keep the Abstract strictly within 200–250 words to avoid automated desk rejection during journal pre-screening.",
            "Reviewers scrutinize the Discussion section for non-obvious theoretical implications and honest threats to validity.",
            "Ensure every quantitative benchmark comparison is anchored to verified telemetry datasets.",
          ]}
        />

        {/* Multi-Agent Orchestrator Pipeline Visualizer */}
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-64 shrink-0 flex flex-col gap-3">
              <div className={`bg-[color:var(--surface-raised)] border ${isProcessing ? 'border-[color:var(--accent)]' : 'border-[color:var(--border-subtle)]'} rounded-xl p-4 transition-all shadow-xs`}>
                <div className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-bold mb-1">
                  Agent: Orchestrator
                </div>
                <div className="flex items-center gap-2.5 text-xs font-mono">
                  <div className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-[color:var(--accent)] animate-ping' : 'bg-[color:var(--state-success)]'}`} />
                  <span className="text-[color:var(--text-primary)] font-semibold">
                    {isProcessing ? "Synthesizing Plan" : "Sections Aligned"}
                  </span>
                </div>
              </div>

              <div className={`bg-[color:var(--surface-raised)] border ${isProcessing ? 'border-purple-500/50' : 'border-[color:var(--border-subtle)]'} rounded-xl p-4 transition-all shadow-xs`}>
                <div className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-bold mb-1">
                  Agent: Academic Drafter
                </div>
                <div className="flex items-center gap-2.5 text-xs font-mono">
                  <div className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-purple-500 animate-pulse' : 'bg-[color:var(--state-success)]'}`} />
                  <span className="text-[color:var(--text-primary)] font-semibold">
                    {isProcessing ? "Writing Prose" : "Draft Compiled"}
                  </span>
                </div>
              </div>

              <div className={`bg-[color:var(--surface-raised)] border ${isProcessing ? 'border-blue-500/50' : 'border-[color:var(--border-subtle)]'} rounded-xl p-4 transition-all shadow-xs`}>
                <div className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-bold mb-1">
                  Agent: Peer Review Editor
                </div>
                <div className="flex items-center gap-2.5 text-xs font-mono">
                  <div className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-blue-500 animate-pulse' : 'bg-[color:var(--state-success)]'}`} />
                  <span className="text-[color:var(--text-primary)] font-semibold">
                    {isProcessing ? "Auditing Rules" : "Compliant"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1">
              <AgentTerminal
                logs={logs}
                isProcessing={isProcessing}
                agentName="Multi-Agent Drafting Engine"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-6xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)]/30 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-bold underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Empty State before generating draft */}
        {sections.length === 0 && !isProcessing && logs.length === 0 && (
          <div className="max-w-2xl mx-auto py-12 px-8 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl text-center space-y-6 shadow-xs">
            <div className="w-16 h-16 bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] rounded-2xl mx-auto flex items-center justify-center text-[color:var(--accent)]">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-[color:var(--text-primary)]">
                Ready to Assemble Manuscript Draft
              </h3>
              <p className="text-xs text-[color:var(--text-secondary)] max-w-md mx-auto mt-2 leading-relaxed">
                The Multi-Agent Drafting Pipeline will synthesize your approved evidence claims, primary telemetry, and section taxonomy for <strong className="text-[color:var(--text-primary)] font-serif">{targetJournal}</strong> into a publication-grade first draft.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={startAgent}
                className="px-6 py-3 rounded-xl bg-[color:var(--accent)] text-white text-xs font-bold shadow-md hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Launch Multi-Agent Drafter
              </button>
            </div>
          </div>
        )}

        {/* 3. Full Manuscript Dual-Pane Workspace */}
        {sections.length > 0 && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Aggregate Metrics Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs">
                <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold block">
                  Manuscript Sections
                </span>
                <div className="text-xl font-bold text-[color:var(--text-primary)] font-mono mt-1">
                  {sections.length} Chapters
                </div>
              </div>

              <div className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs">
                <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold block">
                  Total Word Count
                </span>
                <div className="text-xl font-bold text-[color:var(--text-primary)] font-mono mt-1">
                  {totalWordCount.toLocaleString()} words
                </div>
              </div>

              <div className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs">
                <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold block">
                  Target Journal Quota
                </span>
                <div className="text-xl font-bold text-[color:var(--accent)] font-mono mt-1">
                  {journalConstraints.max_words ? `${journalConstraints.max_words} words` : "10,000 words"}
                </div>
              </div>

              <div className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs">
                <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold block">
                  Evidence Citation Links
                </span>
                <div className="text-xl font-bold text-[color:var(--state-success)] font-mono mt-1">
                  {approvedVaultSources.length + approvedExternalSources.length} Verified
                </div>
              </div>
            </div>

            {/* Dual-Pane Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Pane: Section Navigation Ledger */}
              <div className="lg:col-span-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-[color:var(--border-subtle)] px-2">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    Section Navigation
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsAddSectionModalOpen(true)}
                      className="p-1 rounded-md text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1"
                      title="Add Custom Section"
                    >
                      <Plus className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-[11px]">Add</span>
                    </button>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]">
                      {sections.length} Drafted
                    </span>
                  </div>
                </div>

                {/* Add Section Quick Input */}
                {isAddSectionModalOpen && (
                  <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/5 border border-indigo-500/30 space-y-2.5 animate-fade-in text-xs">
                    <div className="font-semibold text-neutral-900 dark:text-white flex items-center justify-between">
                      <span>Add Manuscript Section</span>
                      <button
                        type="button"
                        onClick={() => setIsAddSectionModalOpen(false)}
                        className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Related Work / Ethical Considerations"
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-black/30 text-xs text-neutral-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-neutral-500">Target words:</span>
                        <input
                          type="number"
                          value={newSectionBudget}
                          onChange={(e) => setNewSectionBudget(Number(e.target.value))}
                          className="w-16 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-white/10 bg-white dark:bg-black/30 text-xs font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddSection}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs cursor-pointer"
                      >
                        Confirm Add
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {sections.map((sec, idx) => {
                    const isSelected = idx === selectedSectionIdx;
                    const wordCount = sec.length || (sec.content ? sec.content.trim().split(/\s+/).filter(Boolean).length : 0);
                    return (
                      <div
                        key={sec.id || idx}
                        className={`group relative rounded-xl border transition-all ${
                          isSelected
                            ? "bg-[color:var(--surface-canvas)] border-[color:var(--accent)] shadow-xs ring-1 ring-[color:var(--accent)]"
                            : "bg-[color:var(--surface-canvas)]/60 border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-canvas)] hover:border-[color:var(--border-control)]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSectionIdx(idx);
                            setIsEditingSection(false);
                          }}
                          className="w-full p-3 text-left cursor-pointer flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-[11px] w-5 h-5 rounded-md bg-[color:var(--surface-sunken)] flex items-center justify-center font-bold text-[color:var(--text-secondary)] shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold font-serif text-[color:var(--text-primary)] truncate">
                              {sec.section || sec.section_name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-mono text-[color:var(--text-muted)]">
                              {wordCount}w
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--state-success)] font-semibold">
                              {sec.status || "Drafted"}
                            </span>
                          </div>
                        </button>

                        {/* Move & Delete Quick Actions on Hover */}
                        <div className="hidden group-hover:flex items-center gap-1 px-3 pb-2 pt-0.5 border-t border-neutral-100 dark:border-white/5 justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveSection(idx, "up");
                            }}
                            disabled={idx === 0}
                            title="Move section up"
                            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveSection(idx, "down");
                            }}
                            disabled={idx === sections.length - 1}
                            title="Move section down"
                            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSection(idx);
                            }}
                            title="Delete section"
                            className="p-1 text-neutral-400 hover:text-red-500 cursor-pointer ml-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Pane: Academic Reader & In-Place Prose Editor */}
              <div className="lg:col-span-8 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs overflow-hidden flex flex-col">
                {/* Pane Header */}
                <div className="p-4 sm:p-5 border-b border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 bg-[color:var(--surface-sunken)]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--accent)] font-semibold">
                        Section {selectedSectionIdx + 1} of {sections.length}
                      </span>
                      {currentSection?.target_words && (
                        <span className="text-[10px] font-mono text-neutral-400">
                          Target: {currentSection.target_words}w
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold font-serif text-[color:var(--text-primary)] mt-0.5">
                      {currentSection?.section || currentSection?.section_name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopySection}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <span>{copiedNotification ? "✓ Copied" : "Copy Markdown"}</span>
                    </button>

                    {isEditingSection ? (
                      <button
                        type="button"
                        onClick={handleSaveSection}
                        className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
                      >
                        Save Changes
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartEditing}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>Edit Prose</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Per-Section AI Prompt & Quick Enhancement Toolbar */}
                <div className="px-4 sm:px-5 py-3 bg-neutral-50 dark:bg-white/5 border-b border-[color:var(--border-subtle)] space-y-2.5">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <div className="flex-1 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <input
                        type="text"
                        placeholder="Custom AI directive for this section (e.g. Focus on statistical significance, compare against prior models)..."
                        value={sectionDirective}
                        onChange={(e) => setSectionDirective(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-black/30 text-neutral-800 dark:text-neutral-200 outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={selectedTone}
                        onChange={(e) => setSelectedTone(e.target.value)}
                        className="px-2 py-1 text-xs rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-black/30 text-neutral-700 dark:text-neutral-300 outline-none"
                      >
                        <option value="Nature / Science empirical register">Nature / Science Register</option>
                        <option value="IEEE / ACM Transactions formal precision">IEEE / ACM Precision</option>
                        <option value="Standard Academic IMRaD">Standard Academic IMRaD</option>
                        <option value="High-density Letters / Communications">High-density Letters</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRegenerateActiveSection()}
                        disabled={isRegeneratingSection}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        {isRegeneratingSection ? (
                          <>
                            <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                            <span>Drafting...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3 h-3" />
                            <span>Regenerate Section</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Quick Action Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
                    <span className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider mr-1">
                      Quick Polish:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRegenerateActiveSection("deepen")}
                      disabled={isRegeneratingSection}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:border-indigo-500 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      ⚡ Deepen Discussion
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerateActiveSection("methodology")}
                      disabled={isRegeneratingSection}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:border-indigo-500 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      🔬 Detail Protocol
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerateActiveSection("empirical")}
                      disabled={isRegeneratingSection}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:border-indigo-500 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      📊 Synthesize Data
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerateActiveSection("elevate")}
                      disabled={isRegeneratingSection}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:border-indigo-500 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      ✍️ Elevate Tone
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerateActiveSection("evidence")}
                      disabled={isRegeneratingSection}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:border-indigo-500 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      🔗 Anchor Citations
                    </button>
                  </div>
                </div>

                {/* Pane Body */}
                <div className="p-6">
                  {isEditingSection ? (
                    <div className="space-y-3">
                      <textarea
                        rows={16}
                        value={editContentBuffer}
                        onChange={(e) => setEditContentBuffer(e.target.value)}
                        className="w-full p-4 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs font-mono leading-relaxed text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                      />
                      <div className="flex items-center justify-between text-[11px] font-mono text-[color:var(--text-muted)]">
                        <span>
                          {editContentBuffer.trim().split(/\s+/).filter(Boolean).length} words
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsEditingSection(false)}
                          className="text-xs hover:underline cursor-pointer"
                        >
                          Discard edits
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none text-[color:var(--text-primary)] leading-relaxed font-serif text-sm whitespace-pre-line space-y-4">
                      {currentSection?.content}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Sticky Bottom Dock */}
      <div className="sticky bottom-0 bg-[color:var(--surface-raised)]/95 backdrop-blur-md border-t border-[color:var(--border-subtle)] px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-4 z-20 shadow-md">
        <div className="flex items-center gap-3 text-xs">
          <svg className="w-5 h-5 text-[color:var(--state-success)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-[color:var(--text-secondary)]">
            Manuscript Status:{" "}
            {sections.length > 0 ? (
              <span>
                <strong className="font-bold text-[color:var(--text-primary)]">{sections.length}</strong> sections assembled • <strong className="font-bold text-[color:var(--text-primary)]">{totalWordCount.toLocaleString()}</strong> words written • Ready for Citation Audit
              </span>
            ) : (
              <em className="text-[color:var(--text-muted)]">Draft not yet generated (click Initialize Multi-Agent Drafter above)</em>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirmDraft}
            disabled={sections.length === 0 || isSaving}
            className="rounded-xl bg-[color:var(--accent)] px-8 py-3 text-sm font-bold text-white hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Sealing Manuscript...
              </>
            ) : (
              <>
                Lock Manuscript Draft &amp; Proceed to Citation Audit
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
