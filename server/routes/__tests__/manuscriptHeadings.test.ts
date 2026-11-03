import { describe, it, expect } from "vitest";
import { manuscriptToCanonicalDocument } from "../project/agentic/helpers.ts";

describe("manuscriptToCanonicalDocument", () => {
  it("drops the Studio's § marker from section headings", () => {
    const doc = manuscriptToCanonicalDocument("p", "T", "### § Introduction\n\nText.\n\n## Methods\n\nMore.");
    expect(doc.blocks.filter((b) => b.kind.startsWith("heading")).map((b) => b.text)).toEqual(["Introduction", "Methods"]);
  });
});
