/**
 * Bidirectional mapping between the Canonical Document Model
 * (domain/document/model.ts, mirrored client-side as desk/types.ts's
 * Block/CanonicalDocument) and TipTap's ProseMirror-backed JSON document.
 *
 * Deliberate, documented scope limit: the CDM's own module comment already
 * flags that rich inline formatting (bold/italic spans, footnotes, inline
 * citations) is "additive to Block.text... the next extension, not a
 * redesign, when the editor needs them" — i.e. anticipated, not yet built.
 * Building that now would ripple into Studio's plain-text diff pipeline,
 * every export format, and every Rubric evaluator that reads block.text as
 * a plain string — a genuinely separate, substantial piece of work. This
 * editor instead offers real STRUCTURAL editing (headings, paragraphs,
 * lists, blockquotes, reordering, undo/redo) with zero inline marks
 * available in the toolbar or the underlying TipTap config, so there is
 * nothing a user can apply here that would then be silently discarded on
 * save — a plain-text round trip stays lossless by construction, rather
 * than by hoping the user never tries to bold something.
 */

import type { JSONContent } from "@tiptap/core";
import type { Block, CanonicalDocument } from "../types";

function textContent(text: string): JSONContent[] {
  return text.length > 0 ? [{ type: "text", text }] : [];
}

function blockToNode(block: Block): JSONContent {
  switch (block.kind) {
    case "heading1":
      return { type: "heading", attrs: { level: 1, blockId: block.id }, content: textContent(block.text) };
    case "heading2":
      return { type: "heading", attrs: { level: 2, blockId: block.id }, content: textContent(block.text) };
    case "heading3":
      return { type: "heading", attrs: { level: 3, blockId: block.id }, content: textContent(block.text) };
    case "quote":
      return { type: "blockquote", attrs: { blockId: block.id }, content: [{ type: "paragraph", content: textContent(block.text) }] };
    case "list-item":
      return { type: "listItem", attrs: { blockId: block.id }, content: [{ type: "paragraph", content: textContent(block.text) }] };
    default:
      return { type: "paragraph", attrs: { blockId: block.id }, content: textContent(block.text) };
  }
}

/** CDM -> TipTap. Consecutive "list-item" blocks group into a single bulletList node, TipTap's own structural requirement (a listItem cannot exist outside a list). */
export function documentToTiptap(document: CanonicalDocument): JSONContent {
  const content: JSONContent[] = [];
  let i = 0;
  while (i < document.blocks.length) {
    const block = document.blocks[i];
    if (block.kind === "list-item") {
      const items: JSONContent[] = [];
      while (i < document.blocks.length && document.blocks[i].kind === "list-item") {
        items.push(blockToNode(document.blocks[i]));
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }
    content.push(blockToNode(block));
    i++;
  }
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

let freshIdCounter = 0;

/** A new block created during editing (e.g. pressing Enter) has no blockId attribute yet. */
function freshBlockId(): string {
  freshIdCounter += 1;
  return `blk-${Date.now().toString(36)}-${freshIdCounter}`;
}

function nodeText(node: JSONContent): string {
  if (!node.content) return "";
  return node.content
    .map((c) => (c.type === "text" ? (c.text ?? "") : c.type === "hardBreak" ? "\n" : ""))
    .join("");
}

/**
 * TipTap -> CDM. `seen` guards against ProseMirror's splitBlock handing the
 * same blockId to two nodes after a split (see blockIdExtension.ts's own
 * comment) — the second occurrence of any id is treated as absent and given
 * a fresh one, so every block in the returned document has a genuinely
 * unique id.
 */
export function tiptapToDocument(
  json: JSONContent,
  base: Pick<CanonicalDocument, "id" | "title"> & { metadata?: CanonicalDocument["metadata"] }
): CanonicalDocument {
  const blocks: Block[] = [];
  const seen = new Set<string>();

  function assignId(attrs: Record<string, unknown> | undefined): string {
    const candidate = attrs?.blockId as string | undefined;
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }
    const id = freshBlockId();
    seen.add(id);
    return id;
  }

  for (const node of json.content ?? []) {
    if (node.type === "heading") {
      const level = (node.attrs?.level as number) ?? 1;
      blocks.push({
        id: assignId(node.attrs),
        kind: level === 1 ? "heading1" : level === 2 ? "heading2" : "heading3",
        text: nodeText(node),
      });
    } else if (node.type === "blockquote") {
      const inner = node.content?.[0];
      blocks.push({ id: assignId(node.attrs), kind: "quote", text: inner ? nodeText(inner) : "" });
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      for (const item of node.content ?? []) {
        const inner = item.content?.[0];
        blocks.push({ id: assignId(item.attrs), kind: "list-item", text: inner ? nodeText(inner) : "" });
      }
    } else if (node.type === "paragraph") {
      blocks.push({ id: assignId(node.attrs), kind: "paragraph", text: nodeText(node) });
    }
    // Any other node type is skipped rather than crashing — every node type
    // this editor's TipTap config can actually produce is handled above;
    // this only guards a future extension being added without updating
    // this mapping too.
  }

  return { id: base.id, title: base.title, blocks, metadata: base.metadata };
}
