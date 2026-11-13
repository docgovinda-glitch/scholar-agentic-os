import { describe, expect, it } from "vitest";
import { buildWorkspaceHandoff, normalizeHandoffSources } from "../workspaceHandoff";

const messages = [
  { sender: "user" as const, text: "How does remote work affect productivity?" },
  { sender: "assistant" as const, text: "Evidence is mixed." },
  { sender: "user" as const, text: "Focus on hybrid arrangements." },
  { sender: "assistant" as const, text: "## Hybrid work\nSummary text." },
];

describe("buildWorkspaceHandoff", () => {
  it("carries the whole conversation, documents and style into every workspace", () => {
    const h = buildWorkspaceHandoff({
      targetFormatId: "OT-10",
      messages,
      answerText: "## Hybrid work\nSummary text.",
      files: [{ name: "paper.pdf", text: "Full extracted text" }],
      citationStyle: "apa",
    });
    expect(h.question).toBe("Focus on hybrid arrangements.");
    expect(h.intake.ask_conversation).toHaveLength(4);
    expect(h.intake.ask_documents).toEqual([{ name: "paper.pdf", type: "", text: "Full extracted text" }]);
    expect(h.intake.citation_style).toBe("apa");
    expect(h.intake.research_question).toBe("Focus on hybrid arrangements.");
  });

  it("uses an attached document as the coursework brief so it is not uploaded twice", () => {
    const h = buildWorkspaceHandoff({
      targetFormatId: "OT-01",
      messages,
      answerText: "x",
      files: [{ name: "brief.docx", text: "Question 1 (30 marks)" }],
      citationStyle: "harvard",
    });
    expect(String(h.intake.assignment_brief)).toContain("Question 1 (30 marks)");
    expect(h.intake.assignment_brief_file).toBe("brief.docx");
  });

  it("falls back to the question alone when nothing was attached, and maps slides to a topic", () => {
    expect(buildWorkspaceHandoff({ targetFormatId: "OT-01", messages, answerText: "x", citationStyle: "apa" }).intake.assignment_brief).toBe(
      "Focus on hybrid arrangements."
    );
    expect(buildWorkspaceHandoff({ targetFormatId: "OT-22", messages, answerText: "x", citationStyle: "apa" }).intake.topic).toBe(
      "Focus on hybrid arrangements."
    );
  });

  it("keeps only sources that exist and never invents authors", () => {
    const out = normalizeHandoffSources([{ title: "Real paper", doi: "10.1/x" }, {}, { url: "https://example.org/r" }]);
    expect(out).toHaveLength(2);
    expect(out[0].authors).toEqual([]);
  });
});
