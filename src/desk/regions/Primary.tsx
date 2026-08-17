import { useState } from "react";
import { exportProject } from "../api";
import CanonicalDocumentEditor from "../editor/CanonicalDocumentEditor";
import CitationIntegrityReport from "../journal/CitationIntegrityReport";
import type { CanonicalDocument, ProjectView } from "../types";

export interface ResolveCitationsOutcome {
  citedSourceIds: string[];
  unresolvedIds: string[];
}

/**
 * Region C (docs 22 §2/§4/§5). Now backed by the real editor
 * (editor/CanonicalDocumentEditor.tsx — "custom document model over a
 * proven text engine" per docs 22 §12) once a document exists.
 *
 * The plain-text submission form below (shown only when there's no document
 * yet) stays as the bootstrap path — pasting an existing draft to get
 * something into the Canonical Document Model in one step is a genuinely
 * useful action distinct from typing from scratch, not a placeholder for
 * the editor. See plainTextToDocument.ts's doc comment.
 */
export default function Primary({
  document,
  onSubmitPlainText,
  onSaveDocument,
  submitting,
  projectId,
  onResolveCitations,
  project,
}: {
  document: CanonicalDocument | null;
  onSubmitPlainText: (text: string) => void;
  onSaveDocument: (doc: CanonicalDocument) => void;
  submitting: boolean;
  projectId: string;
  /** Deterministically turns every `[ev-xxxx]` bracket-id in the saved document into a real in-text citation and rebuilds the References section — src/app/citation/resolveCitations.ts. Optional so callers that don't wire it (e.g. tests) keep working. */
  onResolveCitations?: () => Promise<ResolveCitationsOutcome>;
  project?: ProjectView;
}) {
  const [draft, setDraft] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [resolvingCitations, setResolvingCitations] = useState(false);
  const [citationOutcome, setCitationOutcome] = useState<ResolveCitationsOutcome | null>(null);
  const [citationError, setCitationError] = useState<string | null>(null);

  async function handleResolveCitations() {
    if (!onResolveCitations) return;
    setResolvingCitations(true);
    setCitationError(null);
    setCitationOutcome(null);
    try {
      setCitationOutcome(await onResolveCitations());
    } catch (err) {
      setCitationError((err as Error).message);
    } finally {
      setResolvingCitations(false);
    }
  }

  async function handleExport(format: "docx" | "odt" | "pdf") {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await exportProject(projectId, format);
      const url = URL.createObjectURL(blob);
      const a = globalThis.document.createElement("a");
      a.href = url;
      a.download = `${document?.title || "document"}.${format}`;
      globalThis.document.body.appendChild(a);
      a.click();
      globalThis.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  if (!document || document.blocks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950/50">
        <div className="max-w-2xl w-full text-center">
          <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-gray-200 dark:border-slate-800 rounded-3xl p-10 shadow-2xl shadow-indigo-500/5">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 mb-3">
              Draft your Manuscript
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-8 max-w-lg mx-auto">
              Paste an existing draft below (blank lines separate paragraphs) to start from it, or leave this blank and
              use the editor once you submit.
            </p>
            <div className="w-full rounded-2xl bg-white/50 dark:bg-black/20 backdrop-blur-sm border border-gray-200 dark:border-gray-800 overflow-hidden shadow-inner transition-all focus-within:ring-2 focus-within:ring-indigo-500/50">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={12}
                className="w-full bg-transparent border-0 text-gray-800 dark:text-gray-200 text-base p-6 font-serif leading-relaxed focus:outline-none focus:ring-0 placeholder-gray-400/70"
                placeholder={"# Paste or type a draft here.\n\nSeparate paragraphs with a blank line."}
              />
            </div>
            <button
              onClick={() => onSubmitPlainText(draft)}
              disabled={submitting}
              className="mt-8 w-full sm:w-auto px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Initialize Manuscript"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-10 py-6 max-w-[75ch] mx-auto w-full">
        <CanonicalDocumentEditor document={document} onSave={onSaveDocument} saving={submitting} />
      </div>
      {/* Citation resolution — turns approved-evidence bracket-ids into real
          in-text citations and a rendered References section. Deterministic, run once near the end of drafting, before export. */}
      {onResolveCitations && (
        <div className="border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] px-10 py-4">
          <div className="max-w-[75ch] mx-auto">
            <div className="flex items-center gap-3">
              <button
                onClick={handleResolveCitations}
                disabled={resolvingCitations}
                className="px-3 py-1.5 rounded text-xs border border-[color:var(--color-border-subtle)] text-[color:var(--text-secondary)] disabled:opacity-40 hover:border-[color:var(--color-luminous-blue-dim)]"
              >
                {resolvingCitations ? "Resolving citations…" : "Resolve citations"}
              </button>
              <span className="text-xs text-[color:var(--text-muted)]">
                Turns approved-evidence citation markers into real in-text citations and builds the References section.
              </span>
            </div>
            {citationError && <p role="alert" className="mt-2 text-[10px] text-red-400">Error: {citationError}</p>}
            {citationOutcome && (
              <p className="mt-2 text-[10px] text-[color:var(--text-secondary)]">
                {citationOutcome.citedSourceIds.length === 0
                  ? "Nothing to resolve — no citation markers found."
                  : `Resolved ${citationOutcome.citedSourceIds.length} source(s) into the References section.`}
                {citationOutcome.unresolvedIds.length > 0 &&
                  ` ${citationOutcome.unresolvedIds.length} marker(s) could not be resolved and were left as-is: ${citationOutcome.unresolvedIds.join(", ")}.`}
              </p>
            )}
          </div>
        </div>
      )}
      {/* Citation integrity report */}
      {project && <CitationIntegrityReport document={document} project={project} />}
      {/* Export controls (docs 33-EXPORT-ARCHITECTURE.md) */}
      <div className="border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] px-10 py-4">
        <div className="max-w-[75ch] mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[color:var(--text-secondary)]">Export as:</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport("docx")}
                disabled={exporting}
                className="px-3 py-1.5 rounded text-xs bg-[color:var(--color-luminous-blue-dim)] text-white disabled:opacity-40"
              >
                {exporting ? "Exporting…" : "DOCX"}
              </button>
              <button
                onClick={() => handleExport("odt")}
                disabled={exporting}
                className="px-3 py-1.5 rounded text-xs border border-[color:var(--color-border-subtle)] text-[color:var(--text-secondary)] disabled:opacity-40 hover:border-[color:var(--color-luminous-blue-dim)]"
              >
                ODT
              </button>
              <button
                onClick={() => handleExport("pdf")}
                disabled={exporting}
                className="px-3 py-1.5 rounded text-xs border border-[color:var(--color-border-subtle)] text-[color:var(--text-secondary)] disabled:opacity-40 hover:border-[color:var(--color-luminous-blue-dim)]"
              >
                PDF
              </button>
            </div>
            {exportError && <span className="text-[10px] text-red-400">Error: {exportError}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
