import { describe, it, expect } from "vitest";
import { plainTextToDocument } from "../plainTextToDocument";

describe("desk/plainTextToDocument", () => {
  it("splits blank-line-separated chunks into paragraph blocks", () => {
    const doc = plainTextToDocument("p1", "My Draft", "First paragraph.\n\nSecond paragraph.\n\nThird.");
    expect(doc.blocks).toHaveLength(3);
    expect(doc.blocks.every((b) => b.kind === "paragraph")).toBe(true);
    expect(doc.blocks.map((b) => b.text)).toEqual(["First paragraph.", "Second paragraph.", "Third."]);
  });

  it("gives every block a unique id", () => {
    const doc = plainTextToDocument("p1", "T", "A.\n\nB.\n\nC.");
    const ids = new Set(doc.blocks.map((b) => b.id));
    expect(ids.size).toBe(doc.blocks.length);
  });

  it("drops empty chunks (extra blank lines, leading/trailing whitespace)", () => {
    const doc = plainTextToDocument("p1", "T", "\n\n\nOnly one.\n\n\n\n  \n\n");
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0].text).toBe("Only one.");
  });

  it("produces an empty block list for blank input", () => {
    const doc = plainTextToDocument("p1", "T", "   \n\n  ");
    expect(doc.blocks).toEqual([]);
  });

  it("carries the given id and title through unchanged", () => {
    const doc = plainTextToDocument("proj-123", "Thesis Draft", "Text.");
    expect(doc.id).toBe("proj-123");
    expect(doc.title).toBe("Thesis Draft");
  });
});
