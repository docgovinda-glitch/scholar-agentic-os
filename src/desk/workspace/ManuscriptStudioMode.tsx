import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Library, Maximize2, Minimize2, RotateCw, X } from "lucide-react";
import type { WordBudgetBlueprint } from "./types";
import { useResearchWorkspace } from "./ResearchContext";
import { draftProjectSubSection, polishProjectManuscript } from "../api";
import { normalizeUnicodeNFC } from "../../document_intelligence/index";
import { safeParseAnswerField } from "../../shared/projectStateSchema";
import { requestAppConfirm } from "../../components/ui/FeedbackSystem";
import type { AutosaveState } from "../../components/ui/WorkspaceAutosaveBadge";
import {
  assembleManuscript,
  countWords,
  groupUnits,
  isDefaultOutline,
  manuscriptUnits,
  nextToWrite,
  SECTION_GUIDANCE,
  totalWords,
  unitLabel,
  writtenContext,
} from "../../domain/journal/manuscriptModel";
import { journalTargetWords } from "../../domain/journal/manuscriptText";
import { draftingSources, evidenceFor, studioEvidence } from "../../domain/journal/studioEvidence";
import { parseReferenceRecords } from "../../domain/journal/references";
import { numberFigures, parseFigures } from "../../domain/journal/figures";
import StudioOutline, { UNSORTED_ID } from "../journal/studio/StudioOutline";
import StudioEvidencePanel from "../journal/studio/StudioEvidencePanel";
import StudioSectionEditor from "../journal/studio/StudioSectionEditor";
import ManuscriptReader from "../journal/studio/ManuscriptReader";
import PolishDialog from "../journal/studio/PolishDialog";
import { useManuscriptTexts } from "../journal/studio/useManuscriptTexts";
import type { SectionEditorHandle } from "../editor/SectionTextEditor";

const wide = () => typeof window !== "undefined" && window.innerWidth >= 1536;

interface PendingPolish {
  unitId: string;
  original: string;
  revised: string;
  notes: string[];
  /** The selected range; null when the whole section was polished. */
  range: { from: number; to: number } | null;
}

/**
 * Mode 3, the Writing Studio: the manuscript one section at a time, with the
 * outline on the left (in article order or the order authors usually write)
 * and the section's sources on the right. The writing column gets the room.
 *
 * Focus is the workspace's focus mode (header button, Esc to leave) when the
 * workspace passes it; otherwise the studio keeps its own.
 */
export default function ManuscriptStudioMode({
  focus: focusProp,
  onToggleFocus,
  onSaveStatusChange,
}: {
  focus?: boolean;
  onToggleFocus?: () => void;
  onSaveStatusChange?: (status: AutosaveState) => void;
} = {}) {
  const { project, projectId, setProject, setMode } = useResearchWorkspace();
  const pid = project?.projectId || projectId;
  const answers = useMemo<Record<string, string>>(() => project?.answers || {}, [project?.answers]);

  const blueprintRaw = answers["word_budget_blueprint"];
  const blueprint = useMemo(() => {
    const bp = safeParseAnswerField<WordBudgetBlueprint | null>(blueprintRaw, null);
    return bp && Array.isArray(bp.sections) && bp.sections.length > 0 ? bp : null;
  }, [blueprintRaw]);
  const targetTotal = useMemo(() => journalTargetWords(answers), [answers]);
  const units = useMemo(() => manuscriptUnits(blueprint, targetTotal), [blueprint, targetTotal]);

  const { texts, setUnitText, saveStatus, lastSavedAt, retry } = useManuscriptTexts({ projectId: pid, answers, units, setProject });
  const latestTexts = useRef(texts);
  latestTexts.current = texts;
  useEffect(() => onSaveStatusChange?.(saveStatus), [saveStatus, onSaveStatusChange]);
  useEffect(() => () => onSaveStatusChange?.("saved"), [onSaveStatusChange]);

  const [activeId, setActiveId] = useState<string>(() => nextToWrite(units, texts)?.id || units[0]?.id || UNSORTED_ID);
  useEffect(() => {
    if (activeId !== UNSORTED_ID && !units.some((u) => u.id === activeId)) {
      setActiveId(nextToWrite(units, latestTexts.current)?.id || units[0]?.id || UNSORTED_ID);
    }
  }, [units, activeId]);
  const unit = activeId === UNSORTED_ID ? null : units.find((u) => u.id === activeId) ?? null;
  const value = unit ? texts.texts[unit.id] ?? "" : texts.unsorted;
  const heading = unit ? unit.title : "Text from your earlier draft";

  const [order, setOrder] = useState<"manuscript" | "writing">("writing");
  const [localFocus, setLocalFocus] = useState(false);
  const focus = focusProp ?? localFocus;
  const toggleFocus = onToggleFocus ?? (() => setLocalFocus((f) => !f));
  useEffect(() => {
    if (focusProp !== undefined || !localFocus) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLocalFocus(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusProp, localFocus]);
  const [sourcesOpen, setSourcesOpen] = useState(wide);
  const [readAll, setReadAll] = useState(false);
  const [busy, setBusy] = useState<"draft" | "polish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polish, setPolish] = useState<PendingPolish | null>(null);
  const [guidance, setGuidance] = useState<Record<string, string>>({});
  const [restore, setRestore] = useState<{ unitId: string; text: string; label: string } | null>(null);
  const editorRef = useRef<SectionEditorHandle | null>(null);

  // What is read across the whole manuscript (references, figure numbers, totals)
  // follows the text a moment behind typing, so typing stays fast in long manuscripts.
  const deferredTexts = useDeferredValue(texts);
  const manuscript = useMemo(() => assembleManuscript(units, deferredTexts), [units, deferredTexts]);
  const written = useMemo(() => totalWords(deferredTexts), [deferredTexts]);

  const dialect: "en-GB" | "en-US" = answers["orthography"]?.includes("US") ? "en-US" : "en-GB";
  // Re-read the sources only when a source list changes, not on every saved keystroke.
  const datasetsRaw = answers["user_datasets"];
  const dataEntriesRaw = answers["user_data_entries"];
  const approvedRaw = answers["approved_vault_sources"];
  const vaultRaw = answers["vault_sources"];
  const evidence = useMemo(
    () => studioEvidence({ user_datasets: datasetsRaw, user_data_entries: dataEntriesRaw, approved_vault_sources: approvedRaw, vault_sources: vaultRaw }),
    [datasetsRaw, dataEntriesRaw, approvedRaw, vaultRaw]
  );
  const recordsRaw = answers["reference_records"];
  const figuresRaw = answers["manuscript_figures"];
  const referenceRecords = useMemo(() => parseReferenceRecords(recordsRaw), [recordsRaw]);
  const figures = useMemo(() => parseFigures(figuresRaw), [figuresRaw]);
  const figureNumbers = useMemo(() => numberFigures(manuscript, figures), [manuscript, figures]);
  const unitEvidence = useMemo(
    () => (unit ? evidenceFor(evidence, unit.id, unit.sectionId, unit.assignedSourceIds) : []),
    [evidence, unit]
  );
  const next = nextToWrite(units, texts);

  const setActiveText = useCallback(
    (nextText: string, id: string = activeId) => setUnitText(id === UNSORTED_ID ? null : id, normalizeUnicodeNFC(nextText)),
    [activeId, setUnitText]
  );

  const insertText = (text: string) => editorRef.current?.insertText(text);
  const insertCitation = useCallback((token: string) => {
    const id = token.match(/^\[CITE:(.+)\]$/)?.[1];
    if (id) editorRef.current?.insertCitation(id);
  }, []);
  const insertFigureRef = useCallback((t: string) => editorRef.current?.insertText(` ${t}`), []);
  const goToEvidence = useCallback(() => setMode("evidence"), [setMode]);

  // A citation chip reads "Author, Year"; the stored text keeps [CITE:id].
  const citationLabel = useCallback(
    (id: string) => {
      const e = evidence.find((x) => x.id === id);
      if (!e) return `Unknown source (${id})`;
      const surname = e.author.split(/[ ,]/).filter(Boolean)[0] || e.author;
      const retracted = referenceRecords[id]?.integrity?.status === "retracted" ? " · retracted" : "";
      return `${surname}${/et al\.$/.test(e.author) ? " et al." : ""}, ${e.year ?? "n.d."}${retracted}`;
    },
    [evidence, referenceRecords]
  );
  const figureLabel = useCallback(
    (token: string) => {
      const id = token.match(/^\[(?:FIG|TAB):(.+)\]$/)?.[1] ?? "";
      return figureNumbers.label[id] ?? (token.startsWith("[TAB") ? "Table" : "Figure");
    },
    [figureNumbers]
  );

  const canDraft = Boolean((answers["working_title"] || answers["title"] || answers["core_problem"] || "").trim());

  const draft = async () => {
    if (!unit || !pid) return;
    const target = unit;
    if (countWords(latestTexts.current.texts[target.id]) > 0) {
      const ok = await requestAppConfirm({
        title: `Replace ${target.title}?`,
        message: "The AI draft will replace the text you have in this section. You can restore your text afterwards.",
        confirmLabel: "Replace",
        variant: "danger",
      });
      if (!ok) return;
    }
    setBusy("draft");
    setError(null);
    try {
      const res = await draftProjectSubSection(pid, {
        sectionId: target.sectionId,
        subSectionId: target.id,
        subSectionTitle: unitLabel(target, ": "),
        targetWords: target.targetWords,
        dialect,
        sectionBrief: SECTION_GUIDANCE[target.kind] || undefined,
        authorGuidance: guidance[target.id]?.trim() || undefined,
        writtenSections: writtenContext(units, latestTexts.current, target.id) || undefined,
        assignedSources: draftingSources(evidenceFor(evidence, target.id, target.sectionId, target.assignedSourceIds)),
      });
      const content = res?.content?.trim();
      if (!content) {
        setError("The AI returned no text. Nothing was changed.");
        return;
      }
      const previous = latestTexts.current.texts[target.id] ?? "";
      setActiveText(content, target.id);
      if (previous.trim()) setRestore({ unitId: target.id, text: previous, label: "The AI draft replaced your text in this section." });
      else setRestore(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The section could not be drafted.");
    } finally {
      setBusy(null);
    }
  };

  const startPolish = async () => {
    if (!pid || !value.trim()) return;
    const sel = editorRef.current?.selection() ?? null;
    const original = sel?.text ?? value;
    const unitId = activeId;
    setBusy("polish");
    setError(null);
    try {
      const res = await polishProjectManuscript(pid, { text: original, dialect });
      if (res?.polishedText?.trim()) {
        setPolish({ unitId, original, revised: res.polishedText, notes: res.styleCorrections ?? [], range: sel ? { from: sel.from, to: sel.to } : null });
      } else {
        setError("The polish returned no text. Nothing was changed.");
      }
    } catch (err) {
      setError(err instanceof Error ? `Polish failed: ${err.message}` : "Polish failed.");
    } finally {
      setBusy(null);
    }
  };

  const applyPolish = () => {
    if (!polish) return;
    const stale = "The text changed while it was being polished, so the polish was not applied. Select the passage and try again.";
    if (polish.unitId !== activeId) {
      setError(stale);
      setPolish(null);
      return;
    }
    const previous = value;
    const applied = polish.range
      ? Boolean(editorRef.current?.replaceRange(polish.range.from, polish.range.to, polish.original, normalizeUnicodeNFC(polish.revised)))
      : value === polish.original && (setActiveText(polish.revised), true);
    if (!applied) setError(stale);
    else setRestore({ unitId: polish.unitId, text: previous, label: "Polished text applied." });
    setPolish(null);
  };
  const closePolish = useCallback(() => setPolish(null), []);

  const selectUnit = useCallback((id: string) => {
    setActiveId(id);
    setReadAll(false);
    setError(null);
  }, []);

  const showOutline = !focus;
  const showSources = !focus && sourcesOpen;
  const restoreHere = restore && restore.unitId === activeId ? restore : null;

  return (
    <div className="h-full flex flex-col min-h-0 bg-[color:var(--surface-canvas)]">
      {/* Studio bar: progress and save state on the left; views, then the way to the next mode, on the right. */}
      <div className="shrink-0 border-b border-[color:var(--border-subtle)] px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 flex items-center gap-3 text-xs" aria-live="polite">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Writing Studio</span>
          <span className="tabular-nums text-[color:var(--text-secondary)]">
            <strong className="text-[color:var(--text-primary)]">{written.toLocaleString()}</strong> / {targetTotal.toLocaleString()} words
          </span>
          {saveStatus === "error" ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--state-danger)]">
              Not saved
              <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-semibold underline cursor-pointer">
                <RotateCw className="w-3 h-3" aria-hidden="true" /> Retry
              </button>
            </span>
          ) : (
            <span className="text-[11px] text-[color:var(--text-muted)]">
              {saveStatus === "saving"
                ? "Saving…"
                : lastSavedAt
                ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Saved"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <div role="group" aria-label="View" className="flex items-center gap-1.5">
            <button type="button" onClick={() => setReadAll((r) => !r)} aria-pressed={readAll} aria-label={readAll ? "Back to writing" : "Read manuscript"} className="studio-btn">
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden sm:inline">{readAll ? "Back to writing" : "Read manuscript"}</span>
            </button>
            <button type="button" onClick={() => setSourcesOpen((o) => !o)} aria-pressed={sourcesOpen} aria-label="Sources" className="studio-btn">
              <Library className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Sources</span>
            </button>
            <button type="button" onClick={toggleFocus} aria-pressed={focus} aria-label={focus ? "Exit focus" : "Focus"} title={focus ? "Exit focus (Esc)" : "Focus"} className="studio-btn">
              {focus ? <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />}
              <span className="hidden sm:inline">{focus ? "Exit focus" : "Focus"}</span>
            </button>
          </div>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-[color:var(--border-subtle)]" />
          <nav aria-label="Workflow" className="flex items-center gap-1.5">
            <button type="button" onClick={goToEvidence} className="studio-btn" aria-label="Back to Evidence">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Evidence</span>
            </button>
            <button type="button" onClick={() => setMode("referee")} className="studio-btn studio-btn-primary" aria-label="Go to Review">
              <span className="hidden sm:inline">Review</span> <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>

      {isDefaultOutline(units) && !focus && (
        <p className="shrink-0 px-4 py-1.5 text-[11px] text-[color:var(--text-muted)] border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]">
          These are standard IMRaD sections with a share of your word target.{" "}
          <button type="button" onClick={() => setMode("protocol")} className="font-semibold underline text-[color:var(--text-secondary)] cursor-pointer">
            Set your own outline in Blueprint
          </button>
          .
        </p>
      )}

      <div className="flex-1 flex min-h-0">
        {showOutline && (
          <aside className="hidden md:flex w-64 shrink-0 overflow-hidden border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/40 min-h-0">
            <StudioOutline units={units} texts={deferredTexts} activeId={activeId} order={order} onOrderChange={setOrder} onSelect={selectUnit} />
          </aside>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto">
          {/* Phones and narrow windows: the outline as a picker */}
          <div className={`${showOutline ? "md:hidden" : ""} px-4 pt-4`}>
            <label htmlFor="studio-section-picker" className="sr-only">Section</label>
            <select
              id="studio-section-picker"
              value={activeId}
              onChange={(e) => selectUnit(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]"
            >
              {texts.unsorted.trim() && <option value={UNSORTED_ID}>Text from your earlier draft</option>}
              {groupUnits(units, order).map((g) => (
                <optgroup key={g.sectionId} label={g.sectionTitle}>
                  {g.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.title} ({countWords(texts.texts[u.id])}/{u.targetWords})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {readAll ? (
            <ManuscriptReader units={units} texts={deferredTexts} citationLabel={citationLabel} figureLabel={figureLabel} />
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
                onDraft={() => void draft()}
                onPolish={() => void startPolish()}
                onInsertText={insertText}
                busy={busy}
                canDraft={canDraft}
                draftBlocker="Set your research question or working title in Blueprint first, so the AI knows what the article is about."
                guidance={guidance[activeId] ?? ""}
                onGuidanceChange={(g) => setGuidance((m) => ({ ...m, [activeId]: g }))}
                restoreLabel={restoreHere?.label}
                onRestore={
                  restoreHere
                    ? () => {
                        setActiveText(restoreHere.text, restoreHere.unitId);
                        setRestore(null);
                      }
                    : undefined
                }
              />
              {error && (
                <p role="alert" className="max-w-3xl mx-auto px-4 sm:px-8 -mt-2 pb-4 text-xs text-[color:var(--state-danger)]">{error}</p>
              )}
              {next && next.id !== activeId && (
                <div className="max-w-3xl mx-auto px-4 sm:px-8 pb-10">
                  <button
                    type="button"
                    onClick={() => selectUnit(next.id)}
                    className="text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                  >
                    Next in writing order: {unitLabel(next)} →
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
                key={activeId}
                forUnit={unitEvidence}
                all={evidence}
                manuscript={manuscript}
                onInsert={insertCitation}
                onGoToEvidence={goToEvidence}
                figures={figures}
                onInsertText={insertFigureRef}
                records={referenceRecords}
                citationStyle={answers["citation_style"]}
              />
            </aside>
          </>
        )}
      </div>

      {polish && (
        <PolishDialog
          original={polish.original}
          revised={polish.revised}
          notes={polish.notes}
          scopeLabel={polish.range ? "the selected passage" : "the whole section"}
          onApply={applyPolish}
          onClose={closePolish}
        />
      )}
    </div>
  );
}
