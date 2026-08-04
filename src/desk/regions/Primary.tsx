import { useState } from "react";
import { exportProject } from "../api";
import type { Block, CanonicalDocument } from "../types";

function BlockView({ block }: { block: Block }) {
  const text = block.text || " ";
  switch (block.kind) {
    case "heading1":
      return <h1 id={block.id} className="text-2xl font-serif font-bold mt-6 mb-2 text-[#F1F5F9]">{text}</h1>;
    case "heading2":
      return <h2 id={block.id} className="text-xl font-serif font-bold mt-5 mb-2 text-[#F1F5F9]">{text}</h2>;
    case "heading3":
      return <h3 id={block.id} className="text-lg font-serif font-semibold mt-4 mb-1 text-[#F1F5F9]">{text}</h3>;
    case "quote":
      return <blockquote id={block.id} className="border-l-2 border-[color:var(--color-luminous-blue-dim)] pl-4 italic text-[#94A3B8] my-3">{text}</blockquote>;
    case "list-item":
      return <li id={block.id} className="ml-5 list-disc text-[#CBD5E1]">{text}</li>;
    default:
      return <p id={block.id} className="text-[#CBD5E1] leading-relaxed my-2">{text}</p>;
  }
}

/**
 * Region C (docs 22 §2/§4/§5). Read-only for now — the real editor ("Custom
 * document model over a proven text engine", 22 §12) is a distinct,
 * substantial build this first slice deliberately does not attempt.
 *
 * The plain-text submission form below (shown only when there's no document
 * yet) is an honest stopgap, not a preview of the editor: it exists so this
 * screen has something real to show in Outline/Primary/Compliance rather
 * than being permanently empty. See plainTextToDocument.ts's doc comment.
 */
export default function Primary({
  document,
  onSubmitPlainText,
  submitting,
  projectId,
}: {
  document: CanonicalDocument | null;
  onSubmitPlainText: (text: string) => void;
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
          <h2 className="text-sm font-mono uppercase tracking-wide text-[#94A3B8] mb-2">No document submitted yet</h2>
          <p className="text-xs text-[#64748B] mb-4">
            The real editor isn't built yet. Paste plain text below (blank lines separate paragraphs) to see the
            Outline and Compliance panels work against a real document.
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
              className="border-0 bg-transparent w-full text-[#E2E8F0] text-sm p-3 font-serif focus:outline-none"
              placeholder={"# Paste or type a draft here.\n\nSeparate paragraphs with a blank line."}
            />
          </div>
          <button
            onClick={() => onSubmitPlainText(draft)}
            disabled={submitting || draft.trim().length === 0}
            className="mt-3 px-4 py-2 rounded-lg bg-[color:var(--color-luminous-blue-dim)] text-white text-xs font-mono uppercase tracking-wide disabled:opacity-40"
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
        {document.blocks.map((b) => (
          <BlockView key={b.id} block={b} />
        ))}
      </div>
      {/* Export controls (docs 33-EXPORT-ARCHITECTURE.md) */}
      <div className="border-t border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] px-10 py-4">
        <div className="max-w-[75ch] mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono uppercase tracking-wide text-[#94A3B8]">Export as:</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport("docx")}
                disabled={exporting}
                className="px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-wide bg-[color:var(--color-luminous-blue-dim)] text-white disabled:opacity-40"
              >
                {exporting ? "Exporting…" : "DOCX"}
              </button>
              <button
                onClick={() => handleExport("odt")}
                disabled={exporting}
                className="px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-border-subtle)] text-[#94A3B8] disabled:opacity-40 hover:border-[color:var(--color-luminous-blue-dim)]"
              >
                ODT
              </button>
              <button
                onClick={() => handleExport("pdf")}
                disabled={exporting}
                className="px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-wide border border-[color:var(--color-border-subtle)] text-[#94A3B8] disabled:opacity-40 hover:border-[color:var(--color-luminous-blue-dim)]"
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
