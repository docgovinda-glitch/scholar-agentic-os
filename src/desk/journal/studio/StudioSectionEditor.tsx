import { useEffect, useRef, useState, type RefObject } from "react";
import SectionTextEditor, { type SectionEditorHandle } from "../../editor/SectionTextEditor";
import { Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { countWords, SECTION_GUIDANCE, type ManuscriptUnit } from "../../../domain/journal/manuscriptModel";

export const IAST_DIACRITICS = [
  { char: "ā", label: "Long a" },
  { char: "ī", label: "Long i" },
  { char: "ū", label: "Long u" },
  { char: "ṛ", label: "Vocalic r" },
  { char: "ṝ", label: "Long vocalic r" },
  { char: "ḷ", label: "Vocalic l" },
  { char: "ś", label: "Palatal s" },
  { char: "ṣ", label: "Retroflex s" },
  { char: "ṇ", label: "Retroflex n" },
  { char: "ṅ", label: "Velar n" },
  { char: "ñ", label: "Palatal n" },
  { char: "ṃ", label: "Anusvara" },
  { char: "ḥ", label: "Visarga" },
] as const;

/** Special characters for transliteration (IAST), at the right of the editor toolbar. */
function DiacriticsMenu({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // Esc closes the menu, not focus mode
        setOpen(false);
      } else if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Special characters"
        title="Special characters (IAST)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="px-1.5 py-1 rounded-md text-xs font-serif text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
      >
        āś
      </button>
      {open && (
        <div role="group" aria-label="Insert a special character" className="absolute top-full mt-1 right-0 z-20 p-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] shadow-lg grid grid-cols-7 gap-1 w-64">
          {IAST_DIACRITICS.map((d) => (
            <button
              key={d.char}
              type="button"
              title={d.label}
              aria-label={`Insert ${d.label}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(d.char)}
              className="h-8 rounded-md text-sm font-serif hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] cursor-pointer"
            >
              {d.char}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The text of one section or sub-section: what it has to do, words against
 * its target, the author's text, and AI help that never silently replaces it.
 */
export default function StudioSectionEditor({
  unit,
  heading,
  value,
  onChange,
  editorRef,
  citationLabel,
  onDraft,
  onPolish,
  onInsertText,
  busy,
  canDraft,
  draftBlocker,
  guidance,
  onGuidanceChange,
  restoreLabel,
  onRestore,
}: {
  /** null for the "earlier draft" text that is under no section. */
  unit: ManuscriptUnit | null;
  heading: string;
  value: string;
  onChange: (next: string) => void;
  editorRef: RefObject<SectionEditorHandle | null>;
  citationLabel: (id: string) => string;
  onDraft: () => void;
  onPolish: () => void;
  onInsertText: (text: string) => void;
  busy: "draft" | "polish" | null;
  canDraft: boolean;
  draftBlocker?: string;
  /** The author's guidance for this section's draft (kept per section). */
  guidance: string;
  onGuidanceChange: (next: string) => void;
  /** Set after the AI replaced this section's text: offers the text from before. */
  restoreLabel?: string;
  onRestore?: () => void;
}) {
  const words = countWords(value);
  const target = unit?.targetWords ?? 0;
  const pct = target > 0 ? Math.round((words / target) * 100) : 0;
  const over = pct > 115;
  const hint = unit
    ? SECTION_GUIDANCE[unit.kind]
    : "Text from your earlier draft that isn't under a section heading. Move it into the right section, or keep it here; it stays at the top of the manuscript.";

  return (
    <article className="max-w-3xl mx-auto w-full px-4 sm:px-8 py-6 space-y-4">
      <header className="space-y-1.5">
        {unit && !unit.isWholeSection && (
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">{unit.sectionTitle}</p>
        )}
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">{heading}</h2>
        {hint && <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">{hint}</p>}
      </header>

      {unit && (
        <div className="flex items-center gap-3">
          <div
            role="meter"
            aria-label={`${heading} words`}
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(words, target)}
            aria-valuetext={`${words} of ${target} words`}
            className="flex-1 h-1.5 rounded-full bg-[color:var(--surface-sunken)] overflow-hidden"
          >
            <div className={`h-full rounded-full ${over ? "bg-[color:var(--state-warning)]" : "bg-[color:var(--accent)]"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <span className={`text-xs tabular-nums shrink-0 ${over ? "text-[color:var(--state-warning)]" : "text-[color:var(--text-muted)]"}`}>
            {words.toLocaleString()} / {target.toLocaleString()} words{over ? " · over target" : ""}
          </span>
        </div>
      )}

      {restoreLabel && onRestore && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] text-xs text-[color:var(--text-secondary)]">
          <span>{restoreLabel}</span>
          <button type="button" onClick={onRestore} className="inline-flex items-center gap-1 font-semibold text-[color:var(--text-primary)] hover:underline cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Restore my previous text
          </button>
        </div>
      )}

      <SectionTextEditor
        ref={editorRef}
        value={value}
        onChange={onChange}
        ariaLabel={`${heading} text`}
        placeholder={unit ? `Write the ${heading.toLowerCase()} here…` : ""}
        citationLabel={citationLabel}
        toolbarExtra={
          <>
            <DiacriticsMenu onInsert={onInsertText} />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onPolish}
              disabled={busy !== null || !value.trim()}
              title="Polishes the selected text, or the whole section when nothing is selected. You see the changes before anything is applied."
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 cursor-pointer"
            >
              {busy === "polish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />}
              Polish
            </button>
          </>
        }
      />

      {unit && (
        <section aria-label="AI drafting" className="p-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] space-y-2">
          <form
            className="flex flex-col sm:flex-row sm:items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (canDraft && busy === null) onDraft();
            }}
          >
            <input
              aria-label={`Guidance for the ${heading} draft`}
              value={guidance}
              onChange={(e) => onGuidanceChange(e.target.value)}
              placeholder="Optional: what the draft must cover"
              className="flex-1 px-3 py-2 text-xs rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]"
            />
            <button
              type="submit"
              disabled={!canDraft || busy !== null}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[color:var(--text-primary)] text-[color:var(--surface-canvas)] disabled:opacity-50 cursor-pointer shrink-0"
            >
              {busy === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
              {busy === "draft" ? "Drafting…" : words > 0 ? `Redraft ${heading} with AI` : `Draft ${heading} with AI`}
            </button>
          </form>
          <p className="text-xs text-[color:var(--text-muted)]">
            {!canDraft && draftBlocker
              ? draftBlocker
              : "Uses your AI, this section's sources, and what you have already written in other sections. Citations come only from this section's sources."}
          </p>
        </section>
      )}
    </article>
  );
}
