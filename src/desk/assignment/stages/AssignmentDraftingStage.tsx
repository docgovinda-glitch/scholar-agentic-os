import OutlineByAiPanel from "../components/OutlineByAiPanel";
import { useToast } from "../../../components/ui/FeedbackSystem";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { SlideCanvas, extractSlidesFromAcademicText, type SlideDeck } from "../../../features/slides";
import { ReferencesCard } from "../components/ReferencesCard";
import { selectCitedSources } from "../services/exportText";
import { buildFormattedBibliography } from "../services/assignmentExportService";
import { formatReferenceHtml } from "../services/referenceListGenerator";
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
    saveAnswers,
    writingStyle,
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
    isLoading,
    structure,
    rewriteOutline,
    restoreOutline,
  } = useAssignmentWorkspace();

  const [streamingChunk, setStreamingChunk] = useState<string>("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const { showError } = useToast();
  const [activeStreamingSectionId, setActiveStreamingSectionId] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isTuning, setIsTuning] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const [showKeynote, setShowKeynote] = useState(false);
  const [presentationDeck, setPresentationDeck] = useState<SlideDeck | null>(null);
  const [keynoteDeck, setKeynoteDeck] = useState<SlideDeck | null>(null);
  // Beside the editor on wide screens; on phones it would push the writing
  // area off screen, so it starts hidden there (Previous/Next still move).
  const [showOutline, setShowOutline] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia("(min-width: 1024px)").matches
  );

  const draftMarkdown = useMemo(() => {
    const body = internalSections.map((sec) => `## ${sec.title}\n\n${sec.draftContent || ""}`).join("\n\n");
    const approved = sources.filter((s) => s.status === "kept" || (approvedSourceIds && approvedSourceIds.includes(s.id)));
    // The compiled draft lists only what the text cites, plus the brief's prescribed references.
    const refs = buildFormattedBibliography(selectCitedSources(approved, body), citationStyle || "harvard");
    return refs.length ? `${body}\n\n## References\n\n${refs.join("\n\n")}` : body;
  }, [internalSections, sources, approvedSourceIds, citationStyle]);

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
      setOfflineNotice(null);
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
          report: {
            sectionIndex,
            sectionCount: internalSections.length,
            outlineTitles: internalSections.map((x) => x.title),
            previousTail: sectionIndex > 0 ? (internalSections[sectionIndex - 1].draftContent || "").slice(-400) : undefined,
            remainingEssayWords: Math.max(
              0,
              (targetWordCount || 0) -
                internalSections.filter((x) => x.id !== sec.id).reduce((n, x) => n + (x.draftContent ? x.draftContent.trim().split(/\s+/).filter(Boolean).length : 0), 0)
            ),
          },
          writingStyle: writingStyle && typeof writingStyle === "object" ? (writingStyle as { preset?: string; customSampleText?: string }) : undefined,
          onFallback: ({ reason }) => {
            setOfflineNotice(`${reason} Showing a scaffold built from your outline; write the analysis yourself or try again later.`);
          },
        });
      } catch (err) {
        // Keep whatever the section had before; never fill it with stand-in text.
        // One clean toast; no uncaught console stack traces.
        showError(`"${sec.title}" was not drafted: ${err instanceof Error ? err.message : String(err)}`);
        setStreamingChunk("");
        setActiveStreamingSectionId(null);
        setGeneratingSection(sec.id, false);
      }
    },
    [
      writingStyle,
      targetWordCount,
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
    <div className="max-w-[1600px] mx-auto p-3 sm:p-5 space-y-4 text-neutral-900 dark:text-neutral-100">
      {/* Compact header: progress and actions in one row, so the page is mostly writing space */}
      <header className="rounded-2xl px-4 sm:px-5 py-3 bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setShowOutline((v) => !v)}
            aria-pressed={showOutline}
            aria-label={showOutline ? "Hide outline" : "Show outline"}
            title={showOutline ? "Hide the outline for more writing space" : "Show the outline"}
            className="p-2 rounded-lg border border-neutral-200/80 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5 cursor-pointer shrink-0"
          >
            {showOutline ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">Drafting</h1>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              Draft or stream each section. Changes auto-save.
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-0 lg:px-4" aria-label="Overall progress">
          <div className="flex items-center justify-between text-[11px] text-neutral-600 dark:text-neutral-300 mb-1 gap-2">
            <span className="font-semibold tabular-nums">
              {currentWordCount.toLocaleString()} / {targetWordCount.toLocaleString()} words
            </span>
            <span className="text-neutral-400 dark:text-neutral-500 tabular-nums">
              aim for {minRequiredWords.toLocaleString()}–{maxAllowedWords.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isWordCountCompliant ? "bg-emerald-500" : "bg-neutral-900 dark:bg-white"}`}
              style={{ width: `${Math.min(100, wordCountPercentage)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
            className="rounded-xl px-3 py-2 text-xs font-medium border border-neutral-200/80 bg-white hover:bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-ink-750 dark:hover:bg-neutral-800 dark:text-neutral-100 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span aria-hidden="true">📽️</span>
            <span>Present</span>
          </button>
          <button
            type="button"
            onClick={handleProceed}
            disabled={!canProceed}
            aria-label="Proceed to Submission Audit"
            title={canProceed ? undefined : "Draft every section and reach the word range first"}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              canProceed
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 cursor-pointer"
                : "bg-neutral-100 dark:bg-white/5 text-neutral-400 dark:text-neutral-500 cursor-not-allowed border border-neutral-200/60 dark:border-white/5"
            }`}
          >
            <span>Proceed to Submission Audit</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {offlineNotice && (
        <p role="status" className="text-xs text-neutral-600 dark:text-neutral-400 px-1" data-testid="offline-draft-notice">
          {offlineNotice}
        </p>
      )}

      {draftError && (
        <div role="alert" className="flex items-start gap-2 text-xs text-[var(--text-primary)] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="flex-1">{draftError}</span>
          <button type="button" onClick={() => setDraftError(null)} className="text-[11px] underline cursor-pointer shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* Outline (can be hidden) beside a wide writing area */}
      <div className={`grid grid-cols-1 gap-5 items-start ${showOutline ? "lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]" : ""}`}>
        {showOutline && (
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <OutlineByAiPanel structure={structure} onRewrite={rewriteOutline} onRestore={restoreOutline} />
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
        )}

        {/* Writing area */}
        <div className="min-w-0">
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

          {/* Live compiled References */}
          {selectCitedSources(approvedSources, internalSections.map((x) => x.draftContent || "").join("\n\n")).length > 0 && (
            <ReferencesCard
              sources={selectCitedSources(approvedSources, internalSections.map((x) => x.draftContent || "").join("\n\n"))}
              style={citationStyle || "harvard"}
              savedEdit={typeof project?.answers?.["assignment_reference_list_edit"] === "string" ? (project?.answers?.["assignment_reference_list_edit"] as string) : ""}
              onSaveEdit={(text) => {
                void saveAnswers?.({ assignment_reference_list_edit: text });
              }}
            />
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
