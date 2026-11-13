import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Library, ListTree, Maximize2, Minimize2, X } from "lucide-react";
import type { WordBudgetBlueprint } from "./types";
import { useResearchWorkspace } from "./ResearchContext";
import { saveIntakeAnswers, draftProjectSubSection, polishProjectManuscript } from "../api";
import { normalizeUnicodeNFC } from "../../document_intelligence/index";
import { safeParseAnswerField } from "../../shared/projectStateSchema";
import { requestAppConfirm } from "../../components/ui/FeedbackSystem";
import {
  assembleManuscript,
  countWords,
  groupUnits,
  manuscriptUnits,
  nextToWrite,
  reconcileTexts,
  resolveTexts,
  serializeTexts,
  SECTION_GUIDANCE,
  totalWords,
  writtenContext,
  type ManuscriptTexts,
} from "../journal/manuscriptModel";
import { evidenceFor, studioEvidence } from "../journal/studioEvidence";
import { parseReferenceRecords } from "../../domain/journal/references";
import { parseFigures } from "../../domain/journal/figures";
import StudioOutline, { UNSORTED_ID } from "../journal/studio/StudioOutline";
import StudioEvidencePanel from "../journal/studio/StudioEvidencePanel";
import StudioSectionEditor from "../journal/studio/StudioSectionEditor";
import type { SectionEditorHandle } from "../editor/SectionTextEditor";

export { IAST_DIACRITICS } from "../journal/studio/StudioSectionEditor";

const wide = () => typeof window !== "undefined" && window.innerWidth >= 1536;

/**
 * Mode 3, the Writing Studio: the manuscript one section at a time, with the
 * outline on the left (in article order or the order authors usually write)
 * and the section's sources on the right. The writing column gets the room.
 */
export default function ManuscriptStudioMode() {
  const { project, projectId, setProject, setMode } = useResearchWorkspace();
  const pid = project?.projectId || projectId;
  const answers = useMemo<Record<string, string>>(() => project?.answers || {}, [project?.answers]);

  const blueprint = useMemo(() => {
    const bp = safeParseAnswerField<WordBudgetBlueprint | null>(answers["word_budget_blueprint"], null);
    return bp && Array.isArray(bp.sections) && bp.sections.length > 0 ? bp : null;
  }, [answers["word_budget_blueprint"]]);
  const targetTotal = blueprint?.targetTotalWords || parseInt(answers["target_word_count"] || "", 10) || 6000;
  const units = useMemo(() => manuscriptUnits(blueprint, targetTotal), [blueprint, targetTotal]);

  const storedMarkdown = answers["manuscript_markdown"] || answers["assembled_draft"] || answers["manuscript_draft"] || "";
  const [texts, setTexts] = useState<ManuscriptTexts>(() => resolveTexts(answers["manuscript_sections"], storedMarkdown, units));
  const touched = useRef(false);

  // Until the author edits here, follow the saved project (it may still be loading).
  useEffect(() => {
    if (!touched.current) setTexts(resolveTexts(answers["manuscript_sections"], storedMarkdown, units));
  }, [answers["manuscript_sections"], storedMarkdown, units]);
  // If the outline changes, text under a removed section is kept as unsorted text.
  useEffect(() => {
    setTexts((t) => reconcileTexts(t, units));
  }, [units]);

  const [activeId, setActiveId] = useState<string>(() => nextToWrite(units, texts)?.id || units[0]?.id || UNSORTED_ID);
  useEffect(() => {
    if (activeId !== UNSORTED_ID && !units.some((u) => u.id === activeId)) setActiveId(nextToWrite(units, texts)?.id || units[0]?.id || UNSORTED_ID);
  }, [units, activeId, texts]);
  const unit = activeId === UNSORTED_ID ? null : units.find((u) => u.id === activeId) ?? null;
  const value = unit ? texts.texts[unit.id] ?? "" : texts.unsorted;
  const heading = unit ? (unit.isWholeSection ? unit.title : unit.title) : "Text from your earlier draft";

  const [order, setOrder] = useState<"manuscript" | "writing">("writing");
  const [focus, setFocus] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(wide);
  const [readAll, setReadAll] = useState(false);
  const [busy, setBusy] = useState<"draft" | "polish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polish, setPolish] = useState<{ original: string; revised: string; notes: string[] } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const editorRef = useRef<SectionEditorHandle | null>(null);

  const manuscript = useMemo(() => assembleManuscript(units, texts), [units, texts]);
  const written = totalWords(texts);
  const dialect: "en-GB" | "en-US" = answers["orthography"]?.includes("US") ? "en-US" : "en-GB";
  const evidence = useMemo(() => studioEvidence(answers), [answers]);
  const referenceRecords = useMemo(() => parseReferenceRecords(answers["reference_records"]), [answers]);
  const figures = useMemo(() => parseFigures(answers["manuscript_figures"]), [answers]);
  const unitEvidence = unit ? evidenceFor(evidence, unit.id, unit.sectionId, unit.assignedSourceIds) : [];
  const next = nextToWrite(units, texts);

  // Debounced save of only the fields this studio owns.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (t: ManuscriptTexts) => {
      if (!pid) return;
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const md = assembleManuscript(units, t);
        try {
          const saved = await saveIntakeAnswers(pid, {
            manuscript_sections: serializeTexts(t),
            manuscript_markdown: md,
            assembled_draft: md,
            full_text_markdown: md,
          });
          if (saved) setProject(saved);
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
      }, 800);
    },
    [pid, units, setProject]
  );
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const setActiveText = useCallback(
    (next: string, id: string = activeId) => {
      touched.current = true;
      const normalized = normalizeUnicodeNFC(next);
      setTexts((t) => {
        const updated = id === UNSORTED_ID ? { ...t, unsorted: normalized } : { ...t, texts: { ...t.texts, [id]: normalized } };
        persist(updated);
        return updated;
      });
    },
    [activeId, persist]
  );

  const insertText = (text: string) => editorRef.current?.insertText(text);
  const insertCitation = (token: string) => {
    const id = token.match(/^\[CITE:(.+)\]$/)?.[1];
    if (id) editorRef.current?.insertCitation(id);
  };
  // A citation chip reads "Author Year"; the stored text keeps [CITE:id].
  const citationLabel = (id: string) => {
    const e = evidence.find((x) => x.id === id);
    if (!e) return `Unknown source (${id})`;
    const surname = e.author.split(/[ ,]/).filter(Boolean)[0] || e.author;
    const retracted = referenceRecords[id]?.integrity?.status === "retracted" ? " · retracted" : "";
    return `${surname}${/et al\.$/.test(e.author) ? " et al." : ""}, ${e.year ?? "n.d."}${retracted}`;
  };

  const canDraft = Boolean((answers["working_title"] || answers["title"] || answers["core_problem"] || "").trim());

  const draft = async (guidance: string) => {
    if (!unit || !pid) return;
    const targetId = unit.id;
    if (countWords(texts.texts[targetId]) > 0) {
      const ok = await requestAppConfirm({
        title: `Replace ${heading}?`,
        message: "The AI draft will replace the text you have in this section. This can't be undone.",
        confirmLabel: "Replace",
        variant: "danger",
      });
      if (!ok) return;
    }
    setBusy("draft");
    setError(null);
    try {
      const ctx = writtenContext(units, texts, targetId);
      const contextPrompt = [
        SECTION_GUIDANCE[unit.kind],
        guidance.trim() ? `Author guidance: ${guidance.trim()}` : "",
        ctx ? `Sections the author has already written. Stay consistent with them and do not contradict their methods or results:\n${ctx}` : "",
      ].filter(Boolean).join("\n\n");
      const res = await draftProjectSubSection(pid, {
        sectionId: unit.sectionId,
        subSectionId: unit.id,
        subSectionTitle: unit.isWholeSection ? unit.title : `${unit.sectionTitle}: ${unit.title}`,
        targetWords: unit.targetWords,
        dialect,
        contextPrompt,
        assignedSources: unitEvidence.map((e) => ({
          id: e.id,
          authors: e.author,
          year: e.year ?? "n.d.",
          title: e.title,
          doi: e.doi,
          keyFindings: e.findings || undefined,
        })),
      });
      if (res?.content?.trim()) setActiveText(res.content.trim(), targetId);
      else setError("The AI returned no text. Nothing was changed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The section could not be drafted.");
    } finally {
      setBusy(null);
    }
  };

  const startPolish = async () => {
    if (!pid || !value.trim()) return;
    const selected = editorRef.current?.selectedText() || value;
    setBusy("polish");
    setError(null);
    try {
      const res = await polishProjectManuscript(pid, { text: selected, dialect });
      if (res?.polishedText?.trim()) setPolish({ original: selected, revised: res.polishedText, notes: res.styleCorrections ?? [] });
      else setError("The polish returned no text. Nothing was changed.");
    } catch (err) {
      setError(err instanceof Error ? `Polish failed: ${err.message}` : "Polish failed.");
    } finally {
      setBusy(null);
    }
  };

  const applyPolish = () => {
    if (!polish) return;
    if (!value.includes(polish.original)) {
      setError("The text changed while it was being polished, so the polish was not applied. Select the passage and try again.");
      setPolish(null);
      return;
    }
    setActiveText(value.replace(polish.original, polish.revised));
    setPolish(null);
  };

  const showOutline = !focus;
  const showSources = !focus && sourcesOpen;

  return (
    <div className="h-full flex flex-col min-h-0 bg-[color:var(--surface-canvas)]">
      {/* Studio bar */}
      <div className="shrink-0 border-b border-[color:var(--border-subtle)] px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Mode 3 · Writing Studio</div>
          <h1 className="text-sm font-semibold text-[color:var(--text-primary)] truncate">
            {answers["working_title"] || answers["title"] || "Untitled article"}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs" aria-live="polite">
          <span className="tabular-nums text-[color:var(--text-secondary)]">
            <strong className="text-[color:var(--text-primary)]">{written.toLocaleString()}</strong> / {targetTotal.toLocaleString()} words
          </span>
          <span className={`text-[11px] ${saveStatus === "error" ? "text-[color:var(--state-danger)]" : "text-[color:var(--text-muted)]"}`}>
            {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Not saved" : "Saved"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => setReadAll((r) => !r)} aria-pressed={readAll} aria-label={readAll ? "Back to writing" : "Read manuscript"} className="studio-btn">
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden sm:inline">{readAll ? "Back to writing" : "Read manuscript"}</span>
          </button>
          <button type="button" onClick={() => setSourcesOpen((o) => !o)} aria-pressed={sourcesOpen} aria-label="Sources" className="studio-btn">
            <Library className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Sources</span>
          </button>
          <button type="button" onClick={() => setFocus((f) => !f)} aria-pressed={focus} aria-label={focus ? "Exit focus" : "Focus"} className="studio-btn">
            {focus ? <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />}
            <span className="hidden sm:inline">{focus ? "Exit focus" : "Focus"}</span>
          </button>
          <button type="button" onClick={() => setMode("evidence")} className="studio-btn" aria-label="Back to Evidence">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Evidence</span>
          </button>
          <button type="button" onClick={() => setMode("referee")} className="studio-btn studio-btn-primary" aria-label="Go to Review">
            <span className="hidden sm:inline">Review</span> <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {showOutline && (
          <aside className="hidden md:flex w-64 shrink-0 overflow-hidden border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/40 min-h-0">
            <StudioOutline units={units} texts={texts} activeId={activeId} order={order} onOrderChange={setOrder} onSelect={(id) => { setActiveId(id); setReadAll(false); }} />
          </aside>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto">
          {/* Phones: the outline as a picker */}
          <div className="md:hidden px-4 pt-4">
            <label htmlFor="studio-section-picker" className="sr-only">Section</label>
            <select
              id="studio-section-picker"
              value={activeId}
              onChange={(e) => { setActiveId(e.target.value); setReadAll(false); }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]"
            >
              {texts.unsorted.trim() && <option value={UNSORTED_ID}>Text from your earlier draft</option>}
              {groupUnits(units, order).map((g) => (
                <optgroup key={g.sectionId} label={g.sectionTitle}>
                  {g.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.isWholeSection ? u.title : u.title} ({countWords(texts.texts[u.id])}/{u.targetWords})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {readAll ? (
            <article aria-label="Full manuscript" className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
              {manuscript.trim() ? (
                <div className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-[color:var(--text-primary)]">{manuscript}</div>
              ) : (
                <p className="text-sm text-[color:var(--text-muted)]">Nothing written yet. Sections appear here as you write them.</p>
              )}
            </article>
          ) : (
            <>
              <StudioSectionEditor
                key={activeId}
                unit={unit}
                heading={heading}
                value={value}
                onChange={(v) => setActiveText(v)}
                editorRef={editorRef}
                citationLabel={citationLabel}
                onDraft={(g) => void draft(g)}
                onPolish={() => void startPolish()}
                onInsertText={insertText}
                busy={busy}
                canDraft={canDraft}
                draftBlocker="Set your research question or working title in Blueprint first, so the AI knows what the article is about."
              />
              {error && (
                <p role="alert" className="max-w-3xl mx-auto px-4 sm:px-8 -mt-2 pb-4 text-xs text-[color:var(--state-danger)]">{error}</p>
              )}
              {next && next.id !== activeId && (
                <div className="max-w-3xl mx-auto px-4 sm:px-8 pb-10">
                  <button
                    type="button"
                    onClick={() => setActiveId(next.id)}
                    className="text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                  >
                    Next in writing order: {next.isWholeSection ? next.title : `${next.sectionTitle} › ${next.title}`} →
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        {showSources && (
          <>
            <div className="fixed inset-0 z-[45] bg-black/40 2xl:hidden" aria-hidden="true" onClick={() => setSourcesOpen(false)} />
            <aside
              aria-label="Sources panel"
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm flex flex-col bg-[color:var(--surface-canvas)] shadow-2xl 2xl:static 2xl:z-auto 2xl:shadow-none 2xl:w-80 2xl:shrink-0 border-l border-[color:var(--border-subtle)] min-h-0"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--border-subtle)] 2xl:hidden">
                <span className="text-xs font-semibold text-[color:var(--text-primary)]">Sources</span>
                <button type="button" onClick={() => setSourcesOpen(false)} aria-label="Close sources" className="p-1 rounded-md hover:bg-[color:var(--surface-hover)] cursor-pointer">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <StudioEvidencePanel
                forUnit={unitEvidence}
                all={evidence}
                manuscript={manuscript}
                onInsert={insertCitation}
                onGoToEvidence={() => setMode("evidence")}
                figures={figures}
                onInsertText={(t) => insertText(` ${t}`)}
              />
            </aside>
          </>
        )}
      </div>

      {polish && (
        <div role="dialog" aria-modal="true" aria-labelledby="polish-heading" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] shadow-2xl">
            <div className="px-5 py-3 border-b border-[color:var(--border-subtle)] flex items-center justify-between">
              <h3 id="polish-heading" className="text-sm font-semibold text-[color:var(--text-primary)]">Polished text: review before applying</h3>
              <button type="button" onClick={() => setPolish(null)} aria-label="Close" className="p-1 rounded-md hover:bg-[color:var(--surface-hover)] cursor-pointer">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-4 p-5 overflow-y-auto text-sm leading-relaxed">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-1">Yours</div>
                <p className="whitespace-pre-wrap text-[color:var(--text-secondary)]">{polish.original}</p>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-1">Polished</div>
                <p className="whitespace-pre-wrap text-[color:var(--text-primary)]">{polish.revised}</p>
              </div>
              {polish.notes.length > 0 && (
                <ul className="md:col-span-2 list-disc pl-5 text-xs text-[color:var(--text-muted)]">
                  {polish.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[color:var(--border-subtle)] flex justify-end gap-2">
              <button type="button" onClick={() => setPolish(null)} className="studio-btn">Keep mine</button>
              <button type="button" onClick={applyPolish} className="studio-btn studio-btn-primary">Apply polished text</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
