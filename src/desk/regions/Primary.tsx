import { useState } from "react";
import { exportProject } from "../api";
import CanonicalDocumentEditor from "../editor/CanonicalDocumentEditor";
import type { CanonicalDocument } from "../types";

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
}: {
  document: CanonicalDocument | null;
  onSubmitPlainText: (text: string) => void;
  onSaveDocument: (doc: CanonicalDocument) => void;
  submitting: boolean;
  projectId: string;
}) {
  const [draft, setDraft] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-lg w-full text-center">
          <h2 className="text-sm text-[color:var(--text-secondary)] mb-2">No document submitted yet</h2>
          <p className="text-xs text-[color:var(--text-muted)] mb-4">
            Paste an existing draft below (blank lines separate paragraphs) to start from it, or leave this blank and
            use the editor once you submit — either way you can keep editing afterward.
          </p>
          {/* index.css's global form-control override forces a white background
              on any textarea/input/select via !important, unless it carries
              border-0 + bg-transparent — the styling below moves to this
              wrapper div instead, same pattern src/components/AIControlCenter.tsx
              already uses. */}
          <div className="w-full rounded-lg bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              className="border-0 bg-transparent w-full text-[color:var(--text-primary)] text-sm p-3 font-serif focus:outline-none"
              placeholder={"# Paste or type a draft here.\n\nSeparate paragraphs with a blank line."}
            />
          </div>
          <button
            onClick={() => onSubmitPlainText(draft)}
            disabled={submitting || draft.trim().length === 0}
            className="mt-3 px-4 py-2 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-xs disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Submit document"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-10 py-6 max-w-[75ch] mx-auto w-full">
        <CanonicalDocumentEditor document={document} onSave={onSaveDocument} saving={submitting} />
      </div>
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
