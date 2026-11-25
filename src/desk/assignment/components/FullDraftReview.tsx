/**
 * The whole assignment as one document, before it is downloaded: every section
 * in order, then the reference list, exactly what the export will contain.
 *
 * Reading shows the prose as the marker will read it, with citations formatted
 * in the project's style. Editing swaps each section for the shared section
 * editor, so a last fix is made here instead of going back to Drafting; each
 * change is saved through the same `updateSectionContent` the drafting stage
 * uses, so nothing is written here that Drafting would not write.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SectionTextEditor from "../../editor/SectionTextEditor";
import { renderAcademicProseWithCitations } from "./academicProse";
import { buildFormattedBibliography } from "../services/assignmentExportService";
import { formatReferenceHtml } from "../services/referenceListGenerator";
import { previewDraftText } from "../services/draftPreview";
import { countProseWords } from "../../../shared/proseBlocks";
import type { AssignmentDraftingSection, DiscoveredSource } from "../types";
import { BookOpen, Check, Loader2, Maximize2, Minimize2, PencilLine, X } from "lucide-react";

export interface FullDraftReviewProps {
  title: string;
  sections: AssignmentDraftingSection[];
  approvedSources: DiscoveredSource[];
  citationStyle: string;
  wordCount: number;
  targetWordCount: number;
  onUpdateSection: (sectionId: string, content: string) => Promise<void>;
}

/** How long after the last keystroke a section is saved. */
const SAVE_DELAY_MS = 800;

export function FullDraftReview({
  title,
  sections,
  approvedSources,
  citationStyle,
  wordCount,
  targetWordCount,
  onUpdateSection,
}: FullDraftReviewProps) {
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [expanded, setExpanded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  // What the student has typed but that has not reached the store yet.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const written = useMemo(
    () => sections.filter((s) => (s.draftContent ?? "").trim().length > 0),
    [sections]
  );
  const references = useMemo(
    () => buildFormattedBibliography(approvedSources, citationStyle),
    [approvedSources, citationStyle]
  );

  // A pending save must not be lost when the view closes.
  useEffect(() => {
    const pending = timers.current;
    return () => { for (const t of Object.values(pending)) clearTimeout(t); };
  }, []);

  // Escape leaves the full-screen view, as it does in every other overlay.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const changeSection = useCallback(
    (sectionId: string, text: string) => {
      setDrafts((d) => ({ ...d, [sectionId]: text }));
      setSaveState("saving");
      clearTimeout(timers.current[sectionId]);
      timers.current[sectionId] = setTimeout(() => {
        void onUpdateSection(sectionId, text)
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("idle"));
      }, SAVE_DELAY_MS);
    },
    [onUpdateSection]
  );

  const textOf = (s: AssignmentDraftingSection) => drafts[s.id] ?? s.draftContent ?? "";
  const liveWordCount = useMemo(() => {
    if (!Object.keys(drafts).length) return wordCount;
    return sections.reduce((n, s) => n + countProseWords(drafts[s.id] ?? s.draftContent ?? ""), 0);
  }, [drafts, sections, wordCount]);

  const paper = (
    <article className="mx-auto max-w-[46rem] px-5 sm:px-8 py-8">
      <h1 className="text-center text-xl sm:text-2xl font-semibold tracking-tight text-[color:var(--text-primary)] mb-8">
        {title}
      </h1>

      {written.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)] text-center py-10">
          No section has text yet. Write one in Drafting and the whole assignment appears here.
        </p>
      ) : (
        sections.map((section) => {
          const text = textOf(section);
          if (mode === "read" && !text.trim()) return null;
          return (
            <section key={section.id} className="mb-8" aria-label={section.title}>
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[color:var(--text-primary)] mb-1">
                {section.title}
              </h2>
              <p className="text-xs text-[color:var(--text-muted)] mb-3 tabular-nums">
                {countProseWords(text).toLocaleString()} words
                {section.targetWordCount ? ` of about ${section.targetWordCount.toLocaleString()}` : ""}
              </p>

              {mode === "edit" ? (
                <SectionTextEditor
                  value={text}
                  onChange={(next) => changeSection(section.id, next)}
                  ariaLabel={`Edit ${section.title}`}
                  placeholder="Write this section…"
                  citationLabel={(id) => id}
                  richBlocks
                  contentClassName="section-editor min-h-[8rem] rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4 text-[15px] leading-relaxed text-[color:var(--text-primary)] focus:outline-none"
                />
              ) : (
                <div className="assignment-prose">
                  {renderAcademicProseWithCitations(
                    previewDraftText(text, approvedSources, citationStyle)
                  )}
                </div>
              )}
            </section>
          );
        })
      )}

      {references.length > 0 && (
        <section aria-label="References" className="mt-10 pt-6 border-t border-[color:var(--border-subtle)]">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[color:var(--text-primary)] mb-4">
            References
          </h2>
          <div className="space-y-3 text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            {references.map((entry, i) => (
              <p key={i} className="pl-8 -indent-8" dangerouslySetInnerHTML={{ __html: formatReferenceHtml(entry) }} />
            ))}
          </div>
        </section>
      )}
    </article>
  );

  const controls = (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        className="text-xs text-[color:var(--text-muted)] tabular-nums mr-1 hidden sm:inline"
        data-testid="full-draft-word-count"
      >
        {liveWordCount.toLocaleString()} / {targetWordCount.toLocaleString()} words
      </span>

      {mode === "edit" && (
        <span className="text-xs text-[color:var(--text-muted)] inline-flex items-center gap-1 mr-1" aria-live="polite">
          {saveState === "saving" && (<><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>)}
          {saveState === "saved" && (<><Check className="w-3 h-3 text-emerald-500" /> Saved</>)}
        </span>
      )}

      <div className="inline-flex rounded-lg border border-[color:var(--border-subtle)] overflow-hidden" role="group" aria-label="Reading or editing">
        {(["read", "edit"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            data-testid={`full-draft-${m}`}
            className={`px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              mode === m
                ? "bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)]"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
            }`}
          >
            {m === "read" ? <BookOpen className="w-3.5 h-3.5" /> : <PencilLine className="w-3.5 h-3.5" />}
            <span>{m === "read" ? "Read" : "Edit"}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        data-testid="full-draft-expand"
        title={expanded ? "Leave full screen (Esc)" : "Open full screen"}
        aria-label={expanded ? "Leave full screen" : "Open full screen"}
        className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer transition-colors"
      >
        {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
    </div>
  );

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 bg-[color:var(--bg-canvas)] flex flex-col" role="dialog" aria-modal="true" aria-label="Your assignment, full screen">
        <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shrink-0">
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)] truncate">Your assignment</h2>
          <div className="flex items-center gap-1.5">
            {controls}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close full screen"
              className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{paper}</div>
      </div>
    );
  }

  return (
    <section
      data-testid="full-draft-review"
      aria-label="Your assignment"
      className="rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs overflow-hidden"
    >
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/40">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Your assignment</h2>
          <p className="text-xs text-[color:var(--text-muted)]">
            The whole draft as it will be downloaded. Edit it here if something needs a last fix.
          </p>
        </div>
        {controls}
      </header>
      <div className="max-h-[32rem] overflow-y-auto">{paper}</div>
    </section>
  );
}

export default FullDraftReview;
