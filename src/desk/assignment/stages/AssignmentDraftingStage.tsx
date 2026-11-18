import { DEFAULT_CITATION_STYLE } from "../../../domain/assignment/answerKeys";
import { hasLeakedTemplateHeadings } from "../../../domain/assignment/legacyPurge";
import type { SectionAnalyticalSynthesis } from "../types";
import OutlineByAiPanel from "../components/OutlineByAiPanel";
import { selectApprovedSources } from "../../../domain/assignment/approvedSources";
import { clipHeadingWords } from "../../../utils/briefQuestions";
import { countProseWords } from "../../../shared/proseBlocks";
import { useToast } from "../../../components/ui/FeedbackSystem";
import { useState,useCallback,useMemo,useEffect,useRef } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { DraftingSectionIndex } from "../components/DraftingSectionIndex";
import { DraftingActiveEditor } from "../components/DraftingActiveEditor";
import {
partialTextOf,
SectionDraftStoppedError,
streamSectionGeneration,
type InternalSectionPlan,
} from "../services/invisibleChunkerService";
import { previewDraftText } from "../services/draftPreview";
import { trimToLastSentence } from "../../../domain/assignment/draftPartials";
import { buildEvidencePack,serializeEvidencePackForPrompt } from "../services/evidencePackService";
import { buildContextContinuity,updateContextContinuityAfterSection } from "../services/contextContinuityService";
import type { ContextContinuityState } from "../services/evidencePackService";
import type { AssignmentDraftingSection } from "../types";
import { hasOutline } from "../types";
import {
ArrowRight,
ArrowLeft,
CheckCircle2,
AlertCircle,PanelLeftClose,
PanelLeftOpen
} from "lucide-react";
import { SlideCanvas,extractSlidesFromAcademicText,type SlideDeck } from "../../../features/slides";
import { ReferencesCard } from "../components/ReferencesCard";
import { selectCitedSources } from "../services/exportText";
import { buildFormattedBibliography } from "../services/assignmentExportService";

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
  // The offline scaffold is a guide shown beside the section, never saved as its text:
  // it must not count as drafted words or mark the section ready.
  const [offlineScaffold, setOfflineScaffold] = useState<{ sectionId: string; title: string; text: string } | null>(null);
  const { showError, showInfo } = useToast();
  const [activeStreamingSectionId, setActiveStreamingSectionId] = useState<string | null>(null);
  // One draft at a time: its controller, so Stop can end it (the server then
  // stops the model). A second click while it runs does nothing.
  const inFlightRef = useRef<{ sectionId: string; controller: AbortController } | null>(null);
  // The latest sections, so a draft started right after another finishes
  // gives the model the text the section before it now has.
  const sectionsRef = useRef(internalSections);
  sectionsRef.current = internalSections;
  // Text a stopped or failed draft reached, kept (and saved) until the student
  // resumes, keeps or discards it.
  const savedPartials = useMemo(() => {
    const raw = project?.answers?.["assignment_section_partials"];
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
  }, [project?.answers]);
  const partialsRef = useRef<Record<string, string>>(savedPartials);
  useEffect(() => {
    partialsRef.current = savedPartials;
  }, [savedPartials]);
  const savePartial = useCallback(
    (sectionId: string, text: string | null) => {
      const next = { ...partialsRef.current };
      if (text && text.trim()) next[sectionId] = text;
      else delete next[sectionId];
      partialsRef.current = next;
      void saveAnswers?.({ assignment_section_partials: Object.keys(next).length ? next : null });
    },
    [saveAnswers]
  );
  const [showPresentation, setShowPresentation] = useState(false);
  const [presentationDeck, setPresentationDeck] = useState<SlideDeck | null>(null);
  // Beside the editor on wide screens; on phones it would push the writing
  // area off screen, so it starts hidden there (Previous/Next still move).
  const [showOutline, setShowOutline] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia("(min-width: 1024px)").matches
  );

  const draftMarkdown = useMemo(() => {
    const body = internalSections.map((sec) => `## ${sec.title}\n\n${sec.draftContent || ""}`).join("\n\n");
    const approved = selectApprovedSources(sources, approvedSourceIds);
    // The compiled draft lists only what the text cites, plus the brief's prescribed references.
    const refs = buildFormattedBibliography(selectCitedSources(approved, body), citationStyle || DEFAULT_CITATION_STYLE);
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
    const briefText = (typeof project?.answers?.["assignment_brief"] === "string" ? project.answers["assignment_brief"] : "") || question;
    if (internalSections.length > 0 && question && question.trim().length > 0) {
      const hasGenericOrLeakedTitles = hasLeakedTemplateHeadings(internalSections.map((s) => s.title), `${question} ${briefText}`);
      if (hasGenericOrLeakedTitles) {
        tuneOutlineWithQuestion();
      }
    }
  }, [internalSections, question, project?.answers, tuneOutlineWithQuestion]);


  // Active section entity
  const activeSection = useMemo(() => {
    if (!activeSectionId && internalSections.length > 0) {
      return internalSections[0];
    }
    return internalSections.find((s) => s.id === activeSectionId) || internalSections[0] || null;
  }, [activeSectionId, internalSections]);

  // Detailed Mode Academic Integrity & Quality Gates



  const activeIndex = useMemo(() => {
    if (!activeSection) return -1;
    return internalSections.findIndex((s) => s.id === activeSection.id);
  }, [activeSection, internalSections]);

  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < internalSections.length - 1;

  // Filter approved sources
  const approvedSources = useMemo(() => {
    return selectApprovedSources(sources, approvedSourceIds);
  }, [sources, approvedSourceIds]);

  // Stream single section (or revision, or resume from a stopped draft)
  const handleStreamSection = useCallback(
    async (
      targetSection?: AssignmentDraftingSection,
      revisionPrompt?: "deepen" | "expand" | "condense" | string,
      opts: { continueFrom?: string } = {}
    ): Promise<"done" | "stopped" | "failed"> => {
      const sec = targetSection || activeSection;
      if (!sec) return "failed";
      if (inFlightRef.current) {
        if (inFlightRef.current.sectionId !== sec.id) showInfo?.("One section is being written. Stop it or wait for it to finish.");
        return "failed";
      }
      const controller = new AbortController();
      inFlightRef.current = { sectionId: sec.id, controller };

      const sections = sectionsRef.current;

      setActiveSectionId(sec.id);
      setActiveStreamingSectionId(sec.id);
      setGeneratingSection(sec.id, true);
      setDraftError(null);
      setOfflineNotice(null);
      setOfflineScaffold(null);
      setStreamingChunk(opts.continueFrom ? previewDraftText(opts.continueFrom, approvedSources, citationStyle || DEFAULT_CITATION_STYLE) : "");

      // ── Evidence Pack Construction (Production Spec §4.1–4.3) ──
      // Build context continuity from completed sections
      const sectionIndex = sections.findIndex((s) => s.id === sec.id);
      const continuity = buildContextContinuity(sections, sectionIndex);

      // Get analytical syntheses from project answers
      const projectAnswers = project?.answers || {};
      const syntheses = (projectAnswers.analyticalSyntheses || projectAnswers.analytical_syntheses || []) as SectionAnalyticalSynthesis[];

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

      // Sources mapped to this section (by the student, or by the AI's reading).
      const mappedTo = (src: (typeof approvedSources)[number]) => [...(src.mappedSubheadingIds ?? []), ...(src.aiSections ?? [])];
      const mappedIds = approvedSources.filter((s) => mappedTo(s).includes(sec.id)).map((s) => s.id);
      // A section with none mapped gets the approved sources not mapped to another section.
      const unmappedIds = approvedSources.filter((s) => mappedTo(s).length === 0).map((s) => s.id);

      const planSection: InternalSectionPlan = {
        ...sec,
        sectionType: sec.sectionType || (sec.id.includes("intro") ? "intro" : sec.id.includes("conclusion") ? "conclusion" : "body"),
        academicFunction: sec.academicFunction || sec.title,
        boundSourceIds:
          sec.boundSourceIds && sec.boundSourceIds.length > 0
            ? sec.boundSourceIds
            : mappedIds.length > 0
            ? mappedIds
            : unmappedIds.length > 0
            ? unmappedIds
            : approvedSources.map((s) => s.id),
      };

      const finish = () => {
        setStreamingChunk("");
        setActiveStreamingSectionId(null);
        setGeneratingSection(sec.id, false);
        if (inFlightRef.current?.controller === controller) inFlightRef.current = null;
      };
      // What has arrived is saved every few seconds, so a reload or crash keeps it.
      let lastPartialSave = Date.now();

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
          signal: controller.signal,
          continueFrom: opts.continueFrom,
          onChunk: (_chunk, aggregated) => {
            setStreamingChunk(previewDraftText(aggregated, approvedSources, citationStyle || DEFAULT_CITATION_STYLE));
            if (!revisionPrompt && Date.now() - lastPartialSave > 5000) {
              lastPartialSave = Date.now();
              savePartial(sec.id, aggregated);
            }
          },
          onComplete: async (fullText, meta) => {
            if (meta?.scaffold) {
              setOfflineScaffold({ sectionId: sec.id, title: sec.title, text: fullText });
              finish();
              return;
            }
            await updateSectionContent(sec.id, fullText);
            if (partialsRef.current[sec.id]) savePartial(sec.id, null);
            // Update context continuity state after section completion
            contextContinuityRef.current = updateContextContinuityAfterSection(
              contextContinuityRef.current,
              { ...sec, draftContent: fullText }
            );
            finish();
          },
          report: {
            sectionIndex,
            sectionCount: sections.length,
            outlineTitles: sections.map((x) => x.title),
            previousTail: sectionIndex > 0 ? (sections[sectionIndex - 1].draftContent || "").slice(-400) : undefined,
            remainingEssayWords: Math.max(
              0,
              (targetWordCount || 0) -
                sections.filter((x) => x.id !== sec.id).reduce((n, x) => n + countProseWords(x.draftContent || ""), 0)
            ),
          },
          writingStyle: writingStyle && typeof writingStyle === "object" ? (writingStyle as { preset?: string; customSampleText?: string }) : undefined,
          onFallback: ({ reason }) => {
            setOfflineNotice(`${reason} Nothing was written into the section. Below is a scaffold built from your outline: try again, or insert it and write the analysis yourself.`);
          },
        });
        return "done";
      } catch (err) {
        // Keep whatever the section had before; never fill it with stand-in text.
        // Text that had arrived is kept aside to resume or keep.
        const partial = err instanceof SectionDraftStoppedError ? err.partialText : partialTextOf(err);
        if (partial.trim() && !revisionPrompt) savePartial(sec.id, partial);
        finish();
        if (err instanceof SectionDraftStoppedError) return "stopped";
        showError(`"${clipHeadingWords(sec.title)}" was not ${revisionPrompt ? "revised" : "drafted"}: ${err instanceof Error ? err.message : String(err)}`);
        return "failed";
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
      setActiveSectionId,
      setGeneratingSection,
      updateSectionContent,
      savePartial,
      showError,
      showInfo,
    ]
  );

  /** Stop the section being written; the server stops the model too. */
  const handleStop = useCallback(() => {
    inFlightRef.current?.controller.abort();
  }, []);

  // A stopped draft carries on from where it ended.
  const handleResume = useCallback(
    (section: AssignmentDraftingSection) => {
      const partial = trimToLastSentence(partialsRef.current[section.id] || "");
      if (!partial) return;
      void handleStreamSection(section, undefined, { continueFrom: partial });
    },
    [handleStreamSection]
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

  const activePartial = activeSection && !activeStreamingSectionId ? savedPartials[activeSection.id] : undefined;

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
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 text-[color:var(--text-primary)]">
        <section
          data-testid="drafting-needs-brief"
          className="rounded-2xl p-6 sm:p-8 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs space-y-3 text-center"
        >
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Add your assignment brief first</h1>
          <p className="text-sm text-[color:var(--text-muted)] max-w-md mx-auto">
            Drafting builds its sections from your assignment question, word count and citation style. Enter them in Extract and the outline appears here.
          </p>
          <button
            type="button"
            onClick={() => setPhase("extract")}
            className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 cursor-pointer"
          >
            Go to Extract
          </button>
        </section>
      </div>
    );
  }

  // No outline yet: sections come from the outline the AI wrote (or the
  // student's own), never from a template.
  if (!isLoading && project && internalSections.length === 0 && !hasOutline(structure)) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 text-[color:var(--text-primary)]">
        <section
          data-testid="drafting-needs-outline"
          className="rounded-2xl p-6 sm:p-8 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs space-y-3 text-center"
        >
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Plan your outline first</h1>
          <p className="text-sm text-[color:var(--text-muted)] max-w-md mx-auto">
            Drafting writes one section at a time from your approved outline. Build it with your AI, or write your own, in Understand.
          </p>
          <button
            type="button"
            onClick={() => setPhase("understand")}
            className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 cursor-pointer"
          >
            Go to Understand
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto p-3 sm:p-5 space-y-4 text-[color:var(--text-primary)]">
      {/* Compact header: progress and actions in one row, so the page is mostly writing space */}
      <header className="rounded-2xl px-4 sm:px-5 py-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setShowOutline((v) => !v)}
            aria-pressed={showOutline}
            aria-label={showOutline ? "Hide outline" : "Show outline"}
            title={showOutline ? "Hide the outline for more writing space" : "Show the outline"}
            className="p-2 rounded-lg border border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)] cursor-pointer shrink-0"
          >
            {showOutline ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">Drafting</h1>
            <p className="text-xs text-[color:var(--text-muted)] truncate">
              Draft or stream each section. Changes auto-save.
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-0 lg:px-4" aria-label="Overall progress">
          <div className="flex items-center justify-between text-xs text-[color:var(--text-secondary)] mb-1 gap-2">
            <span className="font-semibold tabular-nums">
              {currentWordCount.toLocaleString()} / {targetWordCount.toLocaleString()} words
            </span>
            <span className="text-[color:var(--text-muted)] tabular-nums">
              aim for {minRequiredWords.toLocaleString()}–{maxAllowedWords.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-[color:var(--surface-sunken)] h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isWordCountCompliant ? "bg-emerald-500" : "bg-[color:var(--accent-solid)]"}`}
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
            className="rounded-xl px-3 py-2 text-xs font-medium border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer"
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
                ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 cursor-pointer"
                : "bg-[color:var(--surface-inset)] text-[color:var(--text-muted)] cursor-not-allowed border border-[color:var(--border-subtle)]"
            }`}
          >
            <span>Proceed to Submission Audit</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {activeStreamingSectionId && (
        <div role="status" data-testid="drafting-live" className="flex items-center gap-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-3 py-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-[color:var(--accent-solid)] animate-pulse shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0 truncate text-[color:var(--text-secondary)]">
            Writing "{clipHeadingWords(internalSections.find((x) => x.id === activeStreamingSectionId)?.title || "section")}"
          </span>
          <button
            type="button"
            onClick={handleStop}
            className="px-3 py-1 rounded-full border border-[color:var(--border-default)] font-medium hover:bg-[color:var(--surface-hover)] cursor-pointer"
          >
            Stop
          </button>
        </div>
      )}

      {activeSection && activePartial && (
        <div role="status" data-testid="drafting-partial" className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/70 px-3 py-2 text-xs space-y-2">
          <p className="text-[color:var(--text-secondary)]">
            Drafting of "{clipHeadingWords(activeSection.title)}" stopped after {countProseWords(activePartial).toLocaleString()} words. It is kept here, not in the section yet.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleResume(activeSection)}
              className="px-3 py-1 rounded-full bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] font-medium cursor-pointer"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={async () => {
                await updateSectionContent(activeSection.id, previewDraftText(activePartial, approvedSources, citationStyle || DEFAULT_CITATION_STYLE).trim());
                savePartial(activeSection.id, null);
              }}
              className="px-3 py-1 rounded-full border border-[color:var(--border-default)] font-medium cursor-pointer"
            >
              Keep this text
            </button>
            <button
              type="button"
              onClick={() => savePartial(activeSection.id, null)}
              className="px-3 py-1 rounded-full font-medium text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {offlineNotice && (
        <div role="status" className="text-xs text-[color:var(--text-secondary)] px-1 space-y-2" data-testid="offline-draft-notice">
          <p>{offlineNotice}</p>
          {offlineScaffold && (
            <details className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/70 px-3 py-2">
              <summary className="cursor-pointer font-medium text-[color:var(--text-primary)]">Scaffold for "{offlineScaffold.title}"</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-[color:var(--text-secondary)]">{offlineScaffold.text}</pre>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = internalSections.find((x) => x.id === offlineScaffold.sectionId);
                    if (target) handleStreamSection(target);
                  }}
                  className="px-3 py-1 rounded-full bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] font-medium cursor-pointer"
                >
                  Try AI again
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await updateSectionContent(offlineScaffold.sectionId, offlineScaffold.text);
                    setOfflineScaffold(null);
                    setOfflineNotice(null);
                  }}
                  className="px-3 py-1 rounded-full border border-[color:var(--border-default)] font-medium cursor-pointer"
                >
                  Insert scaffold into section
                </button>
              </div>
            </details>
          )}
        </div>
      )}

      {draftError && (
        <div role="alert" className="flex items-start gap-2 text-xs text-[var(--text-primary)] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="flex-1">{draftError}</span>
          <button type="button" onClick={() => setDraftError(null)} className="text-xs underline cursor-pointer shrink-0">
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
            onUpdateSectionTitle={updateSectionTitle}
            assignmentTopic={question}
            isGenerating={Boolean(activeStreamingSectionId)}
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
            citationStyle={citationStyle || DEFAULT_CITATION_STYLE}
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
              style={citationStyle || DEFAULT_CITATION_STYLE}
              savedEdit={typeof project?.answers?.["assignment_reference_list_edit"] === "string" ? (project?.answers?.["assignment_reference_list_edit"] as string) : ""}
              onSaveEdit={(text) => {
                void saveAnswers?.({ assignment_reference_list_edit: text });
              }}
            />
          )}
        </div>
      </div>

      {/* Phase 3 Exit Gate Bottom Card */}
      <footer className="rounded-2xl p-5 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={handleBack}
          className="px-4 py-2 rounded-xl text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
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
            <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
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
              ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 active:scale-[0.99] cursor-pointer shadow-xs"
              : "bg-[color:var(--surface-inset)] text-[color:var(--text-muted)] cursor-not-allowed border border-[color:var(--border-subtle)]"
          }`}
        >
          <span>Proceed to Submission Audit</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </footer>

      {/* Fullscreen Presentation Overlay */}
      {showPresentation && presentationDeck && (
        <div
          className="fixed inset-0 z-50 bg-paper-sand dark:bg-ink-850 overflow-auto flex flex-col justify-center animate-in fade-in duration-200"
          data-testid="drafting-keynote-overlay"
        >
          <SlideCanvas
            deck={presentationDeck}
            onClose={() => {
              setShowPresentation(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default AssignmentDraftingStage;
