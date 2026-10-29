import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlideDeck } from '../types/slides';

const LIMIT = 60;
/** Edits of the same kind within this window collapse into one undo step. */
const COALESCE_MS = 1000;

export interface DeckHistory {
  /** Commit a change, recording the current deck as an undo step. */
  apply: (next: SlideDeck, kind?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Undo/redo over whole-deck snapshots. Decks are immutable values, so a
 * snapshot is just a reference. Typing bursts (same `kind`, e.g. one card's
 * notes) coalesce into a single step.
 */
export function useDeckHistory(deck: SlideDeck, onUpdateDeck: (d: SlideDeck) => void): DeckHistory {
  const past = useRef<SlideDeck[]>([]);
  const future = useRef<SlideDeck[]>([]);
  const last = useRef<{ kind?: string; at: number }>({ at: 0 });
  const current = useRef(deck);
  const [, force] = useState(0);
  current.current = deck;

  const apply = useCallback(
    (next: SlideDeck, kind?: string) => {
      const now = Date.now();
      const coalesce = kind !== undefined && kind === last.current.kind && now - last.current.at < COALESCE_MS;
      if (!coalesce) {
        past.current.push(current.current);
        if (past.current.length > LIMIT) past.current.shift();
      }
      future.current = [];
      last.current = { kind, at: now };
      onUpdateDeck(next);
      force((n) => n + 1);
    },
    [onUpdateDeck],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(current.current);
    last.current = { at: 0 };
    onUpdateDeck({ ...prev, updatedAt: new Date().toISOString() });
    force((n) => n + 1);
  }, [onUpdateDeck]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    last.current = { at: 0 };
    onUpdateDeck({ ...next, updatedAt: new Date().toISOString() });
    force((n) => n + 1);
  }, [onUpdateDeck]);

  // ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y. Text fields keep their own native undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /input|textarea|select/i.test(t.tagName))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { apply, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
