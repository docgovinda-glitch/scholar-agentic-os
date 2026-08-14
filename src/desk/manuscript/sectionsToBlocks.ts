import type { Block, GeneratedSection } from "../types";

let counter = 0;
function nextBlockId(): string {
  counter += 1;
  return `gen${Date.now().toString(36)}${counter}`;
}

/**
 * Converts completed generation-engine sections into document blocks — a
 * heading2 titling each section, then one paragraph block per blank-line-
 * separated chunk of its text (same paragraph-splitting convention
 * plainTextToDocument.ts already uses, so both bootstrap paths produce the
 * same block shape). Called only from an explicit "Insert into document"
 * action (ManuscriptGenerationPanel), never automatically.
 */
export function sectionsToBlocks(sections: GeneratedSection[]): Block[] {
  const blocks: Block[] = [];
  for (const section of sections) {
    blocks.push({ id: nextBlockId(), kind: "heading2", text: section.title });
    for (const chunk of section.text.split(/\n\s*\n/)) {
      const trimmed = chunk.trim();
      if (trimmed.length > 0) blocks.push({ id: nextBlockId(), kind: "paragraph", text: trimmed });
    }
  }
  return blocks;
}
