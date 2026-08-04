// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { exportToOdt } from "../documentExportService";
import type { PaperProject } from "../../types";

/**
 * ODT is a zip with a strict shape, and the two rules below are what actually
 * decide whether LibreOffice opens the file or calls it corrupt:
 *   1. `mimetype` must be the first entry and stored uncompressed.
 *   2. every other part must be declared in META-INF/manifest.xml.
 * Both are invisible to a typechecker, so they are asserted here against a
 * real generated archive.
 */

function makeProject(overrides: Partial<PaperProject> = {}): PaperProject {
  return {
    id: "p1",
    title: "Vedic Pedagogy & Modern Curricula",
    objectives: "",
    researchQuestions: "How does X relate to Y?",
    researchGap: "",
    methodology: "Mixed methods.",
    field: "Education",
    keywords: "",
    preferredJournalScope: "",
    articleType: "",
    outputFormat: "journal-article",
    dissertationMaterials: "",
    styleAspiration: "",
    authorDetails: "",
    authorName: "A. Scholar",
    currentPhase: "F",
    aiSettings: {} as PaperProject["aiSettings"],
    sections: {
      Introduction: "First line.\nSecond line.",
      Conclusion: "Closing thoughts.",
    },
    ...overrides,
  } as PaperProject;
}

async function unzip(project: PaperProject) {
  const blob = await exportToOdt(project);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip;
}

describe("exportToOdt", () => {
  it("declares the OpenDocument text mimetype", async () => {
    const zip = await unzip(makeProject());
    expect(await zip.file("mimetype")!.async("string")).toBe(
      "application/vnd.oasis.opendocument.text"
    );
  });

  it("puts mimetype first in the archive", async () => {
    const zip = await unzip(makeProject());
    expect(Object.keys(zip.files)[0]).toBe("mimetype");
  });

  it("ships the parts the manifest declares", async () => {
    const zip = await unzip(makeProject());
    const manifest = await zip.file("META-INF/manifest.xml")!.async("string");
    for (const part of ["content.xml", "styles.xml"]) {
      expect(manifest).toContain(part);
      expect(zip.file(part)).not.toBeNull();
    }
  });

  it("produces well-formed content.xml", async () => {
    const zip = await unzip(makeProject());
    const xml = await zip.file("content.xml")!.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  });

  it("escapes XML-significant characters instead of emitting raw markup", async () => {
    const zip = await unzip(makeProject({ title: "Ampersands & <angles>" }));
    const xml = await zip.file("content.xml")!.async("string");
    expect(xml).toContain("Ampersands &amp; &lt;angles&gt;");
    // The raw form would break the parse; prove the parse still succeeds.
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  });

  it("carries the drafted section content and headings through", async () => {
    const zip = await unzip(makeProject());
    const xml = await zip.file("content.xml")!.async("string");
    expect(xml).toContain("Introduction");
    expect(xml).toContain("First line.");
    expect(xml).toContain("Second line.");
    expect(xml).toContain("Closing thoughts.");
  });

  it("splits multi-line section text into separate paragraphs", async () => {
    const zip = await unzip(makeProject());
    const xml = await zip.file("content.xml")!.async("string");
    expect(xml).toContain("<text:p text:style-name=\"BodyP\">First line.</text:p>");
    expect(xml).toContain("<text:p text:style-name=\"BodyP\">Second line.</text:p>");
  });

  it("applies the format's page margins to the page layout", async () => {
    const zip = await unzip(makeProject());
    const styles = await zip.file("styles.xml")!.async("string");
    expect(styles).toMatch(/fo:margin-top="[\d.]+in"/);
    expect(new DOMParser().parseFromString(styles, "application/xml").querySelector("parsererror")).toBeNull();
  });

  it("omits an unconfirmed AI-use disclosure", async () => {
    const zip = await unzip(makeProject());
    const xml = await zip.file("content.xml")!.async("string");
    expect(xml).not.toContain("AI-Use Disclosure");
  });
});
