import { useMemo,useState } from "react";
import { Book,Check,Copy,Edit2 } from "lucide-react";
import type { DiscoveredSource } from "../types";
import { buildFormattedBibliography } from "../services/assignmentExportService";
import { formatReferenceHtml } from "../services/referenceListGenerator";

const plain = (html: string) => html.replace(/<[^>]+>/g, "");

export interface ReferencesCardProps {
  sources: DiscoveredSource[];
  /** Project citation style (Harvard, APA 7, IEEE ...). */
  style: string;
  /** The student's own edited list, if they changed it. */
  savedEdit?: string;
  onSaveEdit?: (text: string) => void;
}

/** The reference list for the approved sources, in the project's citation style, with copy and edit. */
export function ReferencesCard({ sources, style, savedEdit = "", onSaveEdit }: ReferencesCardProps) {
  const entries = useMemo(() => buildFormattedBibliography(sources, style), [sources, style]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const text = savedEdit.trim() ? savedEdit : entries.map(plain).join("\n\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable; the text stays selectable on screen.
    }
  };

  return (
    <section aria-label="References" data-testid="references-card" className="mt-5 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs overflow-hidden">
      <header className="px-5 py-3 flex items-center justify-between gap-2 bg-[color:var(--surface-inset)]/50 border-b border-[color:var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
          <Book className="w-4 h-4 text-emerald-500" aria-hidden="true" />
          References <span className="text-xs font-normal text-[color:var(--text-muted)]">({entries.length})</span>
        </h3>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={copy} className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)] cursor-pointer inline-flex items-center gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setDraft(text);
                setEditing(true);
              }}
              className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)] cursor-pointer inline-flex items-center gap-1.5"
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
      </header>

      {editing ? (
        <div className="p-5 space-y-2">
          <textarea
            aria-label="Edit references"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(14, Math.max(5, draft.split("\n").length + 1))}
            className="w-full bg-transparent border border-[color:var(--border-subtle)] rounded-xl p-3 text-[13px] leading-relaxed text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-neutral-400"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[color:var(--surface-hover)] cursor-pointer">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveEdit?.(draft);
                setEditing(false);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5 text-[13px] text-[color:var(--text-secondary)] leading-relaxed space-y-3">
          {savedEdit.trim()
            ? savedEdit.split(/\n{2,}/).map((p, i) => (
                <p key={i} className="pl-6 -indent-6 whitespace-pre-wrap">
                  {p}
                </p>
              ))
            : entries.map((bib, i) => (
                <p key={i} className="pl-6 -indent-6" dangerouslySetInnerHTML={{ __html: formatReferenceHtml(bib) }} />
              ))}
        </div>
      )}
    </section>
  );
}
