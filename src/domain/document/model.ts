/**
 * The Canonical Document Model (CDM).
 *
 * Spec: docs/01-product/13-MODULE-SPECIFICATIONS.md `domain/document`,
 *       docs/00-foundation/02-GLOSSARY.md §5.
 *
 * Format-agnostic internal representation of document structure and
 * content. Every parser (app/ingestion) converts INTO this; every writer
 * (app/export) converts OUT of it. It has no I/O — pure data and pure
 * functions over that data — which is what lets it compile identically for
 * the browser editor and the service tier (see 13-MODULE-SPECIFICATIONS.md
 * §2's "L4 runs in the browser, L0–L3 run server-side; domain/* compiles
 * for both").
 *
 * SCOPE, STATED HONESTLY: this V1 models a document as an ordered list of
 * blocks, each holding a single plain-text run. It does not yet model rich
 * inline formatting (bold/italic spans, footnotes, embedded citations as
 * distinct inline nodes) — those are additive to the `Block.text` shape and
 * are the next extension, not a redesign, when the editor (Phase 1 client
 * work) needs them. It is already sufficient for what depends on it today:
 * the Language & Voice Studio, which addresses and rewrites plain-text
 * passages within a block.
 */

export type BlockKind =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "quote"
  | "list-item";

export interface Block {
  id: string;
  kind: BlockKind;
  text: string;
}

export interface CanonicalDocument {
  id: string;
  title: string;
  blocks: Block[];
  /** Document-level declarations (e.g. "data availability statement", "ethics approval reference") — the `metadata` Rule type (docs 31 §3.1) checks presence here, not in a block. Optional so every existing caller that predates this field keeps working unchanged. */
  metadata?: Record<string, string>;
}

/** A position within a document, addressed by block + character offset. */
export interface DocPosition {
  blockId: string;
  offset: number;
}

/** A contiguous range within a single block. Cross-block ranges are out of
 * scope for V1 — callers needing to address multiple blocks operate on each
 * block's range separately, which is sufficient for the Studio's per-passage
 * model (docs 32-LANGUAGE-AND-VOICE-ARCHITECTURE.md operates section- or
 * paragraph-scoped, never cross-block). */
export interface BlockRange {
  blockId: string;
  start: number;
  end: number;
}

export function emptyDocument(id: string, title: string): CanonicalDocument {
  return { id, title, blocks: [] };
}

export function findBlock(doc: CanonicalDocument, blockId: string): Block | undefined {
  return doc.blocks.find((b) => b.id === blockId);
}

export function blockIndex(doc: CanonicalDocument, blockId: string): number {
  return doc.blocks.findIndex((b) => b.id === blockId);
}
