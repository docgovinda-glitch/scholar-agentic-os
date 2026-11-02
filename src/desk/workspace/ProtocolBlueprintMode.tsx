import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { ProjectView } from "../types";
import type {
  WordBudgetBlueprint,
  SectionBudget,
  SubSectionBudget,
  ManuscriptTemplate,
} from "./types";
import { useResearchWorkspace } from "./ResearchContext";
import { saveIntakeAnswers, allocateProjectWordBudget } from "../api";
import { executeAgenticLLM } from "../api";
import { normalizeUnicodeNFC } from "../../document_intelligence/index";
import { parseAndRepairLLMJson } from "../../shared/llmJsonParser";
import JournalProfileCard from "../journal/JournalProfileCard";
import { blueprintFromStructure } from "../journal/journalProfile";

export interface GapProposal {
  id: string;
  gap_type: "empirical" | "theoretical" | "methodological" | "knowledge";
  description: string;
  importance_score: number;
  supporting_doi?: string;
  why_it_matters?: string;
}

export interface TitleProposal {
  id: string;
  title_text: string;
  subtitle_text?: string;
  rationale: string;
}

export default function ProtocolBlueprintMode() {
  const { project, setProject, setMode } = useResearchWorkspace();

  const answers = useMemo(() => project?.answers || {}, [project?.answers]);

  // Section 1: Research Thesis & Live Gap Finder State
  const [topic, setTopic] = useState<string>(() => answers["core_problem"] || answers["thesis_statement"] || "");
  const [preliminaryContext, setPreliminaryContext] = useState<string>(() => answers["preliminary_context"] || "");
  const [isDiscoveringGaps, setIsDiscoveringGaps] = useState<boolean>(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const [discoveredGaps, setDiscoveredGaps] = useState<GapProposal[]>(() => {
    try {
      const raw = answers["identified_gaps"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  const [selectedGapId, setSelectedGapId] = useState<string>(() => answers["selected_gap"] || "");
  const [workingTitle, setWorkingTitle] = useState<string>(() => answers["working_title"] || answers["title"] || "");
  const [isTitleLocked, setIsTitleLocked] = useState<boolean>(() => answers["title_locked"] === "true");

  const [proposedTitles, setProposedTitles] = useState<TitleProposal[]>(() => {
    try {
      const raw = answers["title_options"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  // Section 2: Target Journal Formatting & Orthography Profile State
  const [targetTotalWords, setTargetTotalWords] = useState<number>(() => {
    const raw = answers["target_word_count"];
    const parsed = raw ? parseInt(raw, 10) : 6000;
    return isNaN(parsed) || parsed <= 0 ? 6000 : parsed;
  });

  const [template, setTemplate] = useState<ManuscriptTemplate>(() => {
    const raw = answers["manuscript_template"];
    if (raw === "Theoretical" || raw === "SystematicReview") return raw;
    return "IMRaD";
  });

  const [citationStyle, setCitationStyle] = useState<string>(() => answers["citation_style"] || "APA 7");
  const [orthography, setOrthography] = useState<string>(() => answers["orthography"] || "British / Oxford English (-ise/-our/-re)");

  // Section 3: Word Budget Blueprint State
  const [blueprint, setBlueprint] = useState<WordBudgetBlueprint | null>(() => {
    try {
      const raw = answers["word_budget_blueprint"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sections)) return parsed;
      }
    } catch {}
    return null;
  });

  const [isAllocatingBudget, setIsAllocatingBudget] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Sync state if project changes remotely
  useEffect(() => {
    if (answers["core_problem"] && !topic) setTopic(answers["core_problem"]);
    if (answers["working_title"] && !workingTitle) setWorkingTitle(answers["working_title"]);
    if (answers["title_locked"] === "true" && !isTitleLocked) setIsTitleLocked(true);
  }, [answers, topic, workingTitle, isTitleLocked]);

  // Auto-allocate word budget if not present
  useEffect(() => {
    if (!blueprint && project?.projectId && !isAllocatingBudget) {
      handleAllocateBudget(targetTotalWords, template);
    }
  }, [blueprint, project?.projectId]);

  // Discover Literature Gaps via Client AI
  const handleDiscoverGaps = async () => {
    if (!topic.trim()) {
      setDiscoveryError("Please describe your research topic or question before discovering gaps.");
      return;
    }

    setIsDiscoveringGaps(true);
    setDiscoveryError(null);

    const systemPrompt = `You are a world-class academic research gap discovery agent.
Based on the researcher's topic and context, identify 4 concrete, actionable research gaps in the peer-reviewed scholarly literature.
Each gap must be grounded, empirical, theoretical, or methodological, with real academic significance and DOI references.
Also propose 3 compelling, publishable academic titles that address the primary gap.

Return strictly valid JSON in this exact shape:
{
  "gaps": [
    {
      "id": "gap_1",
      "gap_type": "empirical",
      "description": "...",
      "importance_score": 92,
      "supporting_doi": "10.1038/s41586-023-00000-0",
      "why_it_matters": "..."
    }
  ],
  "titles": [
    {
      "id": "t1",
      "title_text": "...",
      "subtitle_text": "...",
      "rationale": "..."
    }
  ]
}`;

    const userPrompt = `Research Topic / Question: ${topic}
Preliminary Context: ${preliminaryContext || "General peer-reviewed scholarly context"}`;

    try {
      const responseText = await executeAgenticLLM(
        systemPrompt,
        userPrompt,
        "reasoning"
      );

      const parsed = parseAndRepairLLMJson<{ gaps?: GapProposal[]; titles?: TitleProposal[] }>(responseText, {});
      const gaps: GapProposal[] = Array.isArray(parsed.gaps) ? parsed.gaps : [];
      const titles: TitleProposal[] = Array.isArray(parsed.titles) ? parsed.titles : [];

      setDiscoveredGaps(gaps);
      setProposedTitles(titles);

      if (gaps.length > 0 && !selectedGapId) {
        setSelectedGapId(gaps[0].id);
      }
      if (titles.length > 0 && !workingTitle) {
        setWorkingTitle(titles[0].title_text + (titles[0].subtitle_text ? `: ${titles[0].subtitle_text}` : ""));
      }

      if (project?.projectId) {
        const nextAnswers: Record<string, string> = {
          ...answers,
          core_problem: normalizeUnicodeNFC(topic),
          preliminary_context: normalizeUnicodeNFC(preliminaryContext),
          identified_gaps: JSON.stringify(gaps),
          title_options: JSON.stringify(titles),
          selected_gap: gaps.length > 0 ? gaps[0].id : "",
        };
        const updated = await saveIntakeAnswers(project.projectId, nextAnswers);
        setProject(updated);
      }
    } catch (err: unknown) {
      console.warn("Error discovering literature gaps:", err);
      // No invented gaps, DOIs or titles: report the failure.
      setDiscoveryError(
        "Gap discovery unavailable: nothing was generated. Connect an AI provider in AI Access, or try again."
      );
    } finally {
      setIsDiscoveringGaps(false);
    }
  };

  // Lock Gap and Working Title
  const handleLockTitleAndGap = async () => {
    if (!workingTitle.trim()) {
      setDiscoveryError("Please enter or select a working article title before locking.");
      return;
    }
    if (!project?.projectId) return;

    try {
      const normalizedTitle = normalizeUnicodeNFC(workingTitle.trim());
      const nextAnswers: Record<string, string> = {
        ...answers,
        core_problem: normalizeUnicodeNFC(topic),
        working_title: normalizedTitle,
        title: normalizedTitle,
        selected_gap: selectedGapId,
        title_locked: "true",
        title_locked_at: new Date().toISOString(),
      };
      setIsTitleLocked(true);
      const updated = await saveIntakeAnswers(project.projectId, nextAnswers);
      setProject(updated);
      setSaveSuccessMessage("Working title and literature gap locked successfully.");
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: unknown) {
      console.warn("Failed to lock title and gap:", err);
    }
  };

  // Target Journal Controls Save
  const handleSaveFormattingProfile = async (
    newWords: number,
    newTemplate: ManuscriptTemplate,
    newStyle: string,
    newOrthography: string
  ) => {
    if (!project?.projectId) return;
    setTargetTotalWords(newWords);
    setTemplate(newTemplate);
    setCitationStyle(newStyle);
    setOrthography(newOrthography);

    try {
      // Only the fields this card owns; the server merges them.
      const nextAnswers: Record<string, string> = {
        target_word_count: String(newWords),
        manuscript_template: newTemplate,
        citation_style: newStyle,
        orthography: newOrthography,
      };
      // An outline taken from the target journal keeps the journal's sections;
      // a new word target only resizes them.
      const journalSections =
        blueprint?.sections.length && blueprint.sections.every((sec) => sec.id.startsWith("jp-"))
          ? blueprint.sections.map((sec) => sec.sectionName)
          : null;
      if (journalSections) {
        const resized = blueprintFromStructure(project.projectId, journalSections, newWords);
        nextAnswers.word_budget_blueprint = JSON.stringify(resized);
        setBlueprint(resized);
        setProject(await saveIntakeAnswers(project.projectId, nextAnswers));
        return;
      }
      const updated = await saveIntakeAnswers(project.projectId, nextAnswers);
      setProject(updated);
      // Reallocate word budget to reflect the new total and template
      await handleAllocateBudget(newWords, newTemplate);
    } catch (err: unknown) {
      console.warn("Failed to save formatting profile:", err);
    }
  };

  // Call Word Budget Allocator Endpoint
  const handleAllocateBudget = async (words: number, tpl: ManuscriptTemplate) => {
    if (!project?.projectId) return;
    setIsAllocatingBudget(true);
    try {
      const res = await allocateProjectWordBudget(project.projectId, words, tpl);
      if (res.ok && res.blueprint) {
        setBlueprint(res.blueprint);
        if (project) {
          setProject({
            ...project,
            answers: {
              ...project.answers,
              word_budget_blueprint: JSON.stringify(res.blueprint),
              target_word_count: String(words),
              manuscript_template: tpl,
            },
          });
        }
      }
    } catch (err: unknown) {
      console.warn("Failed to allocate budget:", err);
    } finally {
      setIsAllocatingBudget(false);
    }
  };

  // Inline adjustment of sub-section budget
  const handleUpdateSubSectionTarget = async (sectionId: string, subSectionId: string, newTarget: number) => {
    if (!blueprint || !project?.projectId) return;

    const clampedTarget = Math.max(100, Math.min(1500, newTarget));
    const updatedSections: SectionBudget[] = blueprint.sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      const updatedSub: SubSectionBudget[] = sec.subSections.map((sub) => {
        if (sub.id === subSectionId) {
          return { ...sub, targetWords: clampedTarget };
        }
        return sub;
      });
      const secTotal = updatedSub.reduce((acc, s) => acc + s.targetWords, 0);
      return { ...sec, subSections: updatedSub, targetWords: secTotal };
    });

    const allocatedTotal = updatedSections.reduce((acc, s) => acc + s.targetWords, 0);
    const updatedBlueprint: WordBudgetBlueprint = {
      ...blueprint,
      sections: updatedSections,
      allocatedTotalWords: allocatedTotal,
      updatedAt: new Date().toISOString(),
    };

    setBlueprint(updatedBlueprint);
    try {
      const nextAnswers: Record<string, string> = {
        ...answers,
        word_budget_blueprint: JSON.stringify(updatedBlueprint),
      };
      const updated = await saveIntakeAnswers(project.projectId, nextAnswers);
      setProject(updated);
    } catch (err: unknown) {
      console.warn("Failed to save updated sub-section word budget:", err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[color:var(--surface-canvas)] overflow-y-auto">
      {/* Top Banner / Mode Header */}
      <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-6 py-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[color:var(--accent)] text-[color:var(--text-inverse)]">
                Mode 1
              </span>
              <span className="text-xs font-semibold text-[color:var(--text-muted)]">
                Protocol, Literature Gap & Word Budget Blueprint
              </span>
            </div>
            <h1 className="text-xl font-bold text-[color:var(--text-primary)]">
              Protocol & Blueprint
            </h1>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Lock your research thesis, discover empirical gaps with supporting DOIs, set journal orthography, and partition sub-section word budgets.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {saveSuccessMessage && (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30 animate-fade-in">
                ✓ {saveSuccessMessage}
              </span>
            )}
            <button
              type="button"
              onClick={() => setMode("evidence")}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <span>Proceed to Mode 2: Evidence Matrix</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-6 max-w-6xl mx-auto w-full space-y-8">
        {/* The target journal comes first: its rules shape the outline and the checks */}
        {project && <JournalProfileCard project={project} onApplied={setProject} />}

        {/* CARD A: Research Thesis & Live Gap Finder */}
        <section aria-labelledby="thesis-gap-heading" className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-4">
            <div>
              <h2 id="thesis-gap-heading" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                A. Research Thesis & Live Literature Gap Finder
              </h2>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Define the core research question and use client-owned AI to synthesize 3–5 real gaps with supporting DOIs.
              </p>
            </div>
            {isTitleLocked && (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Title & Gap Locked
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="research-topic-input" className="text-xs font-bold text-[color:var(--text-primary)]">
                Research Topic or Primary Question <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="research-topic-input"
                rows={3}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Real-time syndrome decoding latency in scalable quantum error correction architectures..."
                className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl p-3 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] outline-none resize-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="preliminary-context-input" className="text-xs font-bold text-[color:var(--text-primary)]">
                Preliminary Context & Theoretical Constraints <span className="text-[color:var(--text-muted)] font-normal">(Optional)</span>
              </label>
              <textarea
                id="preliminary-context-input"
                rows={3}
                value={preliminaryContext}
                onChange={(e) => setPreliminaryContext(e.target.value)}
                placeholder="e.g. Focus on FPGA hardware architectures, sub-100ns latency thresholds, surface code lattices..."
                className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl p-3 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] outline-none resize-none transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={isDiscoveringGaps || !topic.trim()}
              onClick={handleDiscoverGaps}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDiscoveringGaps ? (
                <>
                  <div className="spinner w-3.5 h-3.5" />
                  <span>Discovering Literature Gaps via Client AI…</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Discover Literature Gaps</span>
                </>
              )}
            </button>

            {discoveryError && (
              <span className="text-xs text-rose-500 font-semibold">{discoveryError}</span>
            )}
          </div>

          {/* Gaps List & Selection */}
          {discoveredGaps.length > 0 && (
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                Select Anchor Gap to Address
              </span>
              <div className="grid grid-cols-1 gap-3">
                {discoveredGaps.map((gap) => {
                  const isSelected = selectedGapId === gap.id;
                  return (
                    <div
                      key={gap.id}
                      onClick={() => setSelectedGapId(gap.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedGapId(gap.id);
                        }
                      }}
                      className={`p-4 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? "border-[color:var(--accent)] bg-[color:var(--accent)]/5 ring-1 ring-[color:var(--accent)]"
                          : "border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] hover:border-[color:var(--border-control)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--text-inverse)]"
                                : "border-[color:var(--border-control)]"
                            }`}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                            {gap.gap_type}
                          </span>
                          <span className="text-[10px] text-[color:var(--text-muted)] font-mono">
                            Significance: {gap.importance_score}%
                          </span>
                        </div>
                        {gap.supporting_doi && (
                          <span className="text-[10px] font-mono text-[color:var(--text-secondary)] bg-[color:var(--surface-raised)] px-2 py-0.5 rounded border border-[color:var(--border-subtle)]">
                            DOI: {gap.supporting_doi}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[color:var(--text-primary)] font-medium pl-5.5">
                        {gap.description}
                      </p>
                      {gap.why_it_matters && (
                        <p className="text-[11px] text-[color:var(--text-secondary)] pl-5.5 mt-1 italic">
                          Why it matters: {gap.why_it_matters}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Working Title Input & Lock Action */}
          <div className="pt-2 border-t border-[color:var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="working-title-input" className="text-xs font-bold text-[color:var(--text-primary)]">
                Working Article Title <span className="text-rose-500">*</span>
              </label>
              {proposedTitles.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-[color:var(--text-muted)]">Suggestions:</span>
                  {proposedTitles.map((t, idx) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setWorkingTitle(t.title_text + (t.subtitle_text ? `: ${t.subtitle_text}` : ""))}
                      className="px-2 py-0.5 rounded text-[10px] bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] cursor-pointer truncate max-w-[140px]"
                      title={t.title_text}
                    >
                      Option {idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                id="working-title-input"
                type="text"
                value={workingTitle}
                onChange={(e) => setWorkingTitle(e.target.value)}
                placeholder="e.g. Scalable FPGA Decoders for Real-Time Surface Code Quantum Error Correction"
                className="flex-1 min-w-0 basis-56 bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-4 py-2 text-xs font-semibold text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] outline-none transition-colors"
              />
              <button
                type="button"
                onClick={handleLockTitleAndGap}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  isTitleLocked
                    ? "bg-emerald-600 text-[color:var(--text-inverse)] hover:bg-emerald-700"
                    : "bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)]"
                }`}
              >
                {isTitleLocked ? "✓ Re-Lock Title & Gap" : "Lock Working Title & Gap"}
              </button>
            </div>
          </div>
        </section>

        {/* CARD B: Target Journal Formatting & Orthography Profile */}
        <section aria-labelledby="formatting-profile-heading" className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-6">
          <div className="border-b border-[color:var(--border-subtle)] pb-4">
            <h2 id="formatting-profile-heading" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              B. Target Journal Formatting & Orthography Profile
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Specify submission word count ceilings, manuscript structure template, citation standard, and dialect.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Target Words */}
            <div className="space-y-1.5">
              <label htmlFor="target-words-select" className="text-xs font-bold text-[color:var(--text-primary)]">
                Target Word Ceiling
              </label>
              <input
                id="target-words-select"
                type="number"
                min={500}
                step={100}
                key={targetTotalWords}
                defaultValue={targetTotalWords}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (Number.isFinite(val) && val >= 500 && val !== targetTotalWords) {
                    handleSaveFormattingProfile(val, template, citationStyle, orthography);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs font-semibold text-[color:var(--text-primary)] outline-none tabular-nums"
              />
            </div>

            {/* Template */}
            <div className="space-y-1.5">
              <label htmlFor="template-select" className="text-xs font-bold text-[color:var(--text-primary)]">
                Manuscript Template
              </label>
              <select
                id="template-select"
                value={template}
                onChange={(e) => {
                  const val = e.target.value as ManuscriptTemplate;
                  handleSaveFormattingProfile(targetTotalWords, val, citationStyle, orthography);
                }}
                className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs font-semibold text-[color:var(--text-primary)] outline-none cursor-pointer"
              >
                <option value="IMRaD">IMRaD (Intro, Method, Results, Discussion)</option>
                <option value="Theoretical">Theoretical (Foundations, Model, Implications)</option>
                <option value="SystematicReview">Systematic Review (PRISMA, Synthesis)</option>
              </select>
            </div>

            {/* Citation Style */}
            <div className="space-y-1.5">
              <label htmlFor="citation-style-select" className="text-xs font-bold text-[color:var(--text-primary)]">
                Citation Standard
              </label>
              <select
                id="citation-style-select"
                value={citationStyle}
                onChange={(e) => {
                  handleSaveFormattingProfile(targetTotalWords, template, e.target.value, orthography);
                }}
                className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs font-semibold text-[color:var(--text-primary)] outline-none cursor-pointer"
              >
                <option value="APA 7">APA 7th Edition (Author, Year)</option>
                <option value="IEEE">IEEE (Numeric bracketed [1])</option>
                <option value="Harvard">Harvard (Author-Date)</option>
                <option value="Chicago Author-Date">Chicago (Author-Date)</option>
                <option value="Chicago Notes">Chicago (Notes & Bibliography)</option>
                <option value="MLA 9">MLA 9th Edition</option>
                <option value="Vancouver">Vancouver (Numeric superscript)</option>
              </select>
            </div>

            {/* Orthography */}
            <div className="space-y-1.5">
              <label htmlFor="orthography-select" className="text-xs font-bold text-[color:var(--text-primary)]">
                Orthography & Spelling
              </label>
              <select
                id="orthography-select"
                value={orthography}
                onChange={(e) => {
                  handleSaveFormattingProfile(targetTotalWords, template, citationStyle, e.target.value);
                }}
                className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs font-semibold text-[color:var(--text-primary)] outline-none cursor-pointer"
              >
                <option value="British / Oxford English (-ise/-our/-re)">
                  British / Oxford English (-ise/-our/-re) [Default]
                </option>
                <option value="US English">US English (-ize/-or/-er)</option>
              </select>
            </div>
          </div>
        </section>

        {/* CARD C: Interactive Sub-Section Word Budget Table */}
        <section aria-labelledby="word-budget-heading" className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-4">
            <div>
              <h2 id="word-budget-heading" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                C. Sub-Section Word Budget Blueprint (350–500 Word Slices)
              </h2>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Every section is partitioned into 350–500 word micro-sections to guarantee zero LLM token truncation and deterministic citation grounding.
              </p>
            </div>

            <button
              type="button"
              disabled={isAllocatingBudget}
              onClick={() => handleAllocateBudget(targetTotalWords, template)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <svg className={`w-3.5 h-3.5 text-[color:var(--accent)] ${isAllocatingBudget ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Rebalance Budget</span>
            </button>
          </div>

          {blueprint ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-mono px-1 text-[color:var(--text-secondary)]">
                <span>
                  Total Target: <strong className="text-[color:var(--text-primary)]">{blueprint.targetTotalWords.toLocaleString()} words</strong>
                </span>
                <span>
                  Allocated: <strong className="text-[color:var(--text-primary)]">{blueprint.allocatedTotalWords.toLocaleString()} words</strong> ({blueprint.totalSubSections} Sub-Sections)
                </span>
              </div>

              <div className="border border-[color:var(--border-subtle)] rounded-xl overflow-hidden divide-y divide-[color:var(--border-subtle)]">
                {blueprint.sections.map((sec) => (
                  <div key={sec.id} className="bg-[color:var(--surface-canvas)]">
                    {/* Major Section Header */}
                    <div className="bg-[color:var(--surface-sunken)] px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[color:var(--text-primary)]">
                          {sec.order}. {sec.sectionName}
                        </span>
                        <span className="text-[10px] font-semibold text-[color:var(--text-muted)] bg-[color:var(--surface-raised)] px-2 py-0.5 rounded border border-[color:var(--border-subtle)]">
                          {sec.subSections.length} slices
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-[color:var(--accent)]">
                        {sec.targetWords} words
                      </span>
                    </div>

                    {/* Sub-Section Table Rows */}
                    <div className="divide-y divide-[color:var(--border-subtle)]/60">
                      {sec.subSections.map((sub, sIdx) => (
                        <div
                          key={sub.id}
                          className="px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[color:var(--surface-hover)]/40 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-[color:var(--text-muted)] w-8 shrink-0">
                              § {sec.order}.{sIdx + 1}
                            </span>
                            <span className="text-xs text-[color:var(--text-primary)] font-medium truncate">
                              {sub.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            <label htmlFor={`target-words-${sub.id}`} className="text-[10px] text-[color:var(--text-muted)] uppercase tracking-wider font-semibold">
                              Target:
                            </label>
                            <input
                              id={`target-words-${sub.id}`}
                              aria-label={`Target words for ${sub.title}`}
                              type="number"
                              min={100}
                              max={1000}
                              step={25}
                              value={sub.targetWords}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  handleUpdateSubSectionTarget(sec.id, sub.id, val);
                                }
                              }}
                              className="w-18 bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-lg px-2 py-1 text-xs font-mono text-right text-[color:var(--text-primary)] outline-none"
                            />
                            <span className="text-[10px] text-[color:var(--text-muted)] font-mono">words</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-[color:var(--surface-sunken)] rounded-xl border border-[color:var(--border-subtle)]">
              <div className="spinner w-6 h-6 mx-auto mb-2" />
              <p className="text-xs text-[color:var(--text-secondary)] font-medium">
                Generating sub-section word budget partition…
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
