import { describe, it, expect } from "vitest";
import { generateMarpMarkdown, generateHtmlPresentation } from "../export/marpExporter";
import type { PresentationProjectData } from "../types";

const mockDeck: PresentationProjectData = {
  projectId: "test-deck-1",
  title: "Empirical Grounding in AI Systems",
  durationMinutes: 15,
  targetAudience: "Academic Conference",
  narrativeHook: "Overcoming citation hallucinations.",
  coreInsight: "Bayesian evidence graphs ensure 100% precision.",
  slides: [
    {
      slideNumber: 1,
      type: "title",
      title: "Empirical Grounding in AI Systems",
      subtitle: "A Zero-Hallucination Framework",
      visualFocus: "Title slide banner",
      keyPoints: ["Presenter: Scholar Core", "15 Min Keynote"],
      speakerNotes: "Welcome everyone to this keynote presentation.",
      targetDurationSeconds: 60,
    },
    {
      slideNumber: 2,
      type: "results",
      title: "Empirical Evaluation",
      subtitle: "1000 Manuscripts Tested",
      visualFocus: "Bar chart with confidence intervals",
      keyPoints: ["100% precision", "Zero hallucinations"],
      speakerNotes: "Here are the benchmark results showing statistically significant gains.",
      targetDurationSeconds: 180,
    },
  ],
};

describe("marpExporter", () => {
  it("generates valid Marp Markdown with frontmatter and slide delimiters", () => {
    const md = generateMarpMarkdown(mockDeck);
    expect(md).toContain("marp: true");
    expect(md).toContain("# Empirical Grounding in AI Systems");
    expect(md).toContain("<!-- _class: lead -->");
    expect(md).toContain("Speaker Notes (~60s):");
    expect(md).toContain("Speaker Notes (~180s):");
    expect(md).toContain("🎯 **Visual Focus:** Bar chart with confidence intervals");
  });

  it("generates standalone interactive HTML presentation with slide markup", () => {
    const html = generateHtmlPresentation(mockDeck);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Empirical Grounding in AI Systems - Scholar Presentation");
    expect(html).toContain("Slide 1 / 2");
    expect(html).toContain("Empirical Evaluation");
    expect(html).toContain("Welcome everyone to this keynote presentation.");
  });
});
