import { Extension } from "@tiptap/core";

/**
 * A `blockId` attribute on every node type the Canonical Document Model
 * (domain/document/model.ts) has a block kind for — paragraph, heading,
 * blockquote, listItem — rendered as BOTH `data-block-id` and a real `id`
 * so it survives ProseMirror's own HTML round-trip. The `id` is what keeps
 * Rail's onJumpToBlock (`document.getElementById(blockId)`) working exactly
 * as it did against the old read-only BlockView, which rendered the same
 * `id={block.id}` directly. This is also what lets cdmTiptap.ts map a
 * TipTap document back onto the SAME Block ids it started with, rather than
 * regenerating every id on every save: the Rubric's position_in_text
 * evaluator and G3's exit criteria both key off block ids staying stable
 * across an edit that didn't touch that block.
 *
 * Stability isn't absolute — ProseMirror's own splitBlock command copies a
 * node's attrs onto both halves of a split, which would hand out the same
 * blockId twice. cdmTiptap.ts's tiptapToDocument() is the actual guarantee:
 * it deduplicates on the way out, assigning a fresh id to any blockId it's
 * already seen in this document, so a split's second half — the new block —
 * always gets a genuinely new id even though ProseMirror momentarily gave it
 * a stale copy.
 */
export const BlockId = Extension.create({
  name: "blockId",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "blockquote", "listItem"],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-block-id"),
            renderHTML: (attributes: { blockId?: string | null }) =>
              attributes.blockId ? { "data-block-id": attributes.blockId, id: attributes.blockId } : {},
          },
        },
      },
    ];
  },
});
