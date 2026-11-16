import { describe, it, expect, vi } from "vitest";

vi.mock("../../../api", () => ({
  authedFetch: vi.fn(),
  authedJsonFetch: vi.fn(async () => new Response(JSON.stringify({ error: "no AI" }), { status: 426 })),
}));

import { extractProjectEvidence, deriveSourceTraceability, generateCitationString } from "../sourceEvidenceExtractionService";

const TEXT =
  "Central banks set the policy rate at scheduled meetings. Forward guidance shapes expectations of future policy rates. " +
  "Credibility determines whether guidance moves long-term yields. Markets react to surprises rather than to expected moves.";

describe("upload evidence without an AI", () => {
  it("uses the document's own sentences and invents no author, year, finding or section", async () => {
    const { document, evidenceItems } = await extractProjectEvidence(
      { title: "week_3_notes.txt", text: TEXT, sourceType: "text" } as never,
      { assignmentQuestion: "Evaluate how central banks steer inflation expectations.", citationStyle: "apa7", projectId: "p1" }
    );
    expect(evidenceItems.length).toBeGreaterThan(0);
    for (const ev of evidenceItems) {
      expect(TEXT).toContain(ev.evidenceSnippet);
      expect(ev.authors).toEqual([]);
      expect(ev.year).toBe("n.d.");
      expect(ev.claim).toBe("");
    }
    expect(document.name).toBe("week 3 notes");
    expect(document.keyFindings).toEqual([]);
    expect(document.abstract).toBeUndefined();
    expect(document.methodology).toBe("Text or notes");
    const t = deriveSourceTraceability(document, "", "apa7");
    expect(t.usedInAssignment.mappedSections).toEqual([]);
    expect(t.usedInAssignment.passagesCount).toBe(evidenceItems.length);
    expect(t.inTextCitation).toMatch(/n\.d\./);
    expect(JSON.stringify(document)).not.toMatch(/Course Instructor|Academic Course Grounding|Peer-Reviewed Article|Literature Review/);
  });

  it("reference entries print only what is known", () => {
    const entry = generateCitationString("week_3_notes.pdf", undefined, undefined, "pdf", "APA");
    expect(entry).toMatch(/week 3 notes/);
    expect(entry).toMatch(/n\.d\./);
    expect(entry).not.toMatch(/Course Syllabus|Academic Research Repository|Scholar Academic Archive|20\d\d/);
  });
});
