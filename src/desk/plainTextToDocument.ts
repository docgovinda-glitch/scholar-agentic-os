/**
 * Turns pasted plain text into a minimal CanonicalDocument: one paragraph
 * block per blank-line-separated chunk. This is NOT the real editor/importer
 * (app/ingestion, still unbuilt — 13 §8.1) — it exists only so Desk's Primary
 * and Compliance panels have something real to render before that exists.
 * No heading detection, no rich formatting; every block is "paragraph".
 */

import type { Block, CanonicalDocument } from "./types";

let counter = 0;
function nextBlockId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter}`;
}

export function plainTextToDocument(id: string, title: string, text: string): CanonicalDocument {
  const blocks: Block[] = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => ({ id: nextBlockId(), kind: "paragraph" as const, text: chunk }));
  return { id, title, blocks };
}
