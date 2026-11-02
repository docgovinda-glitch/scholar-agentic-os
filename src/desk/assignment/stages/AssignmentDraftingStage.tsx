import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { DraftingSectionIndex } from "../components/DraftingSectionIndex";
import { DraftingActiveEditor } from "../components/DraftingActiveEditor";
import {
  streamSectionGeneration,
  type InternalSectionPlan,
} from "../services/invisibleChunkerService";
import { buildEvidencePack, serializeEvidencePackForPrompt } from "../services/evidencePackService";
import { buildContextContinuity, updateContextContinuityAfterSection } from "../services/contextContinuityService";
import type { ContextContinuityState } from "../services/evidencePackService";
import type { AssignmentDraftingSection } from "../types";
import {
  PenTool,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  FileCheck,
  RotateCcw,
  Book,
} from "lucide-react";
import { SlideCanvas, extractSlidesFromAcademicText, type SlideDeck } from "../../../features/slides";
import { buildFormattedBibliography } from "../services/assignmentExportService";
import { validateSectionUniqueness } from "../../../features/drafting/services/sectionDraftingEngine";
import { auditAndEnforceCollegiateStyle } from "../../../features/coursework/services/courseworkOrchestrator";

export interface AssignmentDraftingStageProps {
  onProceed?: () => void;
  onBack?: () => void;
  onPresentPresentation?: (markdown: string) => void;
  onPresentKeynote?: (markdown: string) => void;
}

export function AssignmentDraftingStage({
  onProceed,
  onBack,
  onPresentPresentation,
  onPresentKeynote,
}: AssignmentDraftingStageProps) {
  const {
    projectId,
    project,
    setPhase,
    targetWordCount,
    currentWordCount,
    wordCountPercentage,
    question,
    academicLevel,
    citationStyle,
    sources,
    approvedSourceIds,
    userUploadedSources,
    internalSections,
    activeSectionId,
    setActiveSectionId,
    updateSectionContent,
    updateSectionTitle,
    tuneOutlineWithQuestion,
    setGeneratingSection,
    generatingSectionIds,
    initializeDraftingPlan,
    executionMode,
    isLoading,
  } = useAssignmentWorkspace();

  const [streamingChunk, setStreamingChunk] = useState<string>("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [activeStreamingSectionId, setActiveStreamingSectionId] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isTuning, setIsTuning] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showKeynote, setShowKeynote] = useState(false);
  const [presentationDeck, setPresentationDeck] = useState<SlideDeck | null>(null);
  const [keynoteDeck, setKeynoteDeck] = useState<SlideDeck | null>(null);

  const draftMarkdown = useMemo(() => {
    return internalSections
      .map((sec) => `## ${sec.title}\n\n${sec.draftContent || ""}`)
      .join("\n\n");
  }, [internalSections]);

  // Context continuity state — tracks claims, cited sources, and themes across sections
  const contextContinuityRef = useRef<ContextContinuityState | null>(null);

  // Auto-initialize drafting decomposition plan if empty
  useEffect(() => {
    if (internalSections.length === 0 && targetWordCount > 0) {
      initializeDraftingPlan();
    }
  }, [internalSections.length, targetWordCount, initializeDraftingPlan]);

  // Auto-tune generic placeholder titles to question if question is present
  useEffect(() => {
    const briefText = (typeof project?.answers?.["assignment_brief_text"] === "string" ? project.answers["assignment_brief_text"] : "") || question;
    if (internalSections.length > 0 && question && question.trim().length > 0) {
      const isNonML = !/\b(machine learning|deep learning|neural network|transformer|foundation model)\b/i.test(`${question} ${briefText}`);
      const hasGenericOrLeakedTitles = internalSections.some(
        (s) =>
          s.title.includes("Core Concept & Foundational") ||
          s.title.includes("Empirical Evidence & Contemporary Contextual") ||
          s.title.startsWith("Body Theme 1: Core Concept") ||
          (isNonML && /Mathematical Formulations|Loss Optimization Landscapes|Algorithmic Architectures/i.test(s.title)) ||
          /Divide Yourself in Teams|teams of 2|in classroom discussion/i.test(s.title)
      );
      if (hasGenericOrLeakedTitles) {
        tuneOutlineWithQuestion();
      }
    }
  }, [internalSections, question, project?.answers, tuneOutlineWithQuestion]);

  const handleTuneOutline = useCallback(async () => {
    setIsTuning(true);
    try {
      await tuneOutlineWithQuestion();
    } finally {
      setIsTuning(false);
    }
  }, [tuneOutlineWithQuestion]);

  // Active section entity
  const activeSection = useMemo(() => {
    if (!activeSectionId && internalSections.length > 0) {
      return internalSections[0];
    }
    return internalSections.find((s) => s.id === activeSectionId) || internalSections[0] || null;
  }, [activeSectionId, internalSections]);

  // Detailed Mode Academic Integrity & Quality Gates
  const uniquenessValidation = useMemo(() => {
    return validateSectionUniqueness(
      internalSections.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.draftContent || "",
      }))
    );
  }, [internalSections]);

  const activeProseAudit = useMemo(() => {
    if (!activeSection?.draftContent) return null;
    return auditAndEnforceCollegiateStyle(activeSection.draftContent);
  }, [activeSection?.draftContent]);

  const detectedCitationTokens = useMemo(() => {
    if (!activeSection?.draftContent) return [];
    const regex = /\[([^\[\]\(\)\r\n]+)\](?!\()/g;
    const tokens: string[] = [];
    let m;
    while ((m = regex.exec(activeSection.draftContent)) !== null) {
      tokens.push(m[1].trim());
    }
    return Array.from(new Set(tokens));
  }, [activeSection?.draftContent]);

  const activeIndex = useMemo(() => {
    if (!activeSection) return -1;
    return internalSections.findIndex((s) => s.id === activeSection.id);
  }, [activeSection, internalSections]);

  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < internalSections.length - 1;

  // Filter approved sources
  const approvedSources = useMemo(() => {
    return sources.filter((s) => s.status === "kept" || (approvedSourceIds && approvedSourceIds.includes(s.id)));
  }, [sources, approvedSourceIds]);

  // Stream single section (or revision)
  const handleStreamSection = useCallback(
    async (targetSection?: AssignmentDraftingSection, revisionPrompt?: "deepen" | "expand" | "condense" | string) => {
      const sec = targetSection || activeSection;
      if (!sec) return;

      setActiveSectionId(sec.id);
      setActiveStreamingSectionId(sec.id);
      setGeneratingSection(sec.id, true);
      setDraftError(null);
      setStreamingChunk(sec.draftContent || "");

      // ── Evidence Pack Construction (Production Spec §4.1–4.3) ──
      // Build context continuity from completed sections
      const sectionIndex = internalSections.findIndex((s) => s.id === sec.id);
      const continuity = buildContextContinuity(internalSections, sectionIndex);

      // Get analytical syntheses from project answers
      const projectAnswers = project?.answers || {};
      const syntheses = (projectAnswers.analyticalSyntheses || projectAnswers.analytical_syntheses || []) as any[];

      // Build evidence pack for this section
      const evidencePack = buildEvidencePack(
        sec,
        approvedSources,
        userUploadedSources || [],
        syntheses,
        continuity
      );

      // Serialize evidence pack for prompt injection
      const evidencePackPrompt = serializeEvidencePackForPrompt(evidencePack);

      const mappedIds = approvedSources
        .filter((s) => s.mappedSubheadingIds?.includes(sec.id))
        .map((s) => s.id);

      const planSection: InternalSectionPlan = {
        ...sec,
        sectionType: sec.sectionType || (sec.id.includes("intro") ? "intro" : sec.id.includes("conclusion") ? "conclusion" : "body"),
        academicFunction: sec.academicFunction || sec.title,
        boundSourceIds:
          sec.boundSourceIds && sec.boundSourceIds.length > 0
            ? sec.boundSourceIds
            : mappedIds.length > 0
            ? mappedIds
            : approvedSources.map((s) => s.id),
      };

      try {
        await streamSectionGeneration({
          projectId,
          section: planSection,
          assignmentTopic: question || "Academic Assignment",
          academicLevel,
          citationStyle,
          approvedSources,
          revisionPrompt,
          evidencePackPrompt, // Injected into the LLM prompt
          onChunk: (_chunk, aggregated) => {
            setStreamingChunk(aggregated);
          },
          onComplete: async (fullText) => {
            await updateSectionContent(sec.id, fullText);
            // Update context continuity state after section completion
            contextContinuityRef.current = updateContextContinuityAfterSection(
              contextContinuityRef.current,
              { ...sec, draftContent: fullText }
            );
            setStreamingChunk("");
            setActiveStreamingSectionId(null);
            setGeneratingSection(sec.id, false);
          },
          onError: (err) => {
            console.error("Section streaming failed:", err);
          },
        });
      } catch (err) {
        // Keep whatever the section had before; never fill it with stand-in text.
        setDraftError(`"${sec.title}" was not drafted: ${err instanceof Error ? err.message : String(err)}`);
        setStreamingChunk("");
        setActiveStreamingSectionId(null);
        setGeneratingSection(sec.id, false);
      }
    },
    [
      activeSection,
      projectId,
      project,
      question,
      academicLevel,
      citationStyle,
      approvedSources,
      userUploadedSources,
      internalSections,
      setActiveSectionId,
      setGeneratingSection,
      updateSectionContent,
    ]
  );

  // Generate Next Section (first incomplete)
  const handleGenerateNext = useCallback(() => {
    const nextPending = internalSections.find(
      (s) =>
        s.status !== "completed" &&
        (!s.draftContent || s.draftContent.trim().length === 0) &&
        !generatingSectionIds[s.id]
    );
    if (nextPending) {
      handleStreamSection(nextPending);
    } else if (activeSection) {
      handleStreamSection(activeSection);
    }
  }, [internalSections, generatingSectionIds, activeSection, handleStreamSection]);

  // Generate All Remaining sequentially
  const handleGenerateAll = useCallback(async () => {
    setIsGeneratingAll(true);
    const pendingList = internalSections.filter(
      (s) => !s.draftContent || s.draftContent.trim().length === 0
    );

    for (const pending of pendingList) {
      await handleStreamSection(pending);
    }
    setIsGeneratingAll(false);
  }, [internalSections, handleStreamSection]);

  // Phase 3 Exit Gate Validation:
  // 1. All internalSections have status completed or non-empty draftContent
  // 2. Aggregate word count is within ±10% of targetWordCount
  const minRequiredWords = Math.floor(targetWordCount * 0.9);
  const maxAllowedWords = Math.ceil(targetWordCount * 1.1);
  const isWordCountCompliant =
    targetWordCount > 0 &&
    currentWordCount >= minRequiredWords &&
    currentWordCount <= maxAllowedWords;

  const allSectionsCompleted =
    internalSections.length > 0 &&
    internalSections.every(
      (sec) =>
        sec.status === "completed" ||
        Boolean(sec.draftContent && sec.draftContent.trim().length > 0)
    );

  const canProceed = allSectionsCompleted && isWordCountCompliant;

  const handleProceed = () => {
    if (!canProceed) return;
    if (onProceed) onProceed();
    else setPhase("submission");
  };

  const handleBack = () => {
    if (onBack) onBack();
    else setPhase("sources");
  };

  // Without a brief the outline would be generic headings about nothing in
  // particular. Ask for the brief instead, unless the student already wrote.
  if (!isLoading && project && !question?.trim() && currentWordCount === 0) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 text-neutral-900 dark:text-neutral-100">
        <section
          data-testid="drafting-needs-brief"
          className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-3 text-center"
        >
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Add your assignment brief first</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
            Drafting builds its sections from your assignment question, word count and citation style. Enter them in Extract and the outline appears here.
          </p>
          <button
            type="button"
            onClick={() => setPhase("extract")}
            className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 cursor-pointer"
          >
            Go to Extract
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 text-neutral-900 dark:text-neutral-100">
      {/* Top Phase Header with Live Word Count Progress Bar */}
      <header className="rounded-2xl p-6 bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400">
                Phase 03 · Drafting & Synthesis
              </span>
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                PEEL Framework & Evidence Grounding
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              Grounded Section-by-Section Drafting
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl">
              Write your assignment section-by-section with 70% critical analysis / 30% description, automated citation binding, and real-time budget convergence. Customize section directives, revise with AI, or edit prose directly.
            </p>
          </div>

          {/* Quick Exit Gate & Presentation Action Pills */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const handler = onPresentPresentation || onPresentKeynote;
                if (handler) {
                  handler(draftMarkdown);
                } else {
                  const deck = extractSlidesFromAcademicText(draftMarkdown, "SCR");
                  setPresentationDeck(deck);
                  setShowPresentation(true);
                }
              }}
              aria-label="Present Presentation"
              className="rounded-full px-4 py-1.5 text-sm font-medium border border-neutral-200/80 bg-white hover:bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-ink-750 dark:hover:bg-neutral-800 dark:text-neutral-100 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>📽️</span>
              <span>Present Presentation</span>
            </button>

            <button
              type="button"
              onClick={handleProceed}
              disabled={!canProceed}
              aria-label="Proceed to Submission Audit"
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
                canProceed
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] cursor-pointer"
                  : "bg-neutral-100 dark:bg-white/5 text-neutral-400 dark:text-neutral-500 cursor-not-allowed border border-neutral-200/60 dark:border-white/5"
              }`}
            >
              <span>Proceed to Submission Audit</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Aggregate Word Count Tracker Banner */}
        <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                Overall Draft Progress:
              </span>
              <span className="text-sm font-bold text-neutral-900 dark:text-white tabular-nums">
                {currentWordCount.toLocaleString()} / {targetWordCount.toLocaleString()} words ({wordCountPercentage}%)
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Target tolerance: {minRequiredWords.toLocaleString()} – {maxAllowedWords.toLocaleString()} words (±10% compliance threshold)
            </p>
          </div>

          <div className="w-full sm:w-64 space-y-1">
            <div className="w-full bg-neutral-200 dark:bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isWordCountCompliant ? "bg-emerald-500" : "bg-neutral-900 dark:bg-white"
                }`}
                style={{ width: `${Math.min(100, wordCountPercentage)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
              <span>90% ({minRequiredWords}w)</span>
              <span>100% ({targetWordCount}w)</span>
              <span>110% ({maxAllowedWords}w)</span>
            </div>
          </div>
        </div>
      </header>

      {/* Detailed Mode Telemetry Panel: Overlap Validation (< 20%), Active-Voice & Anti-Fluff Metrics, Citation Tokens */}
      {executionMode === "detailed" && (
        <section
          aria-label="Detailed Drafting Telemetry & Validation"
          className="rounded-2xl p-5 bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs space-y-4 font-sans animate-in fade-in duration-200"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Detailed Mode · Academic Integrity & Citation Grounding Inspector
              </h2>
            </div>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              Live Collegiate Directives Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* 1. Inter-Section Uniqueness (< 20% Overlap) */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Section Uniqueness</span>
                <span
                  className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                    uniquenessValidation.isUnique
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  }`}
                >
                  {uniquenessValidation.isUnique ? "< 20% Overlap (Pass)" : "Overlap Violation"}
                </span>
              </div>
              <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {Math.round(uniquenessValidation.maxSimilarity * 100)}% Max Similarity
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                {uniquenessValidation.isUnique
                  ? "Zero cross-section argument replication across all sections."
                  : `Redundancy between: "${uniquenessValidation.conflictingPair?.[0]}" & "${uniquenessValidation.conflictingPair?.[1]}".`}
              </p>
            </div>

            {/* 2. Active-Voice & Anti-Fluff Metrics */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Active-Voice Ratio</span>
                <span
                  className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                    !activeProseAudit || activeProseAudit.activeVoiceRatio >= 0.8
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  }`}
                >
                  {activeProseAudit ? `${Math.round(activeProseAudit.activeVoiceRatio * 100)}% (Target ≥80%)` : "Pending Draft"}
                </span>
              </div>
              <div className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {activeProseAudit?.isCompliant ? "Collegiate Prose Verified" : "Active Re-writing Needed"}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                {activeProseAudit && activeProseAudit.violations.length > 0
                  ? `${activeProseAudit.violations.length} advisory detected: ${activeProseAudit.violations[0]}`
                  : "Zero throat-clearing openings or banned nominalizations detected."}
              </p>
            </div>

            {/* 3. Citation Token Mappings ([ev-uuid], [1]) */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Citation Tokens</span>
                <span className="text-[10px] font-mono uppercase font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {citationStyle.toUpperCase()} Interceptor
                </span>
              </div>
              <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {detectedCitationTokens.length} Token{detectedCitationTokens.length !== 1 ? "s" : ""} Bound
              </div>
              <div className="flex flex-wrap gap-1 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                {detectedCitationTokens.length > 0 ? (
                  detectedCitationTokens.slice(0, 4).map((tok, i) => (
                    <span key={i} className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                      [{tok}]
                    </span>
                  ))
                ) : (
                  <span>[1], [ev-uuid] tokens intercept into authoritative citations</span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Drafting Workspace Layout (Left Rail Index + Center Active Editor) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Rail / Section Index */}
        <div className="md:col-span-4 lg:col-span-3.5">
          <DraftingSectionIndex
            sections={internalSections}
            activeSectionId={activeSection?.id || null}
            onSelectSection={(id) => setActiveSectionId(id)}
            onGenerateNext={handleGenerateNext}
            onGenerateAll={handleGenerateAll}
            onTuneToQuestion={handleTuneOutline}
            onUpdateSectionTitle={updateSectionTitle}
            assignmentTopic={question}
            isTuning={isTuning}
            isGenerating={Boolean(activeStreamingSectionId) || isGeneratingAll}
            generatingSectionId={activeStreamingSectionId}
          />
        </div>

        {/* Center Active Streaming & Markdown Editor */}
        <div className="md:col-span-8 lg:col-span-8.5">
          <DraftingActiveEditor
            section={activeSection}
            onUpdateContent={(content) => {
              if (activeSection) {
                updateSectionContent(activeSection.id, content);
              }
            }}
            onUpdateTitle={(newTitle) => {
              if (activeSection) {
                updateSectionTitle(activeSection.id, newTitle);
              }
            }}
            onStreamSection={(revType) => handleStreamSection(activeSection || undefined, revType)}
            isStreaming={Boolean(activeStreamingSectionId && activeStreamingSectionId === activeSection?.id)}
            streamingChunk={activeStreamingSectionId === activeSection?.id ? streamingChunk : ""}
            boundSources={approvedSources.filter((s) => activeSection?.boundSourceIds?.includes(s.id))}
            allApprovedSources={approvedSources}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            onNavigatePrevious={() => {
              if (hasPrevious) {
                setActiveSectionId(internalSections[activeIndex - 1].id);
              }
            }}
            onNavigateNext={() => {
              if (hasNext) {
                setActiveSectionId(internalSections[activeIndex + 1].id);
              }
            }}
          />

          {/* Live Bibliography Section */}
          {approvedSources.length > 0 && (
            <div className="mt-6 rounded-2xl bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-100 dark:border-white/5 flex items-center gap-2 bg-neutral-50/50 dark:bg-white/[0.02]">
                <Book className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Live Bibliography</h3>
              </div>
              <div className="p-5 text-[13px] text-neutral-700 dark:text-neutral-300 leading-relaxed space-y-4">
                {buildFormattedBibliography(approvedSources, citationStyle || "harvard").map((bib, i) => (
                  <p key={i} className="pl-6 -indent-6" dangerouslySetInnerHTML={{ __html: bib }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phase 3 Exit Gate Bottom Card */}
      <footer className="rounded-2xl p-5 bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={handleBack}
          className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>← Back to Sources & Evidence</span>
        </button>

        {draftError && (
          <div role="alert" className="flex items-start gap-2 text-xs text-[var(--text-primary)] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-3 py-2 max-w-md">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{draftError}</span>
          </div>
        )}

        {/* Gate Status Feedback */}
        <div className="flex-1 flex items-center justify-center text-center px-4">
          {canProceed ? (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Phase 3 Exit Gate Unlocked: All {internalSections.length} sections completed & word count is within ±10% margin.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                {!allSectionsCompleted
                  ? `Drafting in progress: Complete all sections (${
                      internalSections.filter((s) => s.draftContent?.trim()).length
                    }/${internalSections.length}) to unlock submission audit.`
                  : `Word count (${currentWordCount.toLocaleString()}w) is outside target margin (${minRequiredWords}w – ${maxAllowedWords}w). Use Expand or Condense.`}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleProceed}
          disabled={!canProceed}
          className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 shrink-0 self-end sm:self-auto ${
            canProceed
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] cursor-pointer shadow-xs"
              : "bg-neutral-100 dark:bg-white/5 text-neutral-400 dark:text-neutral-500 cursor-not-allowed border border-neutral-200/60 dark:border-white/5"
          }`}
        >
          <span>Proceed to Submission Audit</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </footer>

      {/* Fullscreen Presentation Overlay */}
      {(showPresentation || showKeynote) && (presentationDeck || keynoteDeck) && (
        <div
          className="fixed inset-0 z-50 bg-paper-sand dark:bg-ink-850 overflow-auto flex flex-col justify-center animate-in fade-in duration-200"
          data-testid="drafting-keynote-overlay"
        >
          <SlideCanvas
            deck={presentationDeck || keynoteDeck}
            onClose={() => {
              setShowPresentation(false);
              setShowKeynote(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default AssignmentDraftingStage;
