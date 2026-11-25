import { describe, it, expect } from "vitest";
import { buildAnswerTelemetry, extractQueryTopics, looksTruncated } from "../answerTelemetry";

describe("answerTelemetry", () => {
  it("extracts named entities from a comparative question", () => {
    const topics = extractQueryTopics("Compare Wendt and Mearsheimer on security in East Asia and Europe since 2020");
    expect(topics).toEqual(expect.arrayContaining(["Wendt", "Mearsheimer"]));
  });

  it("reports covered and missing topics from the retrieved evidence only", () => {
    const t = buildAnswerTelemetry({
      prompt: "Compare Wendt and Mearsheimer",
      answerText: "Wendt argues X.",
      retrieved: [{ title: "Wendt and social theory", snippet: "constructivism", fullText: true }],
      cited: [{ title: "Wendt and social theory" }],
    });
    expect(t.covered).toContain("Wendt");
    expect(t.missing).toContain("Mearsheimer");
    expect(t.retrieved).toBe(1);
    expect(t.fullText).toBe(1);
    expect(t.abstractOnly).toBe(0);
    expect(t.looksTruncated).toBe(false);
  });

  it("flags an answer that stops mid-sentence", () => {
    const t = buildAnswerTelemetry({ prompt: "x", answerText: "The evidence suggests that", retrieved: [], cited: [] });
    expect(t.looksTruncated).toBe(true);
  });
});

describe("looksTruncated", () => {
  it("flags mid-sentence stops only", () => {
    expect(looksTruncated("Wendt argues that identities and")).toBe(true);
    expect(looksTruncated("Wendt argues this.")).toBe(false);
    expect(looksTruncated("Intro.\n\n## References\n1. Wendt (1999) Social theory")).toBe(false);
    expect(looksTruncated("See https://doi.org/10.1/abc")).toBe(false);
    expect(looksTruncated("- a bullet without a period")).toBe(false);
  });
});
