import { describe, it, expect } from "vitest";
import {
  buildAssignmentRelationalSnapshot,
  contentHash,
  normalizePhase,
} from "../assignmentRelational";

const NOW = new Date("2026-11-13T12:00:00Z");

const answers = {
  assignment_title: "Monetary policy report",
  assignment_brief_text: "Question 1: Explain how central banks set rates. [40 marks]",
  assignment_brief_file: "brief.pdf",
  assignment_current_phase: "drafting",
  target_word_count: 1000,
  citation_style: "apa7",
  writing_style: { preset: "analytical", label: "Analytical" },
  assignment_structure: JSON.stringify({
    headings: [
      { id: "h1", title: "Rate setting", targetWordCount: 600, subheadings: [{ id: "h1-a", title: "Tools", targetWordCount: 300, keyPoints: ["Policy rate"] }] },
      { id: "h2", title: "Conclusion", targetWordCount: 400, subheadings: [] },
    ],
  }),
  assignment_sources: [
    { id: "s1", status: "kept" },
    { id: "s2", prescribedInBrief: true },
    { id: "s3", isUserUploaded: true, status: "removed" },
    { id: "s4", vaultItemId: "v-9" },
  ],
  approved_source_ids: ["s4"],
  assignment_user_uploaded_sources: JSON.stringify([
    { id: "u1", name: "notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileSize: 2048, extractedText: "Lecture notes" },
  ]),
  assignment_internal_sections: [
    { id: "h1", title: "Rate setting", draftContent: "Central banks set a policy rate.", boundSourceIds: ["s1"] },
    { id: "h2", title: "Conclusion", draftContent: "" },
  ],
  assignment_submission_report: { passed: true, overall: 82 },
};

describe("buildAssignmentRelationalSnapshot", () => {
  const snap = buildAssignmentRelationalSnapshot("proj-1", answers, NOW);

  it("maps workspace state (Stage 1) with phase, targets and style", () => {
    expect(snap.project).toMatchObject({
      project_id: "proj-1",
      current_phase: "drafting",
      title: "Monetary policy report",
      target_word_count: 1000,
      citation_style: "apa7",
      writing_style: "analytical",
    });
    expect(snap.project.stage_status).toEqual({
      extract: "complete",
      understand: "complete",
      sources: "complete",
      drafting: "in_progress",
      submission: "complete",
    });
  });

  it("stores the brief file and uploaded sources with metadata and parsed text", () => {
    expect(snap.files.map((f) => [f.file_id, f.role])).toEqual([["brief", "brief"], ["source:u1", "source"]]);
    expect(snap.files[1]).toMatchObject({ file_name: "notes.docx", size_bytes: 2048, parsed_text: "Lecture notes" });
  });

  it("flattens the outline (Stage 2) in order with parents", () => {
    expect(snap.outline.map((o) => [o.section_id, o.parent_section_id, o.position, o.level])).toEqual([
      ["h1", null, 0, 1],
      ["h1-a", "h1", 1, 2],
      ["h2", null, 2, 1],
    ]);
    expect(snap.outline[1].key_points).toEqual(["Policy rate"]);
  });

  it("tags each source with its channel and approval (Stage 3)", () => {
    expect(snap.sourceOrigins).toEqual([
      { source_id: "s1", origin: "live", is_approved: true },
      { source_id: "s2", origin: "prescribed", is_approved: true },
      { source_id: "s3", origin: "upload", is_approved: false },
      { source_id: "s4", origin: "vault", is_approved: true },
    ]);
  });

  it("snapshots only drafted sections with a stable hash (Stage 4)", () => {
    expect(snap.drafts).toHaveLength(1);
    expect(snap.drafts[0]).toMatchObject({ section_id: "h1", word_count: 6, cited_source_ids: ["s1"] });
    expect(snap.drafts[0].content_hash).toBe(contentHash("Central banks set a policy rate."));
  });

  it("keeps the pre-submission report (Stage 5)", () => {
    expect(snap.submission).toMatchObject({ project_id: "proj-1", passed: true });
  });

  it("handles an empty project and legacy phase names", () => {
    const empty = buildAssignmentRelationalSnapshot("p", {}, NOW);
    expect(empty.project.current_phase).toBe("extract");
    expect(empty.files).toEqual([]);
    expect(empty.outline).toEqual([]);
    expect(empty.submission).toBeNull();
    expect(normalizePhase("plan")).toBe("understand");
    expect(normalizePhase("review")).toBe("submission");
  });

  it("hash differs when text changes", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
    expect(contentHash("same")).toBe(contentHash("same"));
  });
});
