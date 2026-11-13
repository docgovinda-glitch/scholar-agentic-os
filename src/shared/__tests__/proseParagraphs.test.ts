import { describe, it, expect } from "vitest";
import { ensureParagraphBreaks, formatProseToParagraphHtml, splitIntoSentences, splitProseIntoParagraphs } from "../proseParagraphs";

const para = (n: number, lead = "Quantum error correction protects fragile qubits") =>
  Array.from({ length: n }, (_, i) => `${i === 0 ? lead : `Sentence ${i + 1} explains the mechanism in further technical detail for the reader`}.`).join(" ");

describe("formatProseToParagraphHtml", () => {
  it("keeps every blank-line paragraph as its own <p>", () => {
    const text = `${para(3)}\n\n${para(3, "However, physical qubits remain noisy")}\n\n${para(2, "Overall, the trade-off is clear")}`;
    const html = formatProseToParagraphHtml(text);
    expect(html.match(/<p>/g)).toHaveLength(3);
    expect(html.startsWith("<p>Quantum error correction")).toBe(true);
    expect(html).toContain("<p>However, physical qubits remain noisy.");
  });

  it("splits a single block over 120 words into paragraphs of 3-4 sentences", () => {
    const wall = para(12);
    expect(wall.split(/\s+/).length).toBeGreaterThan(120);
    const paragraphs = splitProseIntoParagraphs(wall);
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    for (const p of paragraphs) {
      const n = splitIntoSentences(p).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(formatProseToParagraphHtml(wall).match(/<p>/g)!.length).toBe(paragraphs.length);
  });

  it("prefers a break before a transition sentence", () => {
    const s = (t: string) => `${t} explains one more part of the argument with enough words to count.`;
    const wall = [s("First it"), s("Then it"), s("Next it"), "However, the second view disagrees with the first view on several technical points.", s("It"), s("It"), s("It"), s("It"), s("Overall it"), s("It"), s("It"), s("It")].join(" ");
    const paragraphs = splitProseIntoParagraphs(wall);
    expect(paragraphs[1].startsWith("However,")).toBe(true);
  });

  it("does not break at et al., e.g. or initials", () => {
    expect(splitIntoSentences("Arute et al. (2019) reported supremacy. Shor (1994) e.g. factored integers. J. Preskill named NISQ.")).toEqual([
      "Arute et al. (2019) reported supremacy.",
      "Shor (1994) e.g. factored integers.",
      "J. Preskill named NISQ.",
    ]);
  });

  it("escapes HTML and renders emphasis as real italics", () => {
    expect(formatProseToParagraphHtml("See *Nature* <script>.")).toBe("<p>See <em>Nature</em> &lt;script&gt;.</p>");
  });

  it("short text is a single paragraph and ensureParagraphBreaks is stable", () => {
    const text = `${para(2)}\n\n${para(2, "Second point")}`;
    expect(ensureParagraphBreaks(text)).toBe(text);
    expect(ensureParagraphBreaks(ensureParagraphBreaks(para(12)))).toBe(ensureParagraphBreaks(para(12)));
  });
});
