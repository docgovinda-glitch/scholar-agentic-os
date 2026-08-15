import { describe, it, expect } from "vitest";
import { documentToTiptap, tiptapToDocument } from "../cdmTiptap";
import type { CanonicalDocument } from "../../types";

describe("documentToTiptap", () => {
  it("maps every block kind to its TipTap node shape, carrying blockId through", () => {
    const doc: CanonicalDocument = {
      id: "doc-1",
      title: "T",
      blocks: [
        { id: "b1", kind: "heading1", text: "Title" },
        { id: "b2", kind: "paragraph", text: "Body text." },
        { id: "b3", kind: "quote", text: "A quoted line." },
      ],
    };
    const tiptap = documentToTiptap(doc);
    expect(tiptap.content).toEqual([
      { type: "heading", attrs: { level: 1, blockId: "b1" }, content: [{ type: "text", text: "Title" }] },
      { type: "paragraph", attrs: { blockId: "b2" }, content: [{ type: "text", text: "Body text." }] },
      { type: "blockquote", attrs: { blockId: "b3" }, content: [{ type: "paragraph", content: [{ type: "text", text: "A quoted line." }] }] },
    ]);
  });

  it("groups consecutive list-item blocks into a single bulletList node", () => {
    const doc: CanonicalDocument = {
      id: "doc-1",
      title: "T",
      blocks: [
        { id: "b1", kind: "list-item", text: "One" },
        { id: "b2", kind: "list-item", text: "Two" },
        { id: "b3", kind: "paragraph", text: "After the list." },
      ],
    };
    const tiptap = documentToTiptap(doc);
    expect(tiptap.content).toHaveLength(2);
    expect(tiptap.content![0].type).toBe("bulletList");
    expect(tiptap.content![0].content).toHaveLength(2);
    expect(tiptap.content![1].type).toBe("paragraph");
  });

  it("keeps two separate list groups separate when a non-list block sits between them", () => {
    const doc: CanonicalDocument = {
      id: "doc-1",
      title: "T",
      blocks: [
        { id: "b1", kind: "list-item", text: "One" },
        { id: "b2", kind: "paragraph", text: "Between." },
        { id: "b3", kind: "list-item", text: "Two" },
      ],
    };
    const tiptap = documentToTiptap(doc);
    expect(tiptap.content!.map((n) => n.type)).toEqual(["bulletList", "paragraph", "bulletList"]);
  });

  it("produces a single empty paragraph for a document with no blocks, never an empty content array", () => {
    const tiptap = documentToTiptap({ id: "doc-1", title: "T", blocks: [] });
    expect(tiptap.content).toEqual([{ type: "paragraph" }]);
  });
});

describe("tiptapToDocument", () => {
  it("round-trips a document through documentToTiptap and back unchanged", () => {
    const doc: CanonicalDocument = {
      id: "doc-1",
      title: "T",
      blocks: [
        { id: "b1", kind: "heading2", text: "Section" },
        { id: "b2", kind: "paragraph", text: "Some prose." },
        { id: "b3", kind: "list-item", text: "First" },
        { id: "b4", kind: "list-item", text: "Second" },
        { id: "b5", kind: "quote", text: "A citation-worthy line." },
      ],
    };
    const roundTripped = tiptapToDocument(documentToTiptap(doc), { id: doc.id, title: doc.title });
    expect(roundTripped.blocks).toEqual(doc.blocks);
  });

  it("assigns a fresh id to a node with no blockId attribute (a newly created block)", () => {
    const result = tiptapToDocument(
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "New." }] }] },
      { id: "doc-1", title: "T" }
    );
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].id).toBeTruthy();
    expect(result.blocks[0].text).toBe("New.");
  });

  it("deduplicates a blockId that appears twice (ProseMirror's splitBlock copying attrs), giving the second occurrence a new id", () => {
    const result = tiptapToDocument(
      {
        type: "doc",
        content: [
          { type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: "First half." }] },
          { type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: "Second half." }] },
        ],
      },
      { id: "doc-1", title: "T" }
    );
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].id).toBe("b1");
    expect(result.blocks[1].id).not.toBe("b1");
    expect(new Set(result.blocks.map((b) => b.id)).size).toBe(2);
  });

  it("maps an empty text node to an empty-string block, not a crash", () => {
    const result = tiptapToDocument({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: "b1" } }] }, { id: "doc-1", title: "T" });
    expect(result.blocks[0].text).toBe("");
  });

  it("carries metadata through untouched", () => {
    const result = tiptapToDocument(
      { type: "doc", content: [{ type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: "x" }] }] },
      { id: "doc-1", title: "T", metadata: { funding: "none" } }
    );
    expect(result.metadata).toEqual({ funding: "none" });
  });
});
