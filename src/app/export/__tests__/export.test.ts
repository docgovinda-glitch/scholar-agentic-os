import { describe, it, expect } from "vitest";
import { exportDocument } from "../export";
import type { CanonicalDocument } from "../../../desk/types";
import type { ExportFormat } from "../types";

const document: CanonicalDocument = {
  id: "doc-1",
  title: "A Study of Things",
  blocks: [
    { id: "b1", kind: "heading1", text: "Introduction" },
    { id: "b2", kind: "paragraph", text: "This is the introduction, long enough to clear the word-count warning threshold that the pre-flight stage checks for so this test only exercises the render and verify stages rather than tripping a warning. ".repeat(6) },
  ],
};

describe.each<ExportFormat>(["docx", "odt", "pdf"])("exportDocument (%s)", (format) => {
  it("renders, verifies, and names the output file", async () => {
    const result = await exportDocument({ document, format, title: document.title, author: "A. Researcher" });
    expect(result.format).toBe(format);
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.data.length).toBe(result.byteSize);
    expect(result.filename).toBe(`A_Study_of_Things.${format}`);
  });
});

describe("exportDocument", () => {
  it("rejects an empty document before rendering", async () => {
    const empty: CanonicalDocument = { id: "doc-2", title: "Empty", blocks: [] };
    await expect(exportDocument({ document: empty, format: "pdf", title: "Empty" })).rejects.toThrow(
      /pre-flight failed/
    );
  });
});
