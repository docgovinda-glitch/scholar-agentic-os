import { describe, it, expect } from "vitest";
import { AssignmentPdfRequestSchema, buildAssignmentCanonicalDocument } from "../assignmentDocument";
import { exportDocument } from "../../../../app/export/export";

const request = AssignmentPdfRequestSchema.parse({
  title: "Monetary Policy Report",
  studentName: "A. Student",
  courseName: "ECON 201",
  citationStyle: "apa7",
  targetWordCount: 200,
  sections: [
    { title: "Rate setting", draftContent: "Central banks set a *policy rate* (Smith, 2020).\n\nThe rate shapes lending across the economy and anchors expectations over time." },
    { title: "Conclusion", draftContent: "" },
  ],
  sources: [
    { id: "s1", title: "Interest rates and banks", authors: ["Smith, J."], year: "2020", journal: "Journal of Money" },
    { id: "s2", title: "Never cited", authors: ["Jones, K."], year: "2019" },
  ],
});

describe("buildAssignmentCanonicalDocument", () => {
  const doc = buildAssignmentCanonicalDocument(request, "p1");

  it("keeps every section in order, splits paragraphs and adds the cover lines the student gave", () => {
    const headings = doc.blocks.filter((b) => b.kind === "heading1").map((b) => b.text);
    expect(headings).toEqual(["Rate setting", "Conclusion", "Reference List"]);
    expect(doc.blocks.filter((b) => b.kind === "paragraph").map((b) => b.text)).toContain("ECON 201");
    expect(doc.blocks.some((b) => /Student ID/.test(b.text))).toBe(false);
  });

  it("lists only cited sources in the reference list", () => {
    const after = doc.blocks.slice(doc.blocks.findIndex((b) => b.text === "Reference List") + 1).map((b) => b.text);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatch(/Smith/);
    expect(after.join(" ")).not.toMatch(/Never cited/);
  });

  it("renders a real PDF through the shared export pipeline", async () => {
    const result = await exportDocument({ document: doc, format: "pdf", title: request.title, author: request.studentName });
    expect(result.data.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.byteSize).toBeGreaterThan(1000);
  }, 30_000);

  it("rejects oversized or malformed requests", () => {
    expect(AssignmentPdfRequestSchema.safeParse({ title: "", sections: [] }).success).toBe(false);
    expect(AssignmentPdfRequestSchema.safeParse({ title: "x", sections: "nope" }).success).toBe(false);
  });
});

describe("rich blocks in the PDF document", () => {
  it("turns quotes, lists and tables into document blocks and still renders a PDF", async () => {
    const req = AssignmentPdfRequestSchema.parse({
      title: "Rich",
      sections: [{ title: "S", draftContent: "Intro.\n\n> Quoted.\n\n- a\n- b\n\n| X | Y |\n| --- | --- |\n| 1 | 2 |" }],
    });
    const doc = buildAssignmentCanonicalDocument(req);
    expect(doc.blocks.map((b) => b.kind)).toEqual(["paragraph", "heading1", "paragraph", "quote", "list-item", "list-item", "table"]);
    expect(doc.blocks.at(-1)?.rows).toEqual([["X", "Y"], ["1", "2"]]);
    const result = await exportDocument({ document: doc, format: "pdf", title: "Rich" });
    expect(result.data.subarray(0, 4).toString()).toBe("%PDF");
  }, 30_000);
});
