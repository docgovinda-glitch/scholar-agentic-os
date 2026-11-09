import { describe, it, expect } from "vitest";
import { buildSectionScaffold, SCAFFOLD_MARKER } from "../sectionScaffold";

describe("offline section scaffold", () => {
  it("is built only from the section's own prompt, key points and sources and is labelled", () => {
    const out = buildSectionScaffold({
      title: "2.0 Quantum Fourier transform and Shor",
      prompt: "Derive the QFT circuit and show its role in Shor's algorithm.",
      keyPoints: ["QFT circuit structure", "Phase estimation link"],
      sources: [{ title: "Algorithms for quantum computation", authors: ["Shor, P."], year: 1994 }],
      targetWords: 400,
    });
    expect(out).toContain(SCAFFOLD_MARKER);
    expect(out).toContain("Derive the QFT circuit");
    expect(out).toContain("QFT circuit structure");
    expect(out).toContain("Shor (1994)");
    expect(out).not.toMatch(/\d+%|p\s*<|studies show/i);
  });

  it("still returns a usable skeleton with no key points or sources", () => {
    expect(buildSectionScaffold({ title: "Intro" })).toContain("Paragraph 1");
  });
});
