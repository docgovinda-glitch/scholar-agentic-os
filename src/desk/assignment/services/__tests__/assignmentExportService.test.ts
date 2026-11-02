import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { academicLevelName, generateAssignmentDocx, type AssignmentExportParams } from "../assignmentExportService";
import type { AssignmentBriefState, AssignmentDraftingSection, DiscoveredSource } from "../../types";

const brief = {
  instructions: "Discuss triage in rural clinics.",
  targetWordCount: 1500,
  academicLevel: "undergraduate",
  assignmentType: "essay",
  citationStyle: "harvard",
} as unknown as AssignmentBriefState;

const section = (title: string, draftContent: string): AssignmentDraftingSection => ({
  id: title, title, targetWordCount: 500, currentWordCount: 0, guidance: "", draftContent, status: "drafting",
});

const source: DiscoveredSource = {
  id: "s1", title: "Nurse-led triage in rural clinics", authors: ["Okafor, A."], year: "2021", type: "journal_article",
  journal: "Rural Health", relevanceScore: 1, mainFinding: "", suggestedUse: "", citation: "", status: "kept",
};

async function docxText(params: AssignmentExportParams): Promise<string> {
  const blob = await generateAssignmentDocx(params);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

// A long draft so the full (non-tutorial) layout with the cover page is used.
const longDraft = Array.from({ length: 80 }, (_, i) => `Sentence ${i} about triage order and waiting times in the clinic.`).join(" ");

describe("Coursework export (.docx)", () => {
  it("contains the student's title, sections and sources", async () => {
    const text = await docxText({
      title: "Triage and Waiting Times", studentName: "Asha Rai", studentId: "S-1042", institution: "Example University", courseName: "Public Health 201",
      brief, sections: [section("Introduction", longDraft), section("Discussion", longDraft)], sources: [source],
    });
    expect(text).toContain("Triage and Waiting Times");
    expect(text).toContain("Asha Rai");
    expect(text).toContain("S-1042");
    expect(text).toContain("Introduction");
    expect(text).toContain("Sentence 0 about triage order");
    expect(text).toContain("Nurse-led triage in rural clinics");
  });

  it("never invents cover details or claims an empty section was drafted", async () => {
    const text = await docxText({
      title: "Triage and Waiting Times", brief: { ...brief, academicLevel: "doctoral" } as AssignmentBriefState,
      sections: [section("Introduction", longDraft), section("Conclusion", "")], sources: [],
    });
    expect(text).not.toMatch(/SCH-2026|University Faculty of Arts|Academic Studies|Academic Candidate|drafted in accordance/);
    expect(text).toContain("[Not drafted yet]");
    expect(text).toContain("Doctoral");
    expect(text).not.toContain("Undergraduate");
  });

  it("names every academic level, and says nothing when the brief doesn't", () => {
    expect(["high_school", "undergraduate", "postgraduate", "doctoral"].map(academicLevelName)).toEqual(["High school", "Undergraduate", "Postgraduate", "Doctoral"]);
    expect(academicLevelName(undefined)).toBe("—");
  });
});
