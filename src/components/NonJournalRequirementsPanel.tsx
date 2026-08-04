import React, { useState, useEffect, useRef } from "react";
import { PaperProject, ComplianceRules, WORKFLOW_PHASES } from "../types";
import { ClipboardCheck, Upload } from "lucide-react";
import { getDocumentTemplate } from "../config/documentTemplates";
import { learnStructureFromSampleDocument } from "../services/sampleDocLearningService";

/**
 * Stage 8 (target-workflow.md) — structured requirements capture for
 * non-journal output formats. The equivalent of ComplianceChecklistPanel
 * (journal-article path, Phase E) for every other format, which has no
 * target journal to extract guidelines from. Pre-populates from the
 * format's template (src/config/documentTemplates.ts) and lets the user
 * confirm/override before drafting begins.
 */

interface NonJournalRequirementsPanelProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onNext: () => void;
  onBack: () => void;
}

const CITATION_STYLE_OPTIONS = ["APA 7th", "MLA 9th", "Chicago", "Harvard", "Vancouver"];

function formatWordCountGoal(min?: number, max?: number): string {
  if (min && max) return `${min}-${max} words`;
  if (max) return `${max} words`;
  if (min) return `${min}+ words`;
  return "";
}

export default function NonJournalRequirementsPanel({
  project,
  updateProject,
  onNext,
  onBack,
}: NonJournalRequirementsPanelProps) {
  const template = getDocumentTemplate(project.outputFormat);
  const existing = project.complianceRules;

  const [citationStyle, setCitationStyle] = useState(existing?.citationStyle || template.defaultCitationStyle);
  const [wordCountMin, setWordCountMin] = useState(existing?.wordCountMin?.toString() || "");
  const [wordCountMax, setWordCountMax] = useState(existing?.wordCountMax?.toString() || "");
  const [sectionStructureText, setSectionStructureText] = useState(
    (existing?.sectionStructure?.length ? existing.sectionStructure : template.sectionStructure).join("\n")
  );
  const [customNotes, setCustomNotes] = useState(existing?.customNotes || "");

  // Stage 7 (target-workflow.md) sample-document structure learning —
  // "independent alternative" to the template default, "sample wins" per
  // the spec. Purely local UI state: sectionStructureText (above) is the
  // single field either path writes to; this only tracks provenance for the
  // badge and in-progress/error UI.
  const [sampleSourceFileName, setSampleSourceFileName] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const sampleFileInputRef = useRef<HTMLInputElement>(null);

  const handleSampleDocUpload = async (file: File) => {
    setSampleLoading(true);
    setSampleError(null);
    try {
      const result = await learnStructureFromSampleDocument(file);
      setSectionStructureText(result.sectionStructure.join("\n"));
      setSampleSourceFileName(result.sourceFileName);
    } catch (err: any) {
      setSampleError(err.message || "Failed to learn structure from the uploaded document.");
    } finally {
      setSampleLoading(false);
    }
  };

  const [marginInches, setMarginInches] = useState((existing?.layoutOverrides?.marginInches ?? template.layout.marginInches).toString());
  const [fontSizePt, setFontSizePt] = useState((existing?.layoutOverrides?.fontSizePt ?? template.layout.fontSizePt).toString());
  const [lineSpacing, setLineSpacing] = useState<"single" | "double">(existing?.layoutOverrides?.lineSpacing ?? template.layout.lineSpacing);
  const [fontFamily, setFontFamily] = useState<"Times New Roman" | "Arial">(existing?.layoutOverrides?.fontFamily ?? template.layout.docxFontFamily);

  // Re-initialize local fields if the user switches format before saving (rare, but avoids stale state).
  useEffect(() => {
    if (!existing) {
      setCitationStyle(template.defaultCitationStyle);
      setSectionStructureText(template.sectionStructure.join("\n"));
    }
  }, [project.outputFormat]);

  const handleSaveAndContinue = () => {
    const sectionStructure = sectionStructureText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const min = wordCountMin ? parseInt(wordCountMin, 10) : undefined;
    const max = wordCountMax ? parseInt(wordCountMax, 10) : undefined;

    const rules: ComplianceRules = {
      wordCountGoal: formatWordCountGoal(min, max),
      citationStyle,
      formattingRules: existing?.formattingRules || [],
      sectionStructure,
      abstractRequirements: existing?.abstractRequirements || "",
      referencesRequirement: existing?.referencesRequirement || "",
      ethicalDisclosure: existing?.ethicalDisclosure || "",
      coverLetterNecessity: existing?.coverLetterNecessity || "",
      wordCountMin: min,
      wordCountMax: max,
      customNotes,
      layoutOverrides: {
        marginInches: parseFloat(marginInches) || template.layout.marginInches,
        fontSizePt: parseInt(fontSizePt, 10) || template.layout.fontSizePt,
        lineSpacing,
        fontFamily,
      },
    };

    // updateProject (useProjectPersistence.ts) closes over the project value
    // from this render — calling it twice synchronously (save, then onNext's
    // own separate phase-change updateProject call) makes the second call's
    // `{...project, ...newFields}` spread use the pre-save project, silently
    // dropping complianceRules (confirmed live: currentPhase advanced but
    // complianceRules came back null). Folding the phase advance into this
    // same single updateProject call sidesteps the race entirely, instead of
    // trying to time around it.
    const currentIndex = WORKFLOW_PHASES.findIndex((p) => p.id === project.currentPhase);
    const nextPhase = currentIndex !== -1 && currentIndex < WORKFLOW_PHASES.length - 1 ? WORKFLOW_PHASES[currentIndex + 1].id : project.currentPhase;
    updateProject({ complianceRules: rules, currentPhase: nextPhase });
  };

  return (
    <div id="non-journal-requirements" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[color:var(--color-navy-4)] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[color:var(--text-primary)] flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[color:var(--color-luminous-blue)]" />
            Phase E: Manuscript Requirements
          </h2>
          <p className="text-xs text-[color:var(--text-secondary)] font-medium">
            Confirm or adjust the default requirements for this format. These drive the section structure and formatting used at export.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[color:var(--text-primary)] uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
              Core Requirements
            </h3>
            <div>
              <label htmlFor="citation-style" className="block text-xs font-bold text-[color:var(--text-secondary)] mb-1">Citation Style</label>
              <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg focus-within:border-[color:var(--color-luminous-blue)]">
                <select
                  id="citation-style"
                  value={citationStyle}
                  onChange={(e) => setCitationStyle(e.target.value)}
                  className="border-0 bg-transparent w-full rounded-lg px-2.5 py-2 text-xs text-[color:var(--text-primary)] outline-none"
                >
                  {CITATION_STYLE_OPTIONS.map((style) => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label id="word-count-target-label" className="block text-xs font-bold text-[color:var(--text-secondary)] mb-1">Word Count Target</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  aria-label="Minimum word count target"
                  value={wordCountMin}
                  onChange={(e) => setWordCountMin(e.target.value)}
                  className="w-full bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg px-2.5 py-2 text-xs text-[color:var(--text-primary)]"
                />
                <span className="text-xs text-[color:var(--text-secondary)]">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  aria-label="Maximum word count target"
                  value={wordCountMax}
                  onChange={(e) => setWordCountMax(e.target.value)}
                  className="w-full bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg px-2.5 py-2 text-xs text-[color:var(--text-primary)]"
                />
              </div>
              {(wordCountMin || wordCountMax) && (
                <p className="text-[10px] text-[color:var(--text-secondary)] mt-1">
                  Target: {formatWordCountGoal(wordCountMin ? parseInt(wordCountMin, 10) : undefined, wordCountMax ? parseInt(wordCountMax, 10) : undefined)}
                  {" — shown for reference only, not enforced."}
                </p>
              )}
            </div>
          </div>

          <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[color:var(--text-primary)] uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
              Page Layout
            </h3>
            <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
              Drives the actual exported document's margins/font/spacing at Stage 12 — pre-filled from this format's default.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="page-margins" className="block text-xs font-bold text-[color:var(--text-secondary)] mb-1">Margins (in)</label>
                <input
                  id="page-margins"
                  type="number"
                  step="0.1"
                  value={marginInches}
                  onChange={(e) => setMarginInches(e.target.value)}
                  className="w-full bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg px-2.5 py-2 text-xs text-[color:var(--text-primary)]"
                />
              </div>
              <div>
                <label htmlFor="font-size" className="block text-xs font-bold text-[color:var(--text-secondary)] mb-1">Font Size (pt)</label>
                <input
                  id="font-size"
                  type="number"
                  value={fontSizePt}
                  onChange={(e) => setFontSizePt(e.target.value)}
                  className="w-full bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg px-2.5 py-2 text-xs text-[color:var(--text-primary)]"
                />
              </div>
              <div>
                <label htmlFor="font-family" className="block text-xs font-bold text-[color:var(--text-secondary)] mb-1">Font Family</label>
                <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg focus-within:border-[color:var(--color-luminous-blue)]">
                  <select
                    id="font-family"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value as "Times New Roman" | "Arial")}
                    className="border-0 bg-transparent w-full rounded-lg px-2.5 py-2 text-xs text-[color:var(--text-primary)] outline-none"
                  >
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Arial">Arial</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="line-spacing" className="block text-xs font-bold text-[color:var(--text-secondary)] mb-1">Line Spacing</label>
                <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg focus-within:border-[color:var(--color-luminous-blue)]">
                  <select
                    id="line-spacing"
                    value={lineSpacing}
                    onChange={(e) => setLineSpacing(e.target.value as "single" | "double")}
                    className="border-0 bg-transparent w-full rounded-lg px-2.5 py-2 text-xs text-[color:var(--text-primary)] outline-none"
                  >
                    <option value="single">Single</option>
                    <option value="double">Double</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-3">
            <h3 id="institution-notes-label" className="text-sm font-bold text-[color:var(--text-primary)] uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
              Institution / Instructor Notes
            </h3>
            <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg focus-within:border-[color:var(--color-luminous-blue)]">
              <textarea
                rows={5}
                aria-labelledby="institution-notes-label"
                placeholder="Any custom rules from your institution, instructor, or rubric (optional)..."
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                className="border-0 bg-transparent w-full rounded-lg px-2.5 py-2 text-xs text-[color:var(--text-primary)] outline-none"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-[color:var(--color-navy-4)] pb-2 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                Section Structure
              </h3>
              <span className="text-xs px-2 py-0.5 bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] border border-[color:var(--color-luminous-blue)]/30 rounded font-bold">
                {sampleSourceFileName ? `Learned from: ${sampleSourceFileName}` : `Default from ${project.outputFormat || "format"} template`}
              </span>
            </div>
            <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
              One section per line, in order. Pre-populated from the standard structure for this format — edit freely,
              or upload a sample document from your target journal to replace this with its real detected structure.
            </p>
            <div className="flex items-center gap-3">
              <input
                ref={sampleFileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                aria-label="Upload sample document to detect section structure"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSampleDocUpload(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => sampleFileInputRef.current?.click()}
                disabled={sampleLoading}
                className="px-3 py-1.5 bg-[color:var(--color-navy-1)] hover:bg-[color:var(--color-navy-3)] border border-dashed border-[color:var(--color-navy-4)] disabled:opacity-50 text-[color:var(--text-secondary)] text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                {sampleLoading ? "Learning Structure..." : "Learn From Sample Document"}
              </button>
            </div>
            {sampleError && (
              <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{sampleError}</p>
            )}
            <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg focus-within:border-[color:var(--color-luminous-blue)]">
              <textarea
                rows={10}
                aria-label="Manuscript section structure, one section per line"
                value={sectionStructureText}
                onChange={(e) => {
                  setSectionStructureText(e.target.value);
                  setSampleSourceFileName(null);
                }}
                className="border-0 bg-transparent w-full rounded-lg px-2.5 py-2 text-xs text-[color:var(--text-primary)] font-mono outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-[color:var(--color-navy-4)]">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-1)] text-[color:var(--text-primary)] text-xs rounded-lg transition-all duration-150 cursor-pointer font-mono"
        >
          ← Back
        </button>
        <button
          onClick={handleSaveAndContinue}
          className="px-6 py-2.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] font-bold text-white text-xs rounded-lg transition-all duration-200 shadow-sm cursor-pointer"
        >
          Save & Proceed to Drafting →
        </button>
      </div>
    </div>
  );
}
