import { describe, it, expect } from "vitest";
import { renderPdf } from "../pdfWriter";
import type { CanonicalDocument } from "../../../desk/types";
import type { ExportMetadata } from "../types";

function metadata(overrides: Partial<ExportMetadata> = {}): ExportMetadata {
  return { title: "A Study", author: "A. Researcher", created: new Date(), modified: new Date(), ...overrides };
}

const document: CanonicalDocument = {
  id: "doc-1",
  title: "A Study of Things",
  blocks: [
    { id: "b1", kind: "heading1", text: "Introduction" },
    { id: "b2", kind: "paragraph", text: "This is the introduction." },
    { id: "b3", kind: "heading2", text: "Background" },
    { id: "b4", kind: "quote", text: "A notable quotation." },
    { id: "b5", kind: "list-item", text: "First point." },
  ],
};

describe("renderPdf", () => {
  it("produces a buffer starting with the PDF magic header", async () => {
    const buffer = await renderPdf(document, metadata());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("handles a document with no blocks", async () => {
    const empty: CanonicalDocument = { id: "doc-2", title: "Empty", blocks: [] };
    const buffer = await renderPdf(empty, metadata());
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("falls back to a placeholder author when none is given", async () => {
    const buffer = await renderPdf(document, metadata({ author: undefined }));
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});
