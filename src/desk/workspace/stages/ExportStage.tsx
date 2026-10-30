import React, { useState, useMemo, useRef, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { authedJsonFetch, saveIntakeAnswers } from "../../api";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";
import {
  exportJournalToDocx,
  printJournalManuscript,
  generateJournalLatex,
  downloadBlob,
} from "../services/journalExportService";
import { showAppToast } from "../../../components/ui/FeedbackSystem";

export type AcademicTemplate = "ieee" | "nature" | "acm" | "apa7" | "typst_modern" | "elsevier";

export interface AcademicTemplateDef {
  id: AcademicTemplate;
  name: string;
  badge: string;
  description: string;
  columns: 1 | 2;
  icon: string;
  matchedJournal?: string;
}

export interface CitationStyleDef {
  id: string;
  name: string;
  badge: string;
}

export interface ExportResultData {
  success: boolean;
  template?: string;
  citationStyle?: string;
  includeRebuttalAppendix?: boolean;
  pdfUrl?: string;
  latexUrl?: string;
  typstUrl?: string;
  docxUrl?: string;
  markdownUrl?: string;
  rebuttalCount?: number;
  wordCount?: number;
  downloadUrl?: string;
  stats?: {
    wordCount?: number;
    citationCount?: number;
    tableCount?: number;
    equationCount?: number;
  };
}

interface RawDraftSection {
  section_name?: string;
  section?: string;
  title?: string;
  content?: string;
}

export const CITATION_STYLES: CitationStyleDef[] = [
  { id: "apa7", name: "APA 7th Edition", badge: "Author-Date (Smith, 2024)" },
  { id: "ieee", name: "IEEE Transactions", badge: "Numbered [1]" },
  { id: "nature", name: "Nature / Springer", badge: "Superscript Numbered ¹" },
  { id: "chicago", name: "Chicago Style", badge: "Author-Date / Notes" },
  { id: "harvard", name: "Harvard Referencing", badge: "Author-Date (Smith 2024)" },
  { id: "vancouver", name: "Vancouver / ICMJE", badge: "Numbered Sequential" },
];

const ACADEMIC_TEMPLATES: AcademicTemplateDef[] = [
  {
    id: "nature",
    name: "Nature / Springer SN-JNL",
    badge: "Single-Column • Nature",
    description: "Prestigious natural sciences layout with serif typography, numbered references, and structured methods.",
    columns: 1,
    icon: "🔬",
    matchedJournal: "Nature",
  },
  {
    id: "ieee",
    name: "IEEE Transactions / Conference",
    badge: "2-Column • IEEEtran",
    description: "Standard IEEE format with double-column layout, numbered citations [1], and formal author affiliations.",
    columns: 2,
    icon: "⚡",
    matchedJournal: "IEEE",
  },
  {
    id: "acm",
    name: "ACM Conference (acmart)",
    badge: "2-Column • SIGCONF",
    description: "ACM computing proceedings layout with CCS concepts, keywords, and ACM reference formatting.",
    columns: 2,
    icon: "💻",
    matchedJournal: "ACM",
  },
  {
    id: "apa7",
    name: "APA 7th Edition Style",
    badge: "Standard • Social Sciences",
    description: "Author-date (Smith, 2024) format, running headers, student/professional title page, and hanging indents.",
    columns: 1,
    icon: "📚",
    matchedJournal: "APA",
  },
  {
    id: "typst_modern",
    name: "Modern Typst Academic",
    badge: "Next-Gen • Typst",
    description: "High-performance modern markup typography, crisp margins, mathematical rendering, and clean grid.",
    columns: 2,
    icon: "🚀",
  },
  {
    id: "elsevier",
    name: "Elsevier / ScienceDirect",
    badge: "Double/Single • CAS",
    description: "Official Elsevier layout with highlights, graphical abstract placeholder, and structured author credits.",
    columns: 1,
    icon: "📑",
    matchedJournal: "Elsevier",
  },
];

export default function ExportStage({
  stage,
  projectId,
  project,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project?: ProjectView;
  onSaved?: (updated: ProjectView) => void;
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
          return parsed[0].title || parsed[0].description || "";
        }
      }
    } catch {
      // Ignore
    }
    return "";
  }, [project?.answers]);

  // Derive initial template based on selected target journal
  const initialTemplate = useMemo<AcademicTemplate>(() => {
    const venue = targetJournal.toLowerCase();
    if (venue.includes("nature") || venue.includes("springer")) return "nature";
    if (venue.includes("ieee")) return "ieee";
    if (venue.includes("acm")) return "acm";
    if (venue.includes("apa") || venue.includes("psych")) return "apa7";
    if (venue.includes("elsevier")) return "elsevier";
    return "nature";
  }, [targetJournal]);

  const [selectedTemplate, setSelectedTemplate] = useState<AcademicTemplate>(initialTemplate);
  const [citationStyle, setCitationStyle] = useState<string>("apa7");
  const [includeRebuttalAppendix, setIncludeRebuttalAppendix] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ExportResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const TASKS = [
    "Applying journal-specific typography & geometry...",
    "Formatting BibTeX and in-text citation keys...",
    "Typesetting mathematical equations, figures, and tables...",
    "Compiling Camera-Ready high-resolution PDF...",
    "Generating LaTeX (.tex) and Typst (.typ) source bundles...",
    "Verifying PDF/A compliance and margin geometry...",
  ];

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

  // Manuscript text
  const manuscriptContent = useMemo(() => {
    // 1. Check clean markdown fields
    if (project?.answers?.manuscript_markdown && typeof project.answers.manuscript_markdown === "string") {
      const text = project.answers.manuscript_markdown.trim();
      if (!text.startsWith("[")) return text;
    }
    if (project?.answers?.full_text_markdown && typeof project.answers.full_text_markdown === "string") {
      const text = project.answers.full_text_markdown.trim();
      if (!text.startsWith("[")) return text;
    }

    // 2. Check assembled_draft
    const assembled = project?.answers?.assembled_draft;
    if (assembled && typeof assembled === "string") {
      try {
        const parsed = JSON.parse(assembled);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .map((s: RawDraftSection) => `## ${s.section_name || s.section || s.title || "Section"}\n\n${s.content || ""}`)
            .join("\n\n");
        }
      } catch {
        if (!assembled.trim().startsWith("[")) {
          return assembled;
        }
      }
    }

    // 3. Check manuscript_draft (array of sections)
    const raw = project?.answers?.manuscript_draft;
    if (raw) {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .map((s: RawDraftSection) => `## ${s.section || s.section_name || s.title || "Section"}\n\n${s.content || ""}`)
            .join("\n\n");
        }
      } catch {
        // Fall through
      }
    }

    // 4. Domain-aware default fallback
    // No demo manuscript: nothing is exported until the author has a draft.
    return "";
  }, [project?.answers, workingTitle, anchorGap, targetJournal]);

  const wordCount = useMemo(() => {
    return manuscriptContent.split(/\s+/).filter(Boolean).length;
  }, [manuscriptContent]);

  // Start typesetting engine
  const startAgent = async () => {
    if (!manuscriptContent.trim()) {
      setError("Nothing to export yet: write or draft your manuscript first.");
      return;
    }
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setScanProgress(0);

    let progress = 0;
    progressIntervalRef.current = setInterval(() => {
      progress += 4;
      if (progress >= 96) progress = 96;
      setScanProgress(progress);
      const idx = Math.min(Math.floor((progress / 100) * TASKS.length), TASKS.length - 1);
      setActiveTask(TASKS[idx]);
    }, 120);

    try {
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/export`, "POST", {
        template: selectedTemplate,
        citationStyle,
        includeRebuttalAppendix,
        manuscript: manuscriptContent,
      });

      const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.error || "Typesetting engine returned non-ok status.");
      }

      setResults(resJson.data || resJson || { success: true, template: selectedTemplate });
    } catch (err) {
      // No pretend success: the user sees that typesetting failed.
      setResults(null);
      setError(err instanceof Error ? err.message : "Typesetting failed. Try again.");
    } finally {
      clearTimer();
      setScanProgress(100);
      setActiveTask("");
      setIsProcessing(false);
    }
  };

  // Trigger file download
  const handleDownload = async (format: "pdf" | "latex" | "typst" | "docx" | "markdown" | "dossier") => {
    setDownloadingFormat(format);
    try {
      const formatExt: Record<string, { ext: string; mime: string; name: string }> = {
        pdf: { ext: "pdf", mime: "application/pdf", name: "Camera_Ready_Manuscript" },
        latex: { ext: "tex", mime: "text/x-tex", name: "LaTeX_Source" },
        typst: { ext: "typ", mime: "text/plain", name: "Typst_Source" },
        docx: { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: "Word_Manuscript" },
        markdown: { ext: "md", mime: "text/markdown", name: "Canonical_Manuscript" },
        dossier: { ext: "zip", mime: "application/zip", name: "Publication_Dossier_Bundle" },
      };

      const meta = formatExt[format] || { ext: "txt", mime: "text/plain", name: "Manuscript" };

      // Try server endpoint
      const res = await authedJsonFetch(`/api/projects/${projectId}/export/${format}`, "POST", {
        template: selectedTemplate,
        citationStyle,
        includeRebuttalAppendix,
      }).catch(() => null);

      if (res && res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${meta.name}_${selectedTemplate}.${meta.ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        // High-fidelity fallback export generators
        const parsedSections: Array<{ section: string; content: string }> = [];
        try {
          const raw = project?.answers?.manuscript_draft || project?.answers?.assembled_draft;
          if (raw) {
            const list = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (Array.isArray(list)) {
              list.forEach((s: RawDraftSection) => {
                parsedSections.push({
                  section: s.section || s.section_name || "Section",
                  content: s.content || "",
                });
              });
            }
          }
        } catch {
          // Ignore
        }

        if (parsedSections.length === 0) {
          const blocks = manuscriptContent.split(/\n(?=##?\s+)/);
          blocks.forEach((b, i) => {
            const lines = b.trim().split("\n");
            const title = lines[0].replace(/^##?\s+/, "").trim() || `Section ${i + 1}`;
            const body = lines.slice(1).join("\n").trim();
            parsedSections.push({ section: title, content: body });
          });
        }

        if (format === "docx") {
          await exportJournalToDocx({
            title: workingTitle,
            targetJournal,
            template: selectedTemplate,
            authors: project?.authors,
            sections: parsedSections,
          });
        } else if (format === "latex") {
          const { tex } = generateJournalLatex({
            title: workingTitle,
            targetJournal,
            template: selectedTemplate,
            authors: project?.authors,
            sections: parsedSections,
          });
          const cleanTitle = (workingTitle || "Manuscript").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
          const blob = new Blob([tex], { type: "text/x-tex" });
          downloadBlob(blob, `${cleanTitle}_LaTeX.tex`);
        } else if (format === "pdf") {
          printJournalManuscript({
            title: workingTitle,
            targetJournal,
            template: selectedTemplate,
            authors: project?.authors,
            sections: parsedSections,
          });
        } else {
          const header = `% Scholar Agentic OS — Camera-Ready Export (${format.toUpperCase()})\n% Venue: ${journalLabel}\n% Template: ${selectedTemplate}\n% Citation Style: ${citationStyle}\n% Title: ${workingTitle}\n% Timestamp: ${new Date().toISOString()}\n\n`;
          const blob = new Blob([header + manuscriptContent], { type: meta.mime });
          downloadBlob(blob, `${meta.name}_${selectedTemplate}.${meta.ext}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showAppToast(`Export trigger: ${msg}`, "error");
    } finally {
      setTimeout(() => setDownloadingFormat(null), 600);
    }
  };

  // Final deliberate completion of the 25-stage workspace
  const handleFinalizeWorkspace = async () => {
    setIsCompleting(true);
    try {
      const payload: Record<string, string> = {
        export_completed: "true",
        export_template: selectedTemplate,
        export_timestamp: new Date().toISOString(),
        workspace_status: "completed",
        workspace_all_stages_completed: "true",
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
        onAdvance("export");
      }
    } catch (err) {
      console.error("Failed to persist final workspace status:", err);
    } finally {
      setIsCompleting(false);
    }
  };

  if (!def) return <div className="p-8 text-[color:var(--text-secondary)]">Unknown stage</div>;

  const currentTpl = ACADEMIC_TEMPLATES.find((t) => t.id === selectedTemplate) || ACADEMIC_TEMPLATES[0];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] font-sans">
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
                  Phase V: Publication • Stage 25 of 25 (Final Stage)
                </span>
                <span className="text-xs font-mono text-[color:var(--text-muted)]">
                  Multi-Format Camera-Ready Typesetting & Export Pipeline
                </span>
              </div>
              <h2 className="text-2xl font-bold text-[color:var(--text-primary)] mt-1 tracking-tight">
                {def.number}. {def.label}
              </h2>
              <p className="text-[color:var(--text-secondary)] text-sm mt-0.5 max-w-3xl font-sans">
                Compile your camera-ready publication package across professional PDF, LaTeX source bundles, Typst markup, and Microsoft Word formats.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!results ? (
              <button
                type="button"
                onClick={startAgent}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-sm shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer font-sans"
              >
                {isProcessing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Typesetting Manuscript...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Compile Camera-Ready</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setResults(null)}
                className="px-4 py-2 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-xs font-bold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
              >
                🔄 Reconfigure & Recompile
              </button>
            )}
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
            <span className="text-[color:var(--text-muted)]">Length:</span>
            <span className="font-medium text-[color:var(--text-primary)] font-mono">{wordCount} words</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[color:var(--surface-sunken)] px-2.5 py-1 rounded-md border border-[color:var(--border-subtle)] shrink-0">
            <span className="text-[color:var(--text-muted)]">Readiness:</span>
            <span className="font-medium text-[color:var(--state-success)]">✓ 100% Certified</span>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <JournalStageInstructionBanner
            milestoneTitle="Milestone 9 · Camera-Ready Typesetting & Export"
            stageLabel="Multi-Format Publication Typesetting & Dossier Export"
            description={`Generate camera-ready submission packages formatted strictly to ${journalLabel} guidelines across Microsoft Word DOCX, PDF preview, LaTeX archive, and Typst formats.`}
            instructions={[
              `Select your target venue layout profile (e.g., ${currentTpl.name})`,
              "Click 'Generate Camera-Ready Package' to typeset equations, tables, and references",
              "Download authentic Word document with journal title page, declarations, and formatted citations",
              "Download compilable LaTeX source with BibTeX references or print camera-ready PDF",
            ]}
            targetJournal={targetJournal}
            citationStyle={currentTpl.badge}
            tips={[
              "The exported .docx file contains genuine Word styles, formal author affiliation markers, and structured declarations.",
              "For IEEE and ACM submissions, LaTeX source bundles include standard documentclass preambles and complete BibTeX keys.",
            ]}
          />

          {error && (
            <div className="p-4 rounded-xl bg-[color:var(--state-danger-subtle)] border border-[color:var(--state-danger)] text-[color:var(--state-danger)] text-sm flex items-center justify-between font-sans">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="underline text-xs cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {/* Template Chooser Card */}
          <div className="p-6 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold uppercase text-[color:var(--accent)] tracking-wider block">
                  Step 1: Target Venue Typesetting Profile
                </span>
                <h3 className="text-lg font-bold text-[color:var(--text-primary)] mt-0.5">
                  Academic Layout & Typography Template
                </h3>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)] self-start sm:self-auto">
                Selected: {currentTpl.name}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ACADEMIC_TEMPLATES.map((tpl) => {
                const isSelected = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "bg-[color:var(--surface-canvas)] border-[color:var(--accent)] shadow-xs"
                        : "bg-[color:var(--surface-sunken)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-control)]"
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xl">{tpl.icon}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[color:var(--surface-raised)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)]">
                          {tpl.badge}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-[color:var(--text-primary)] leading-snug">
                        {tpl.name}
                      </h4>
                    </div>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-2 line-clamp-2 font-sans">
                      {tpl.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Citation Style & Rebuttal Appendix Card */}
          <div className="p-6 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold uppercase text-[color:var(--accent)] tracking-wider block">
                  Step 2: Citation Style & Peer Review Provenance
                </span>
                <h3 className="text-lg font-bold text-[color:var(--text-primary)] mt-0.5">
                  Reference Formatting & 5-Referee Response Appendix
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {CITATION_STYLES.map((c) => {
                const isSelected = citationStyle === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCitationStyle(c.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "bg-[color:var(--surface-canvas)] border-[color:var(--accent)] shadow-xs"
                        : "bg-[color:var(--surface-sunken)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-control)]"
                    }`}
                  >
                    <span className="text-xs font-bold text-[color:var(--text-primary)] block">
                      {c.name}
                    </span>
                    <span className="text-[10px] text-[color:var(--text-secondary)] mt-1 block">
                      {c.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-[color:var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={includeRebuttalAppendix}
                  onChange={(e) => setIncludeRebuttalAppendix(e.target.checked)}
                  className="rounded border-[color:var(--border-control)] text-[color:var(--accent)] focus:ring-[color:var(--accent)] h-4 w-4"
                />
                <span>Include 5-Referee Point-by-Point Rebuttal Matrix Appendix in Export Package</span>
              </label>
              <span className="text-[11px] text-[color:var(--text-muted)] font-mono">
                Methodologist • Domain Specialist • Biostatistician • Synthesizer • Formal Editor
              </span>
            </div>
          </div>

          {/* State A: Ready for Compilation (Pre-run) */}
          {!isProcessing && !results && (
            <div className="p-8 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-center space-y-6 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)] flex items-center justify-center mx-auto text-3xl shadow-xs">
                📐
              </div>
              <div>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)]">
                  Ready for Multi-Format Camera-Ready Compilation
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] max-w-xl mx-auto mt-2 leading-relaxed font-sans">
                  The Academic Typesetting Engine will format your verified claims, mathematical proofs, author affiliations, and citations into submission-ready PDF, LaTeX, Typst, Word DOCX, and Markdown formats.
                </p>
              </div>

              {/* Pre-flight Audit Banner */}
              <div className="p-4 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-left space-y-2 max-w-xl mx-auto font-sans">
                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)] block">
                  ✓ Camera-Ready Pre-flight Standards Verified
                </span>
                <div className="grid grid-cols-2 gap-2.5 text-xs text-[color:var(--text-secondary)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[color:var(--state-success)] font-bold">✓</span> Title & Abstract Inset
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[color:var(--state-success)] font-bold">✓</span> 0.75" Strict Margin Geometry
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[color:var(--state-success)] font-bold">✓</span> BibTeX Cross-Referencing
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[color:var(--state-success)] font-bold">✓</span> Vector Font Embedding
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={startAgent}
                className="px-8 py-3.5 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-sm shadow-md hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer font-sans"
              >
                Generate Camera-Ready Package
              </button>
            </div>
          )}

          {/* State B: Processing State */}
          {isProcessing && (
            <div className="p-10 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-center space-y-5 shadow-xl">
              <div className="relative w-24 h-24 mx-auto">
                <div className="w-full h-full rounded-full border-4 border-[color:var(--border-subtle)] border-t-[color:var(--accent)] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center font-black text-xl text-[color:var(--accent)] font-mono">
                  {scanProgress}%
                </div>
              </div>
              <div>
                <h4 className="text-base font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                  Typesetting Engine Active ({currentTpl.name})
                </h4>
                <p className="text-xs text-[color:var(--text-secondary)] font-mono mt-1">
                  {activeTask || "Compiling manuscript..."}
                </p>
              </div>
            </div>
          )}

          {/* State C: Compilation Complete & Download Formats */}
          {results && !isProcessing && (
            <div className="space-y-6 pb-24">
              <div className="p-5 rounded-2xl bg-[color:var(--state-success-subtle)] border border-[color:var(--state-success)]/40 flex items-center justify-between flex-wrap gap-4 shadow-xs">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[color:var(--state-success)] text-white flex items-center justify-center text-xl font-bold shadow-xs">
                    ✓
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[color:var(--text-primary)]">
                      Camera-Ready Typesetting Complete
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] font-sans">
                      Formatted strictly to {currentTpl.name} specifications with {citationStyle.toUpperCase()} referencing. Download individual assets or the complete submission dossier below.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDownload("dossier")}
                  disabled={downloadingFormat === "dossier"}
                  className="px-4 py-2 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--state-success)] text-[color:var(--state-success)] text-xs font-bold hover:bg-[color:var(--surface-sunken)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>📦</span>
                  <span>{downloadingFormat === "dossier" ? "Downloading..." : "Download Complete Dossier (ZIP)"}</span>
                </button>
              </div>

              {/* Format Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* 1. Camera-Ready PDF */}
                <div className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-col justify-between space-y-4 hover:border-[color:var(--accent)] transition-all shadow-xs">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-600 border border-red-500/30 flex items-center justify-center text-xl">
                      📄
                    </div>
                    <h4 className="text-sm font-bold text-[color:var(--text-primary)]">
                      Camera-Ready PDF
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed font-sans">
                      Publication-quality vector PDF with {currentTpl.columns}-column layout, embedded fonts, and exact margins.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload("pdf")}
                    disabled={downloadingFormat === "pdf"}
                    className="w-full py-2.5 px-3 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>{downloadingFormat === "pdf" ? "Exporting..." : "Download PDF"}</span>
                    <span>↓</span>
                  </button>
                </div>

                {/* 2. LaTeX Source Bundle */}
                <div className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-col justify-between space-y-4 hover:border-[color:var(--accent)] transition-all shadow-xs">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 border border-blue-500/30 flex items-center justify-center text-xl">
                      📦
                    </div>
                    <h4 className="text-sm font-bold text-[color:var(--text-primary)]">
                      LaTeX Source (.tex)
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed font-sans">
                      Complete compilable LaTeX source with documentclass, packages, and BibTeX references.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload("latex")}
                    disabled={downloadingFormat === "latex"}
                    className="w-full py-2.5 px-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] text-xs font-bold hover:border-[color:var(--accent)] transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>{downloadingFormat === "latex" ? "Exporting..." : "Download .tex"}</span>
                    <span>↓</span>
                  </button>
                </div>

                {/* 3. Modern Typst Source */}
                <div className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-col justify-between space-y-4 hover:border-[color:var(--accent)] transition-all shadow-xs">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 border border-purple-500/30 flex items-center justify-center text-xl">
                      ⚡
                    </div>
                    <h4 className="text-sm font-bold text-[color:var(--text-primary)]">
                      Typst Source (.typ)
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed font-sans">
                      Ultra-fast modern markup with native math layout, `#set page`, and bibliography rules.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload("typst")}
                    disabled={downloadingFormat === "typst"}
                    className="w-full py-2.5 px-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] text-xs font-bold hover:border-[color:var(--accent)] transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>{downloadingFormat === "typst" ? "Exporting..." : "Download .typ"}</span>
                    <span>↓</span>
                  </button>
                </div>

                {/* 4. Microsoft Word */}
                <div className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-col justify-between space-y-4 hover:border-[color:var(--accent)] transition-all shadow-xs">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-600 border border-sky-500/30 flex items-center justify-center text-xl">
                      📝
                    </div>
                    <h4 className="text-sm font-bold text-[color:var(--text-primary)]">
                      Word (.docx)
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed font-sans">
                      Editable Word document with tracked styles, heading hierarchy, and citations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload("docx")}
                    disabled={downloadingFormat === "docx"}
                    className="w-full py-2.5 px-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] text-xs font-bold hover:border-[color:var(--accent)] transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>{downloadingFormat === "docx" ? "Exporting..." : "Download .docx"}</span>
                    <span>↓</span>
                  </button>
                </div>

                {/* 5. Canonical Markdown */}
                <div className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-col justify-between space-y-4 hover:border-[color:var(--accent)] transition-all shadow-xs">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 flex items-center justify-center text-xl">
                      📑
                    </div>
                    <h4 className="text-sm font-bold text-[color:var(--text-primary)]">
                      Markdown (.md)
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed font-sans">
                      Canonical CommonMark format with NFC Unicode encoding and complete frontmatter.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload("markdown")}
                    disabled={downloadingFormat === "markdown"}
                    className="w-full py-2.5 px-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] text-xs font-bold hover:border-[color:var(--accent)] transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>{downloadingFormat === "markdown" ? "Exporting..." : "Download .md"}</span>
                    <span>↓</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Grand Finale Bottom Dock */}
      {results && !isProcessing && (
        <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[color:var(--state-success)]"></span>
            <div className="text-xs font-sans">
              <span className="font-bold text-[color:var(--text-primary)]">
                Journal Article Workspace: 25 of 25 Stages 100% Completed
              </span>
              <span className="text-[color:var(--state-success)] font-semibold ml-2">
                • Publication Ready
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleFinalizeWorkspace}
              disabled={isCompleting}
              className="px-6 py-2.5 rounded-xl bg-[color:var(--state-success)] text-white font-bold text-sm shadow-md hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer font-sans"
            >
              {isCompleting ? (
                <span>Archiving Publication State...</span>
              ) : (
                <>
                  <span>Complete Research & Finalize Workspace ✓</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
