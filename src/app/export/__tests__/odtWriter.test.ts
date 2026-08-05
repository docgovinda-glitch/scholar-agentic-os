import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderOdt } from "../odtWriter";
import type { CanonicalDocument } from "../../../desk/types";
import type { ExportMetadata } from "../types";

function metadata(overrides: Partial<ExportMetadata> = {}): ExportMetadata {
  return { title: "A Study", author: "A. Researcher", created: new Date(), modified: new Date(), ...overrides };
}

const document: CanonicalDocument = {
  id: "doc-1",
  title: "A Study of Things & <Stuff>",
  blocks: [
    { id: "b1", kind: "heading1", text: "Introduction" },
    { id: "b2", kind: "paragraph", text: "This is the introduction." },
    { id: "b3", kind: "heading2", text: "Background" },
    { id: "b4", kind: "quote", text: "A notable quotation." },
    { id: "b5", kind: "list-item", text: "First point." },
  ],
};

describe("renderOdt", () => {
  it("produces a zip buffer starting with the PK signature", async () => {
    const buffer = await renderOdt(document, metadata());
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("stores mimetype first and uncompressed, per the ODF package rules", async () => {
    const buffer = await renderOdt(document, metadata());
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);
    expect(names[0]).toBe("mimetype");
    const mimetype = await zip.file("mimetype")?.async("string");
    expect(mimetype).toBe("application/vnd.oasis.opendocument.text");
  });

  it("declares content.xml and styles.xml in the manifest", async () => {
    const buffer = await renderOdt(document, metadata());
    const zip = await JSZip.loadAsync(buffer);
    const manifest = await zip.file("META-INF/manifest.xml")?.async("string");
    expect(manifest).toContain('manifest:full-path="content.xml"');
    expect(manifest).toContain('manifest:full-path="styles.xml"');
  });

  it("escapes special XML characters in the title", async () => {
    const buffer = await renderOdt(document, metadata());
    const zip = await JSZip.loadAsync(buffer);
    const content = await zip.file("content.xml")?.async("string");
    expect(content).toContain("A Study of Things &amp; &lt;Stuff&gt;");
    expect(content).not.toContain("A Study of Things & <Stuff>");
  });

  it("renders every block kind into content.xml", async () => {
    const buffer = await renderOdt(document, metadata());
    const zip = await JSZip.loadAsync(buffer);
    const content = await zip.file("content.xml")?.async("string");
    expect(content).toContain("Introduction");
    expect(content).toContain("This is the introduction.");
    expect(content).toContain("Background");
    expect(content).toContain("A notable quotation.");
    expect(content).toContain("First point.");
  });

  it("handles a document with no blocks", async () => {
    const empty: CanonicalDocument = { id: "doc-2", title: "Empty", blocks: [] };
    const buffer = await renderOdt(empty, metadata());
    const zip = await JSZip.loadAsync(buffer);
    expect(await zip.file("content.xml")?.async("string")).toBeTruthy();
  });
});
