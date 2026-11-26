import { useCallback, useEffect, useRef } from 'react';
import type { SlideDeck } from '../../features/slides';
import { authedFetch } from '../api';
import { DEFAULT_DECK_THEME_ID } from '../../features/slides/gamma/theme';

export type AutosaveStatus = 'saved' | 'saving' | 'idle' | 'error' | 'signed-out';

export const AUTOSAVE_DEBOUNCE_MS = 500;

interface Options {
  projectId?: string;
  signedIn: boolean;
  onStatus: (status: AutosaveStatus) => void;
  /** Called after each successful save with the project's new version, when the server sent one. */
  onSaved: (info: { version?: number; at: Date }) => void;
}

/**
 * Saves the deck a moment after the last edit.
 *
 * - One save runs at a time, and it always sends the newest deck: a slow
 *   earlier request can never land after (and overwrite) a later one.
 * - The project save is the one that counts: "saved" is reported only when it
 *   succeeded. The mirror to /api/presentations is best effort.
 * - Leaving the screen sends a pending edit instead of dropping it.
 */
export function useDeckAutosave({ projectId, signedIn, onStatus, onSaved }: Options) {
  // The deck waiting to be sent, with the project it belongs to (the open project may change before it is sent).
  const pending = useRef<{ deck: SlideDeck; projectId: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  // The latest options, so a save that runs later (or after unmount) reports to the current handlers.
  const opts = useRef({ projectId, signedIn, onStatus, onSaved });
  opts.current = { projectId, signedIn, onStatus, onSaved };

  const saveOnce = async (deck: SlideDeck, id: string): Promise<boolean> => {
    const headers = { 'Content-Type': 'application/json' };
    const project = await authedFetch(`/api/projects/${encodeURIComponent(id)}/presentation/deck`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ deck }),
    });
    if (!project.ok) return false;
    let version: number | undefined;
    try {
      const data = (await project.json()) as { version?: number };
      if (typeof data.version === 'number') version = data.version;
    } catch {
      // The save worked; only the version number could not be read.
    }
    opts.current.onSaved({ version, at: new Date() });
    // Unified access for the standalone deck list; the project save above is what counts.
    authedFetch(`/api/presentations/${encodeURIComponent(deck.id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        title: deck.title,
        topic: deck.topic,
        framework: deck.framework,
        theme_id: deck.themeId || DEFAULT_DECK_THEME_ID,
        custom_theme: deck.customTheme,
        slides: deck.slides,
        source_module: deck.sourceModule || 'presentation-studio',
      }),
    }).catch(() => {});
    return true;
  };

  const run = useCallback(async () => {
    if (running.current) return; // the running save picks up the newest deck when it finishes
    running.current = true;
    let ok = true;
    try {
      while (pending.current) {
        const job = pending.current;
        pending.current = null;
        try {
          ok = await saveOnce(job.deck, job.projectId);
        } catch {
          ok = false;
        }
        if (!ok) {
          // Keep the unsaved deck for the next attempt unless a newer edit already replaced it.
          pending.current ??= job;
          break;
        }
      }
    } finally {
      running.current = false;
      opts.current.onStatus(ok ? (pending.current ? 'saving' : 'saved') : 'error');
    }
  }, []);

  /** Send what is waiting now instead of after the pause. */
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current && opts.current.signedIn) void run();
  }, [run]);

  const schedule = useCallback(
    (deck: SlideDeck) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      // A signed-out visitor's deck lives only in this tab: say so instead of calling the server.
      if (!opts.current.signedIn || !opts.current.projectId) {
        opts.current.onStatus('signed-out');
        return;
      }
      pending.current = { deck, projectId: opts.current.projectId };
      opts.current.onStatus('saving');
      timer.current = setTimeout(() => {
        timer.current = null;
        void run();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [run]
  );

  // Leaving the screen (or switching project) sends the last edit rather than dropping it.
  useEffect(() => flush, [flush, projectId]);

  return { schedule, flush };
}
