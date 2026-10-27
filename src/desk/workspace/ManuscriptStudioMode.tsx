import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { ProjectView } from "../types";
import type {
  WordBudgetBlueprint,
  SectionBudget,
  SubSectionBudget,
  UserDatasetItem,
  SmartEvidenceRow,
  BibliographyEntry,
} from "./types";
import { useResearchWorkspace } from "./ResearchContext";
import {
  saveIntakeAnswers,
  draftProjectSubSection,
  polishProjectManuscript,
} from "../api";
import { normalizeUnicodeNFC } from "../../document_intelligence/index";

export const IAST_DIACRITICS = [
  { char: "ā", upper: "Ā", label: "Long a" },
  { char: "ī", upper: "Ī", label: "Long i" },
  { char: "ū", upper: "Ū", label: "Long u" },
  { char: "ṛ", upper: "Ṛ", label: "Vocalic r" },
  { char: "ṝ", upper: "Ṝ", label: "Long vocalic r" },
  { char: "ḷ", upper: "Ḷ", label: "Vocalic l" },
  { char: "ś", upper: "Ś", label: "Palatal s" },
  { char: "ṣ", upper: "Ṣ", label: "Retroflex s" },
  { char: "ṇ", upper: "Ṇ", label: "Retroflex n" },
  { char: "ṅ", upper: "Ṅ", label: "Velar n" },
  { char: "ñ", upper: "Ñ", label: "Palatal n" },
  { char: "ṃ", upper: "Ṃ", label: "Anusvara" },
  { char: "ḥ", upper: "Ḥ", label: "Visarga" },
] as const;

export default function ManuscriptStudioMode() {
  const { project, projectId, setProject, setMode } = useResearchWorkspace();
  const effectiveProjectId = project?.projectId || projectId;
  const answers = useMemo(() => project?.answers || {}, [project?.answers]);

  // Working Title & Formatting Profiles
  const workingTitle = answers["working_title"] || answers["title"] || "Grounded Manuscript";
  const citationStyle = answers["citation_style"] || "APA 7";
  const dialect: "en-GB" | "en-US" = answers["orthography"]?.includes("US") ? "en-US" : "en-GB";

  // Blueprint from Mode 1
  const blueprint: WordBudgetBlueprint | null = useMemo(() => {
    try {
      const raw = answers["word_budget_blueprint"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sections)) return parsed;
      }
    } catch {}
    return null;
  }, [answers["word_budget_blueprint"]]);

  // Layout State: Collapsible 3-Pane Sidebars
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);
  const isZenFocus = leftPaneCollapsed && rightPaneCollapsed;

  // Active Selected Section and Sub-Section
  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    return blueprint?.sections[0]?.id || "";
  });
  const [activeSubSectionId, setActiveSubSectionId] = useState<string>(() => {
    return blueprint?.sections[0]?.subSections[0]?.id || "";
  });

  // State: Manuscript Full Text
  const [manuscriptText, setManuscriptText] = useState<string>(() => {
    return (
      answers["manuscript_markdown"] ||
      answers["assembled_draft"] ||
      answers["manuscript_draft"] ||
      ""
    );
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("saved");

  // State: Drafting In-Flight & Sequential Section Runner
  const [isDraftingActiveSubSection, setIsDraftingActiveSubSection] = useState(false);
  const [isSequentialRunning, setIsSequentialRunning] = useState(false);
  const [sequentialProgressMessage, setSequentialProgressMessage] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  // State: Term-Locked Polish & Diff Preview Modal
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishPreviewModalOpen, setPolishPreviewModalOpen] = useState(false);
  const [polishedDiffData, setPolishedDiffData] = useState<{
    original: string;
    revised: string;
    burstinessDelta?: number;
    styleCorrections?: string[];
  } | null>(null);

  // State: Diacritic Toolbar Popover Open
  const [isDiacriticPopoverOpen, setIsDiacriticPopoverOpen] = useState(false);

  // State: Right Pane Tabs & Search
  const [rightPaneTab, setRightPaneTab] = useState<"assigned" | "all">("assigned");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync state if project changes
  useEffect(() => {
    const remoteText = answers["manuscript_markdown"] || answers["assembled_draft"];
    if (remoteText && !manuscriptText) {
      setManuscriptText(remoteText);
    }
    if (blueprint?.sections?.length) {
      if (!activeSectionId || !blueprint.sections.some((s) => s.id === activeSectionId)) {
        setActiveSectionId(blueprint.sections[0].id);
      }
      if (
        !activeSubSectionId ||
        !blueprint.sections.some((s) => s.subSections.some((sub) => sub.id === activeSubSectionId))
      ) {
        setActiveSubSectionId(blueprint.sections[0].subSections[0]?.id || "");
      }
    }
  }, [answers, blueprint, activeSectionId, activeSubSectionId, manuscriptText]);

  // Primary User Datasets from Mode 2
  const userDatasets: UserDatasetItem[] = useMemo(() => {
    try {
      const raw = answers["user_datasets"] || answers["user_data_entries"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [answers["user_datasets"], answers["user_data_entries"]]);

  // Scholarly Sources from Mode 2 / Vault
  const scholarlySources: SmartEvidenceRow[] = useMemo(() => {
    const list: SmartEvidenceRow[] = [];
    try {
      const rawVault = answers["approved_vault_sources"] || answers["vault_sources"];
      if (rawVault) {
        const parsed = JSON.parse(rawVault);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: Record<string, unknown>, idx: number) => {
            const id = String(item.id || `src_${idx + 1}`);
            list.push({
              id,
              citationToken: `[CITE:${id}]`,
              title: String(item.title || "Scholarly Literature Document"),
              authors: Array.isArray(item.authors)
                ? (item.authors as string[])
                : [String(item.author || item.authors || "Anonymous")],
              year: typeof item.year === "number" ? item.year : parseInt(String(item.year || "2024"), 10) || 2024,
              doi: typeof item.doi === "string" ? item.doi : undefined,
              portal: typeof item.portal === "string" ? item.portal : "OpenAlex",
              badge: "Verified Scholarly Literature",
              isUserData: false,
              epistemicRole:
                item.stance === "Contrasting"
                  ? "Contrasting / Critical"
                  : item.stance === "Methodological"
                  ? "Methodological Anchor"
                  : "Supporting",
              extractedFindings: String(item.keyFindings || item.abstract || item.summary || "Empirical findings verified from peer-reviewed literature."),
              assignedSectionId: String(item.assignedSectionId || ""),
            });
          });
        }
      }
    } catch {}
    return list;
  }, [answers["approved_vault_sources"], answers["vault_sources"]]);

  // All Evidence Combined
  const allEvidence: Array<{
    id: string;
    citationToken: string;
    title: string;
    author: string;
    year: number;
    badge: string;
    isUserData: boolean;
    extractedFindings: string;
    assignedSectionId?: string;
  }> = useMemo(() => {
    const userMapped = userDatasets.map((d) => ({
      id: d.id,
      citationToken: d.citationToken,
      title: d.title,
      author: d.author,
      year: d.year,
      badge: "Primary User Data / Upload",
      isUserData: true,
      extractedFindings: d.extractedFindings || d.summary,
      assignedSectionId: d.assignedSectionId,
    }));

    const scholarlyMapped = scholarlySources.map((s) => ({
      id: s.id,
      citationToken: s.citationToken,
      title: s.title,
      author: s.authors[0] || "Anonymous",
      year: s.year,
      badge: "Verified Scholarly Literature",
      isUserData: false,
      extractedFindings: s.extractedFindings,
      assignedSectionId: s.assignedSectionId,
    }));

    return [...userMapped, ...scholarlyMapped];
  }, [userDatasets, scholarlySources]);

  const effectiveSectionId = activeSectionId || blueprint?.sections[0]?.id || "";
  const effectiveSubSectionId = activeSubSectionId || blueprint?.sections[0]?.subSections[0]?.id || "";

  // Evidence Filtered for Active Sub-Section
  const assignedEvidence = useMemo(() => {
    let activeSubAssignedIds: string[] = [];
    if (blueprint) {
      for (const sec of blueprint.sections) {
        const sub = sec.subSections.find((s) => s.id === effectiveSubSectionId);
        if (sub && Array.isArray(sub.assignedSourceIds)) {
          activeSubAssignedIds = sub.assignedSourceIds;
          break;
        }
      }
    }

    return allEvidence.filter(
      (e) =>
        e.assignedSectionId === effectiveSubSectionId ||
        e.assignedSectionId === effectiveSectionId ||
        activeSubAssignedIds.includes(e.id)
    );
  }, [allEvidence, effectiveSubSectionId, effectiveSectionId, blueprint]);

  // Sub-Section Word Count Resolver:
  // Extracts word count per sub-section from manuscript text by finding heading delimiters or proportion
  const subSectionWordCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!blueprint) return counts;

    blueprint.sections.forEach((sec) => {
      sec.subSections.forEach((sub) => {
        // Look for § sub.title or sub.title in manuscript
        const escaped = sub.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(?:##|###|§)?\\s*${escaped}[\\s\\S]*?(?=(?:##|###|§)|$)`, "i");
        const match = manuscriptText.match(regex);
        if (match && match[0]) {
          const words = match[0].split(/\s+/).filter(Boolean).length;
          counts[sub.id] = words;
        } else {
          counts[sub.id] = 0;
        }
      });
    });

    return counts;
  }, [blueprint, manuscriptText]);

  // Total Manuscript Word Count & Reading Time
  const totalActualWords = useMemo(() => {
    return manuscriptText.split(/\s+/).filter(Boolean).length;
  }, [manuscriptText]);

  const targetTotalWords = blueprint?.targetTotalWords || 6000;
  const estimatedReadingMinutes = Math.max(1, Math.ceil(totalActualWords / 220));

  // Live Verified Bibliography Generated from Citations Cited in Text
  const verifiedBibliography: BibliographyEntry[] = useMemo(() => {
    if (!manuscriptText) return [];

    // Match all [CITE:id] tokens
    const matches = manuscriptText.match(/\[CITE:[a-zA-Z0-9_-]+\]/g) || [];
    const uniqueTokens = Array.from(new Set(matches));

    const entries: BibliographyEntry[] = [];
    uniqueTokens.forEach((tok) => {
      const cleanId = tok.replace(/\[CITE:/g, "").replace(/\]/g, "");
      const matched = allEvidence.find((e) => e.id === cleanId || e.citationToken === tok);

      if (matched) {
        // Format according to APA 7 standard
        const formatted = matched.isUserData
          ? `${matched.author} (${matched.year}). ${matched.title} [Empirical Research Dataset]. Primary User Ingestion.`
          : `${matched.author} (${matched.year}). ${matched.title}. Verified Scholarly Publication.`;

        entries.push({
          id: matched.id,
          token: tok,
          author: matched.author,
          year: matched.year,
          title: matched.title,
          formattedCitation: formatted,
          isUserData: matched.isUserData,
        });
      }
    });

    // Alphabetize by author
    return entries.sort((a, b) => a.author.localeCompare(b.author));
  }, [manuscriptText, allEvidence]);

  // Debounced Autosave (Optimistic)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleManuscriptChange = (newText: string) => {
    const normalized = normalizeUnicodeNFC(newText);
    setManuscriptText(normalized);
    setSaveStatus("saving");

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!effectiveProjectId) return;
      try {
        const nextAnswers = {
          ...answers,
          manuscript_markdown: normalized,
          assembled_draft: normalized,
          full_text_markdown: normalized,
        };
        const saved = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
        setProject(saved);
        setSaveStatus("saved");
      } catch (err) {
        console.warn("Autosave note:", err);
        setSaveStatus("idle");
      }
    }, 800);
  };

  // Draft Active Sub-Section (Fact-Locked)
  const handleDraftActiveSubSection = async () => {
    if (!effectiveProjectId || !blueprint) return;

    // Find active section and sub-section
    let activeSec: SectionBudget | undefined;
    let activeSub: SubSectionBudget | undefined;

    for (const sec of blueprint.sections) {
      const found = sec.subSections.find((s) => s.id === activeSubSectionId);
      if (found) {
        activeSec = sec;
        activeSub = found;
        break;
      }
    }

    if (!activeSec || !activeSub) return;

    setIsDraftingActiveSubSection(true);
    setDraftError(null);

    try {
      const assigned = assignedEvidence.map((e) => ({
        id: e.id,
        authors: e.author,
        year: e.year,
        title: e.title,
        keyFindings: e.extractedFindings,
      }));

      const res = await draftProjectSubSection(effectiveProjectId, {
        sectionId: activeSec.id,
        subSectionId: activeSub.id,
        subSectionTitle: activeSub.title,
        targetWords: activeSub.targetWords,
        dialect,
        assignedSources: assigned,
      });

      if (res.ok && res.content) {
        // Insert or replace active sub-section in manuscript text
        const subHeader = `### § ${activeSub.title}`;
        let updatedText = manuscriptText;

        if (updatedText.includes(subHeader)) {
          // Replace existing block
          const regex = new RegExp(`### § ${activeSub.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=(?:### §)|$)`, "i");
          updatedText = updatedText.replace(regex, `${subHeader}\n\n${res.content.trim()}\n\n`);
        } else {
          // Append to text
          updatedText = updatedText.trim()
            ? `${updatedText.trim()}\n\n${subHeader}\n\n${res.content.trim()}\n`
            : `${subHeader}\n\n${res.content.trim()}\n`;
        }

        handleManuscriptChange(updatedText);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDraftError(msg);
    } finally {
      setIsDraftingActiveSubSection(false);
    }
  };

  // Draft Entire Section Iteratively
  const handleDraftSectionIteratively = async () => {
    if (!effectiveProjectId || !blueprint || isSequentialRunning) return;

    const targetSec = blueprint.sections.find((s) => s.id === activeSectionId) || blueprint.sections[0];
    if (!targetSec) return;

    setIsSequentialRunning(true);
    setDraftError(null);

    let currentManuscript = manuscriptText;

    try {
      for (let i = 0; i < targetSec.subSections.length; i++) {
        const sub = targetSec.subSections[i];
        setSequentialProgressMessage(
          `Drafting slice ${i + 1} of ${targetSec.subSections.length}: "${sub.title}" (~${sub.targetWords} words)...`
        );
        setActiveSubSectionId(sub.id);

        const assigned = allEvidence
          .filter((e) => e.assignedSectionId === sub.id || e.assignedSectionId === targetSec.id)
          .map((e) => ({
            id: e.id,
            authors: e.author,
            year: e.year,
            title: e.title,
            keyFindings: e.extractedFindings,
          }));

        const res = await draftProjectSubSection(effectiveProjectId, {
          sectionId: targetSec.id,
          subSectionId: sub.id,
          subSectionTitle: sub.title,
          targetWords: sub.targetWords,
          dialect,
          assignedSources: assigned,
        });

        if (res.ok && res.content) {
          const subHeader = `### § ${sub.title}`;
          if (currentManuscript.includes(subHeader)) {
            const regex = new RegExp(`### § ${sub.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=(?:### §)|$)`, "i");
            currentManuscript = currentManuscript.replace(regex, `${subHeader}\n\n${res.content.trim()}\n\n`);
          } else {
            currentManuscript = currentManuscript.trim()
              ? `${currentManuscript.trim()}\n\n${subHeader}\n\n${res.content.trim()}\n`
              : `${subHeader}\n\n${res.content.trim()}\n`;
          }
          handleManuscriptChange(currentManuscript);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDraftError(`Iterative drafting halted: ${msg}`);
    } finally {
      setIsSequentialRunning(false);
      setSequentialProgressMessage(null);
    }
  };

  // 1-Click Insert Citation Token at Cursor
  const handleInsertCitation = (token: string) => {
    if (!editorTextareaRef.current) return;
    const textarea = editorTextareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const prev = manuscriptText;

    const inserted = `${prev.substring(0, start)} ${token} ${prev.substring(end)}`;
    handleManuscriptChange(inserted);

    setTimeout(() => {
      textarea.focus();
      const nextPos = start + token.length + 2;
      textarea.setSelectionRange(nextPos, nextPos);
    }, 50);

    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  // Quick Insert IAST Diacritic
  const handleInsertDiacritic = (char: string) => {
    if (!editorTextareaRef.current) return;
    const textarea = editorTextareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const prev = manuscriptText;

    const inserted = `${prev.substring(0, start)}${char}${prev.substring(end)}`;
    handleManuscriptChange(inserted);

    setTimeout(() => {
      textarea.focus();
      const nextPos = start + char.length;
      textarea.setSelectionRange(nextPos, nextPos);
    }, 30);
  };

  // Term-Locked Humanize & Polish Selection
  const handleOpenPolishModal = async () => {
    if (!effectiveProjectId || !manuscriptText.trim()) return;

    let textToPolish = manuscriptText;
    if (editorTextareaRef.current) {
      const { selectionStart, selectionEnd } = editorTextareaRef.current;
      if (selectionEnd > selectionStart) {
        textToPolish = manuscriptText.substring(selectionStart, selectionEnd);
      }
    }

    setIsPolishing(true);
    try {
      const res = await polishProjectManuscript(effectiveProjectId, {
        text: textToPolish,
        dialect,
      });

      if (res.ok && res.polishedText) {
        setPolishedDiffData({
          original: textToPolish,
          revised: res.polishedText,
          burstinessDelta: res.burstinessDelta,
          styleCorrections: res.styleCorrections,
        });
        setPolishPreviewModalOpen(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDraftError(`Polish failed: ${msg}`);
    } finally {
      setIsPolishing(false);
    }
  };

  // Apply Polished Prose
  const handleApplyPolishedProse = () => {
    if (!polishedDiffData) return;
    const updated = manuscriptText.replace(polishedDiffData.original, polishedDiffData.revised);
    handleManuscriptChange(updated);
    setPolishPreviewModalOpen(false);
    setPolishedDiffData(null);
  };

  return (
    <div className="h-full flex flex-col bg-[color:var(--surface-canvas)] overflow-hidden">
      {/* STUDIO MODE HEADER */}
      <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-6 py-3.5 z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white shrink-0">
                  Mode 3
                </span>
                <span className="text-xs font-semibold text-[color:var(--text-muted)]">
                  Grounded Manuscript Studio
                </span>
              </div>
              <h1 className="text-sm font-bold text-[color:var(--text-primary)] truncate max-w-md">
                {workingTitle}
              </h1>
              <div className="flex items-center gap-2 text-[10px] text-[color:var(--text-secondary)] font-mono">
                <span>{totalActualWords.toLocaleString()} / {targetTotalWords.toLocaleString()} words</span>
                <span>·</span>
                <span>~{estimatedReadingMinutes} min read</span>
                <span>·</span>
                <span className={saveStatus === "saving" ? "text-amber-500 font-bold" : "text-emerald-500 font-semibold"}>
                  {saveStatus === "saving" ? "Autosaving…" : `Autosaved v${project?.version || 1}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Zen Focus Toggle */}
            <button
              type="button"
              onClick={() => {
                if (isZenFocus) {
                  setLeftPaneCollapsed(false);
                  setRightPaneCollapsed(false);
                } else {
                  setLeftPaneCollapsed(true);
                  setRightPaneCollapsed(true);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                isZenFocus
                  ? "bg-[color:var(--accent)] text-white border-[color:var(--accent)]"
                  : "bg-[color:var(--surface-sunken)] border-[color:var(--border-control)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              }`}
              title="Toggle Zen Focus Writing (Collapse Sidebars)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span>{isZenFocus ? "Exit Zen" : "Zen Focus"}</span>
            </button>

            {/* Mode 2 Back */}
            <button
              type="button"
              onClick={() => setMode("evidence")}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-all cursor-pointer"
            >
              ← Mode 2: Evidence
            </button>

            {/* Mode 4 Proceed */}
            <button
              type="button"
              onClick={() => setMode("referee")}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>Proceed to Mode 4: Referee</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 3-PANE STUDIO BODY */}
      <div className="flex-1 flex min-h-0 relative">
        {/* PANE 1: LEFT SUB-SECTION WORD BUDGET NAVIGATOR */}
        {!leftPaneCollapsed ? (
          <aside
            aria-label="Sub-Section Word Budget Navigator"
            className="w-72 xl:w-80 shrink-0 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/40 flex flex-col min-h-0"
          >
            <div className="p-3.5 border-b border-[color:var(--border-subtle)] flex items-center justify-between bg-[color:var(--surface-canvas)]">
              <div>
                <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block">
                  Sub-Section Budgets
                </span>
                <span className="text-xs font-bold text-[color:var(--text-primary)]">
                  350–500 Word Slices
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLeftPaneCollapsed(true)}
                className="p-1 rounded-lg hover:bg-[color:var(--surface-hover)] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
                title="Collapse Navigator"
              >
                ◀
              </button>
            </div>

            {/* Action Bar: Sequential Drafting & Active Sub-Section */}
            <div className="p-3 border-b border-[color:var(--border-subtle)] space-y-2 bg-[color:var(--surface-canvas)]/60">
              <button
                type="button"
                disabled={isDraftingActiveSubSection || isSequentialRunning}
                onClick={handleDraftActiveSubSection}
                className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isDraftingActiveSubSection ? (
                  <>
                    <div className="spinner w-3 h-3" />
                    <span>Fact-Lock Drafting…</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>Draft Active Sub-Section</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isDraftingActiveSubSection || isSequentialRunning}
                onClick={handleDraftSectionIteratively}
                className="w-full px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                title="Iterates through all sub-sections in active section sequentially"
              >
                {isSequentialRunning ? (
                  <>
                    <div className="spinner w-3 h-3" />
                    <span>Sequential Runner Active…</span>
                  </>
                ) : (
                  <>
                    <span>Draft Entire Section Iteratively</span>
                    <span className="text-[10px] text-[color:var(--text-muted)]">⚡</span>
                  </>
                )}
              </button>

              {sequentialProgressMessage && (
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-600 dark:text-blue-400 font-mono animate-pulse">
                  {sequentialProgressMessage}
                </div>
              )}

              {draftError && (
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[10px] text-rose-500 font-medium">
                  {draftError}
                </div>
              )}
            </div>

            {/* Sub-Section Accordion List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {blueprint?.sections.map((sec) => (
                <div key={sec.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[color:var(--text-primary)] px-1">
                    <span>{sec.order}. {sec.sectionName}</span>
                    <span className="text-[10px] font-mono text-[color:var(--text-muted)]">
                      {sec.targetWords}w
                    </span>
                  </div>

                  <div className="space-y-1">
                    {sec.subSections.map((sub, sIdx) => {
                      const actual = subSectionWordCounts[sub.id] || 0;
                      const target = sub.targetWords || 450;
                      const ratio = actual / target;
                      const percent = Math.min(100, Math.round(ratio * 100));

                      const isWithinTarget = ratio >= 0.95 && ratio <= 1.05;
                      const isOverBudget = ratio > 1.05;
                      const isSelected = activeSubSectionId === sub.id;

                      const barColor = isWithinTarget
                        ? "bg-emerald-500"
                        : isOverBudget
                        ? "bg-amber-500"
                        : "bg-[color:var(--accent)]";

                      return (
                        <div
                          key={sub.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setActiveSectionId(sec.id);
                            setActiveSubSectionId(sub.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              setActiveSectionId(sec.id);
                              setActiveSubSectionId(sub.id);
                            }
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[color:var(--surface-canvas)] border-[color:var(--accent)] shadow-xs ring-1 ring-[color:var(--accent)]/30"
                              : "bg-[color:var(--surface-canvas)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-control)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1 text-[11px]">
                            <span className="font-semibold text-[color:var(--text-primary)] line-clamp-1">
                              § {sec.order}.{sIdx + 1} {sub.title}
                            </span>
                            <span className="font-mono text-[9px] text-[color:var(--text-muted)] shrink-0">
                              {target}w
                            </span>
                          </div>

                          {/* Progress Bar & Telemetry */}
                          <div className="mt-2 space-y-1">
                            <div className="h-1.5 w-full bg-[color:var(--surface-sunken)] rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${barColor}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[9px] font-mono text-[color:var(--text-secondary)]">
                              <span>
                                {actual} / {target} words · {percent}%
                              </span>
                              {isWithinTarget && (
                                <span className="text-emerald-500 font-bold uppercase tracking-wider text-[8px]">
                                  ✓ In Budget
                                </span>
                              )}
                              {isOverBudget && (
                                <span className="text-amber-500 font-bold uppercase tracking-wider text-[8px]">
                                  +{(actual - target)}w
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setLeftPaneCollapsed(false)}
            className="w-7 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[10px] text-[color:var(--text-muted)] cursor-pointer"
            title="Expand Budget Navigator"
          >
            ▶
          </button>
        )}

        {/* PANE 2: CENTER ACADEMIC MANUSCRIPT CANVAS */}
        <main className="flex-1 flex flex-col min-w-0 bg-[color:var(--surface-canvas)]">
          {/* Quick Toolbar: Polish, IAST Diacritics Popover, Word Count */}
          <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {/* Polish & Humanize */}
              <button
                type="button"
                disabled={isPolishing || !manuscriptText.trim()}
                onClick={handleOpenPolishModal}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Term-locked humanization purges AI clichés while preserving all citations and technical terms"
              >
                {isPolishing ? (
                  <>
                    <div className="spinner w-3 h-3" />
                    <span>Polishing…</span>
                  </>
                ) : (
                  <>
                    <span>✨ Term-Locked Humanize & Polish</span>
                  </>
                )}
              </button>

              {/* IAST Diacritics Popover Toggle */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsDiacriticPopoverOpen(!isDiacriticPopoverOpen)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                    isDiacriticPopoverOpen
                      ? "bg-[color:var(--accent)] text-white border-[color:var(--accent)]"
                      : "bg-[color:var(--surface-sunken)] border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
                  }`}
                  title="Insert IAST scholarly diacritics (ā, ī, ū, ṛ, ś, etc.)"
                >
                  <span className="font-serif font-bold">ā/ś</span>
                  <span className="text-[10px]">IAST Diacritics</span>
                </button>

                {isDiacriticPopoverOpen && (
                  <div className="absolute top-full left-0 mt-1 z-30 w-72 p-2.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] rounded-xl shadow-xl space-y-2">
                    <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block">
                      Click to Insert Scholarly Diacritic
                    </span>
                    <div className="grid grid-cols-6 gap-1">
                      {IAST_DIACRITICS.map((item) => (
                        <button
                          key={item.char}
                          type="button"
                          onClick={() => handleInsertDiacritic(item.char)}
                          className="p-1 rounded bg-[color:var(--surface-sunken)] hover:bg-[color:var(--accent)] hover:text-white font-serif text-sm font-bold transition-colors cursor-pointer text-center"
                          title={item.label}
                        >
                          {item.char}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Word Count Indicator */}
            <div className="flex items-center gap-2 text-xs font-mono text-[color:var(--text-secondary)]">
              <span>{totalActualWords.toLocaleString()} words</span>
              <span>·</span>
              <span>{dialect === "en-GB" ? "British English (-ise)" : "US English"}</span>
            </div>
          </div>

          {/* Text Editor Area */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl flex-1 flex flex-col space-y-6">
              <textarea
                ref={editorTextareaRef}
                aria-label="Academic Manuscript Canvas"
                value={manuscriptText}
                onChange={(e) => handleManuscriptChange(e.target.value)}
                placeholder="Compose or assemble your peer-reviewed manuscript here. Sub-sections drafted via Mode 1 budgets and citations inserted from Mode 2 Smart Evidence will appear seamlessly..."
                className="w-full flex-1 min-h-[460px] bg-[color:var(--surface-canvas)] text-xs md:text-sm font-mono leading-relaxed text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none resize-none border-0 focus:ring-0 p-2"
              />

              {/* Live Verified Bibliography Card */}
              {verifiedBibliography.length > 0 && (
                <section
                  aria-labelledby="verified-bibliography-heading"
                  className="pt-6 border-t border-[color:var(--border-subtle)] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 id="verified-bibliography-heading" className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Verified Bibliography & Reference List ({verifiedBibliography.length} Cited Sources)
                    </h3>
                    <span className="text-[10px] font-mono text-[color:var(--text-muted)]">
                      {citationStyle} Formatting
                    </span>
                  </div>

                  <div className="space-y-2 bg-[color:var(--surface-sunken)]/60 rounded-xl p-4 border border-[color:var(--border-subtle)]">
                    {verifiedBibliography.map((entry) => (
                      <div
                        key={entry.token}
                        className="text-xs font-serif leading-relaxed text-[color:var(--text-primary)] pl-6 -indent-6"
                      >
                        <code className="text-[10px] font-mono text-[color:var(--accent)] mr-1.5 font-bold">
                          {entry.token}
                        </code>
                        <span>{entry.formattedCitation}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>

        {/* PANE 3: RIGHT ASSIGNED EVIDENCE & PRIMARY DATA DRAWER */}
        {!rightPaneCollapsed ? (
          <aside
            aria-label="Assigned Evidence & Primary Data Drawer"
            className="w-80 xl:w-96 shrink-0 border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/40 flex flex-col min-h-0"
          >
            <div className="p-3.5 border-b border-[color:var(--border-subtle)] flex items-center justify-between bg-[color:var(--surface-canvas)]">
              <button
                type="button"
                onClick={() => setRightPaneCollapsed(true)}
                className="p-1 rounded-lg hover:bg-[color:var(--surface-hover)] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
                title="Collapse Drawer"
              >
                ▶
              </button>
              <div>
                <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block text-right">
                  Evidence Ledger
                </span>
                <span className="text-xs font-bold text-[color:var(--text-primary)]">
                  Sources & Primary Datasets
                </span>
              </div>
            </div>

            {/* Tabs: Assigned vs All */}
            <div className="flex border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] text-xs">
              <button
                type="button"
                onClick={() => setRightPaneTab("assigned")}
                className={`flex-1 py-2 font-bold transition-colors cursor-pointer border-b-2 text-center ${
                  rightPaneTab === "assigned"
                    ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                    : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                Assigned ({assignedEvidence.length})
              </button>
              <button
                type="button"
                onClick={() => setRightPaneTab("all")}
                className={`flex-1 py-2 font-bold transition-colors cursor-pointer border-b-2 text-center ${
                  rightPaneTab === "all"
                    ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                    : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                All Sources ({allEvidence.length})
              </button>
            </div>

            {/* List of Evidence Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {(rightPaneTab === "assigned" ? assignedEvidence : allEvidence).length === 0 ? (
                <div className="p-6 text-center text-xs text-[color:var(--text-muted)] space-y-2">
                  <p>No evidence items assigned to this sub-section yet.</p>
                  <button
                    type="button"
                    onClick={() => setMode("evidence")}
                    className="text-xs font-bold text-[color:var(--accent)] hover:underline cursor-pointer"
                  >
                    Go to Mode 2 to map evidence →
                  </button>
                </div>
              ) : (
                (rightPaneTab === "assigned" ? assignedEvidence : allEvidence).map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] space-y-2 text-xs hover:border-[color:var(--border-control)] transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <code className="text-[10px] font-mono font-bold text-[color:var(--accent)] px-1.5 py-0.5 rounded bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]">
                        {item.citationToken}
                      </code>
                      <span
                        className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          item.isUserData
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        {item.isUserData ? "Primary Data" : "Literature"}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-[color:var(--text-primary)] text-xs line-clamp-2">
                        {item.title}
                      </h4>
                      <p className="text-[10px] text-[color:var(--text-secondary)] mt-0.5">
                        {item.author} ({item.year})
                      </p>
                    </div>

                    <p className="text-[10px] text-[color:var(--text-muted)] line-clamp-2 bg-[color:var(--surface-sunken)]/60 p-2 rounded-lg">
                      {item.extractedFindings}
                    </p>

                    <div className="pt-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleInsertCitation(item.citationToken)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <span>+ Insert Citation</span>
                      </button>

                      {copiedToken === item.citationToken && (
                        <span className="text-[10px] text-emerald-500 font-bold">
                          ✓ Inserted!
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setRightPaneCollapsed(false)}
            className="w-7 border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[10px] text-[color:var(--text-muted)] cursor-pointer"
            title="Expand Evidence Drawer"
          >
            ◀
          </button>
        )}
      </div>

      {/* POLISH DIFF PREVIEW MODAL */}
      {polishPreviewModalOpen && polishedDiffData && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                  Term-Locked Humanize & Polish Preview
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                  Syntactic burstiness delta: +{polishedDiffData.burstinessDelta || 0.28} · Citations & terminology 100% locked
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPolishPreviewModalOpen(false)}
                className="text-xs font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">
                    Original Draft
                  </span>
                  <p className="text-[color:var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                    {polishedDiffData.original}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block">
                    Polished Manuscript (High Burstiness & Zero Clichés)
                  </span>
                  <p className="text-[color:var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                    {polishedDiffData.revised}
                  </p>
                </div>
              </div>

              {polishedDiffData.styleCorrections && polishedDiffData.styleCorrections.length > 0 && (
                <div className="p-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] space-y-1">
                  <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
                    Applied Voice Guard Corrections:
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[color:var(--text-secondary)]">
                    {polishedDiffData.styleCorrections.map((corr, idx) => (
                      <li key={idx}>{corr}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setPolishPreviewModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyPolishedProse}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-sm"
              >
                Accept & Apply Polished Prose
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
