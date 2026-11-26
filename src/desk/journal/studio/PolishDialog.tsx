import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { buildDiff } from "../../../domain/language/diff";

/** Longer passages are shown side by side without word marks (the diff is quadratic). */
const DIFF_MAX_CHARS = 12000;

/**
 * The polished text next to the author's, with the changed words marked.
 * Nothing changes until the author applies it. Esc closes; focus stays inside.
 */
export default function PolishDialog({
  original,
  revised,
  notes,
  scopeLabel,
  onApply,
  onClose,
}: {
  original: string;
  revised: string;
  notes: string[];
  /** "the selected passage" or "the whole section". */
  scopeLabel: string;
  onApply: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const unchanged = original === revised;
  const changes = useMemo(
    () => (unchanged || original.length + revised.length > DIFF_MAX_CHARS ? null : buildDiff(original, revised, () => "")),
    [original, revised, unchanged]
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    root?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  // The two texts with each changed run marked: removed words in "Yours", added words in "Polished".
  const marked = (side: "original" | "revised") => {
    if (!changes) return side === "original" ? original : revised;
    const out: ReactNode[] = [];
    let cursor = 0;
    changes.forEach((c, i) => {
      out.push(original.slice(cursor, c.originalStart));
      const text = side === "original" ? c.originalText : c.replacementText;
      if (text) {
        out.push(
          side === "original" ? (
            <del key={i} className="bg-[color:var(--state-danger-subtle)] text-[color:var(--text-primary)] decoration-[color:var(--state-danger)]">{text}</del>
          ) : (
            <ins key={i} className="no-underline bg-[color:var(--state-success-subtle)] text-[color:var(--text-primary)]">{text}</ins>
          )
        );
      }
      cursor = c.originalEnd;
    });
    out.push(original.slice(cursor));
    return out;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="polish-heading"
        aria-describedby="polish-summary"
        className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] shadow-2xl"
      >
        <div className="px-5 py-3 border-b border-[color:var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 id="polish-heading" className="text-sm font-semibold text-[color:var(--text-primary)]">Polished text: review before applying</h3>
            <p id="polish-summary" className="text-xs text-[color:var(--text-muted)]">
              {unchanged
                ? `No changes were suggested for ${scopeLabel}.`
                : changes
                ? `${changes.length} change${changes.length === 1 ? "" : "s"} to ${scopeLabel}. Removed words are struck through; added words are highlighted.`
                : `Changes to ${scopeLabel}.`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md hover:bg-[color:var(--surface-hover)] cursor-pointer shrink-0">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-4 p-5 overflow-y-auto text-sm leading-relaxed">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-1">Yours</div>
            <p className="whitespace-pre-wrap text-[color:var(--text-secondary)]">{marked("original")}</p>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-1">Polished</div>
            <p className="whitespace-pre-wrap text-[color:var(--text-primary)]">{marked("revised")}</p>
          </div>
          {notes.length > 0 && (
            <ul className="md:col-span-2 list-disc pl-5 text-xs text-[color:var(--text-muted)]">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[color:var(--border-subtle)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="studio-btn" data-autofocus>
            Keep mine
          </button>
          <button type="button" onClick={onApply} disabled={unchanged} className="studio-btn studio-btn-primary disabled:opacity-50">
            Apply polished text
          </button>
        </div>
      </div>
    </div>
  );
}
