import { describe, it, expect } from "vitest";
import { sectionsToBlocks } from "../sectionsToBlocks";
import type { GeneratedSection } from "../../types";

function section(title: string, text: string): GeneratedSection {
  return { key: title.toLowerCase(), title, text, wordCount: 10, memory: "m", citedEvidenceIds: [], generatedAt: "now" };
}

describe("sectionsToBlocks", () => {
  it("emits a heading2 for the section title followed by one paragraph per blank-line-separated chunk", () => {
    const blocks = sectionsToBlocks([section("Introduction", "First paragraph.\n\nSecond paragraph.")]);
    expect(blocks.map((b) => b.kind)).toEqual(["heading2", "paragraph", "paragraph"]);
    expect(blocks[0].text).toBe("Introduction");
    expect(blocks[1].text).toBe("First paragraph.");
    expect(blocks[2].text).toBe("Second paragraph.");
  });

  it("concatenates multiple sections in order, each with its own heading", () => {
    const blocks = sectionsToBlocks([section("Introduction", "Intro text."), section("Methods", "Methods text.")]);
    expect(blocks.map((b) => `${b.kind}:${b.text}`)).toEqual(["heading2:Introduction", "paragraph:Intro text.", "heading2:Methods", "paragraph:Methods text."]);
  });

  it("gives every block a unique id", () => {
    const blocks = sectionsToBlocks([section("A", "One.\n\nTwo."), section("B", "Three.")]);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
  });

  it("returns an empty list for no sections", () => {
    expect(sectionsToBlocks([])).toEqual([]);
  });
});
