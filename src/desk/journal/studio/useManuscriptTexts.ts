import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveIntakeAnswers } from "../../api";
import type { ProjectView } from "../../types";
import {
  assembleManuscript,
  reconcileTexts,
  resolveTexts,
  serializeTexts,
  type ManuscriptTexts,
  type ManuscriptUnit,
} from "../../../domain/journal/manuscriptModel";
import { manuscriptAnswerPatch, readManuscriptMarkdown } from "../../../domain/journal/manuscriptText";
import type { AutosaveState } from "../../../components/ui/WorkspaceAutosaveBadge";

export const SAVE_DEBOUNCE_MS = 800;

/**
 * The Writing Studio's text, section by section, and its saving.
 *
 * - Edits are saved after a short pause, and at once when the studio closes,
 *   the tab is hidden or the page unloads, so leaving never drops an edit.
 * - Only the newest save may update the project; an older response that
 *   arrives late is ignored.
 * - A change made elsewhere (a referee patch, a Delivery edit) is picked up
 *   whenever there is no unsaved edit here.
 */
export function useManuscriptTexts({
  projectId,
  answers,
  units,
  setProject,
}: {
  projectId: string | null | undefined;
  answers: Record<string, unknown>;
  units: ManuscriptUnit[];
  setProject: (p: ProjectView) => void;
}) {
  const storedMarkdown = useMemo(() => readManuscriptMarkdown(answers), [answers]);
  const rawSections = answers["manuscript_sections"];

  const [texts, setTexts] = useState<ManuscriptTexts>(() => resolveTexts(rawSections, storedMarkdown, units));
  const [saveStatus, setSaveStatus] = useState<AutosaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const textsRef = useRef(texts);
  const unitsRef = useRef(units);
  const answersRef = useRef(answers);
  unitsRef.current = units;
  answersRef.current = answers;
  /** An edit here that is not saved yet (pending or failed). */
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const inFlight = useRef(0);
  const mounted = useRef(true);
  /** The manuscript markdown this studio last loaded or saved. */
  const synced = useRef<string>(storedMarkdown);

  const replaceTexts = useCallback((next: ManuscriptTexts) => {
    textsRef.current = next;
    setTexts(next);
  }, []);

  // Follow the saved project (it may still be loading, or another view changed it)
  // whenever nothing typed here is waiting to be saved.
  useEffect(() => {
    if (dirty.current || storedMarkdown === synced.current) return;
    synced.current = storedMarkdown;
    replaceTexts(resolveTexts(rawSections, storedMarkdown, unitsRef.current));
  }, [storedMarkdown, rawSections, replaceTexts]);

  // If the outline changes, text under a removed section is kept as unsorted text.
  useEffect(() => {
    const next = reconcileTexts(textsRef.current, units);
    if (next !== textsRef.current) replaceTexts(next);
  }, [units, replaceTexts]);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current || !projectId) return;
    dirty.current = false;
    const mine = ++seq.current;
    const t = textsRef.current;
    const md = assembleManuscript(unitsRef.current, t);
    synced.current = md;
    inFlight.current += 1;
    if (mounted.current) setSaveStatus("saving");
    saveIntakeAnswers(projectId, { manuscript_sections: serializeTexts(t), ...manuscriptAnswerPatch(md, answersRef.current) })
      .then((saved) => {
        if (mine !== seq.current) return; // a newer save is on its way
        if (saved) setProject(saved);
        if (mounted.current && !dirty.current) {
          setSaveStatus("saved");
          setLastSavedAt(new Date());
        }
      })
      .catch(() => {
        if (mine !== seq.current) return;
        dirty.current = true; // the next edit, Retry or leaving sends it again
        if (mounted.current) setSaveStatus("error");
      })
      .finally(() => {
        inFlight.current -= 1;
      });
  }, [projectId, setProject]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  /** Set one unit's text (or the unsorted text with id null) and schedule a save. */
  const setUnitText = useCallback(
    (id: string | null, text: string) => {
      const t = textsRef.current;
      const next = id === null ? { ...t, unsorted: text } : { ...t, texts: { ...t.texts, [id]: text } };
      replaceTexts(next);
      dirty.current = true;
      setSaveStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flushRef.current(), SAVE_DEBOUNCE_MS);
    },
    [replaceTexts]
  );

  // Never leave with an edit unsaved: flush on close, on a hidden tab, and warn on unload.
  useEffect(() => {
    mounted.current = true;
    const onHide = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current && inFlight.current === 0) return;
      flushRef.current();
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      mounted.current = false;
      flushRef.current();
    };
  }, []);

  const retry = useCallback(() => {
    dirty.current = true;
    flushRef.current();
  }, []);

  return { texts, setUnitText, saveStatus, lastSavedAt, retry, flush };
}
