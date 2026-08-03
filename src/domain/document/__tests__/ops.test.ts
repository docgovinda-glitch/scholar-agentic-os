import { describe, it, expect } from "vitest";
import { emptyDocument } from "../model";
import {
  appendBlock,
  extractOutline,
  getRangeText,
  insertBlockAfter,
  mergeWithNext,
  moveBlock,
  removeBlock,
  replaceRange,
  setMetadata,
  splitBlock,
  wordCount,
} from "../ops";

function doc() {
  let d = emptyDocument("doc-1", "Chapter 3");
  d = appendBlock(d, "b1", "heading1", "Methods");
  d = appendBlock(d, "b2", "paragraph", "The sample comprised 240 participants.");
  d = appendBlock(d, "b3", "paragraph", "Analysis proceeded in two stages.");
  return d;
}

describe("domain/document: ranges", () => {
  it("extracts text within a range", () => {
    const d = doc();
    expect(getRangeText(d, { blockId: "b2", start: 4, end: 10 })).toBe("sample");
  });

  it("throws on an out-of-bounds range", () => {
    const d = doc();
    expect(() => getRangeText(d, { blockId: "b2", start: 0, end: 9999 })).toThrow();
  });

  it("throws on a nonexistent block", () => {
    const d = doc();
    expect(() => getRangeText(d, { blockId: "nope", start: 0, end: 1 })).toThrow();
  });
});

describe("domain/document: replaceRange", () => {
  it("replaces text without mutating the original document", () => {
    const d = doc();
    const next = replaceRange(d, { blockId: "b2", start: 4, end: 10 }, "cohort");
    expect(next.blocks.find((b) => b.id === "b2")!.text).toBe("The cohort comprised 240 participants.");
    expect(d.blocks.find((b) => b.id === "b2")!.text).toBe("The sample comprised 240 participants.");
  });

  it("supports insertion (empty range) and deletion (empty replacement)", () => {
    const d = doc();
    const inserted = replaceRange(d, { blockId: "b2", start: 0, end: 0 }, "NOTE: ");
    expect(inserted.blocks[1].text.startsWith("NOTE: The sample")).toBe(true);

    const deleted = replaceRange(d, { blockId: "b2", start: 3, end: 4 }, "");
    expect(deleted.blocks[1].text).toBe("Thesample comprised 240 participants.");
  });
});

describe("domain/document: structural operations", () => {
  it("splitBlock divides one block into two at the offset", () => {
    const d = doc();
    const split = splitBlock(d, "b2", 4, "b2b");
    expect(split.blocks.map((b) => b.id)).toEqual(["b1", "b2", "b2b", "b3"]);
    expect(split.blocks[1].text).toBe("The ");
    expect(split.blocks[2].text).toBe("sample comprised 240 participants.");
  });

  it("mergeWithNext concatenates a block with its successor and removes the successor", () => {
    const d = doc();
    const merged = mergeWithNext(d, "b2");
    expect(merged.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(merged.blocks[1].text).toBe(
      "The sample comprised 240 participants.Analysis proceeded in two stages."
    );
  });

  it("moveBlock repositions a block", () => {
    const d = doc();
    const moved = moveBlock(d, "b3", 0);
    expect(moved.blocks.map((b) => b.id)).toEqual(["b3", "b1", "b2"]);
  });

  it("removeBlock deletes a block", () => {
    const d = doc();
    const removed = removeBlock(d, "b2");
    expect(removed.blocks.map((b) => b.id)).toEqual(["b1", "b3"]);
  });

  it("insertBlockAfter inserts at the start when afterBlockId is null", () => {
    const d = doc();
    const inserted = insertBlockAfter(d, null, { id: "b0", kind: "paragraph", text: "Preface" });
    expect(inserted.blocks[0].id).toBe("b0");
  });
});

describe("domain/document: derived views", () => {
  it("wordCount counts words across all blocks", () => {
    const d = doc();
    // "Methods" (1) + "The sample comprised 240 participants." (5) + "Analysis proceeded in two stages." (5)
    expect(wordCount(d)).toBe(11);
  });

  it("wordCount is 0 for an empty document", () => {
    expect(wordCount(emptyDocument("empty", "Empty"))).toBe(0);
  });

  it("extractOutline returns heading blocks in order with their level", () => {
    let d = doc();
    d = appendBlock(d, "b4", "heading2", "Data Collection");
    const outline = extractOutline(d);
    expect(outline).toEqual([
      { blockId: "b1", level: 1, text: "Methods" },
      { blockId: "b4", level: 2, text: "Data Collection" },
    ]);
  });
});

describe("domain/document: metadata", () => {
  it("a fresh document has no metadata bag", () => {
    expect(emptyDocument("d1", "Untitled").metadata).toBeUndefined();
  });

  it("setMetadata creates the bag on first use", () => {
    const d = setMetadata(emptyDocument("d1", "Untitled"), "data_availability_statement", "Data available on request.");
    expect(d.metadata).toEqual({ data_availability_statement: "Data available on request." });
  });

  it("setMetadata does not mutate the input document", () => {
    const original = emptyDocument("d1", "Untitled");
    setMetadata(original, "ethics_approval", "IRB-2026-014");
    expect(original.metadata).toBeUndefined();
  });

  it("setMetadata adds to existing keys without dropping others", () => {
    let d = setMetadata(emptyDocument("d1", "Untitled"), "a", "1");
    d = setMetadata(d, "b", "2");
    expect(d.metadata).toEqual({ a: "1", b: "2" });
  });

  it("setMetadata overwrites an existing key", () => {
    let d = setMetadata(emptyDocument("d1", "Untitled"), "a", "1");
    d = setMetadata(d, "a", "2");
    expect(d.metadata).toEqual({ a: "2" });
  });
});
