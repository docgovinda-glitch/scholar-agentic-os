import { describe, it, expect } from "vitest";
import {
  checkForDuplicates,
  normalizeDoi,
  normalizeTitle,
  calculateTitleSimilarity,
} from "../duplicateDetection";

describe("duplicateDetection Service", () => {
  const existingLibrary: any[] = [
    {
      id: "source-1",
      title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
      authors: ["Lewis, Patrick", "Perez, Ethan"],
      year: "2020",
      canonicalReference: { doi: "10.48550/arXiv.2005.11401" },
    },
    {
      id: "source-2",
      title: "Attention Is All You Need",
      authors: ["Vaswani, Ashish", "Shazeer, Noam"],
      year: "2017",
      canonicalReference: { doi: "10.48550/arXiv.1706.03762" },
    },
  ];

  it("normalizes DOIs correctly", () => {
    expect(normalizeDoi("https://doi.org/10.1038/nature12373")).toBe("10.1038/nature12373");
    expect(normalizeDoi("http://dx.doi.org/10.1038/nature12373.")).toBe("10.1038/nature12373");
    expect(normalizeDoi(" 10.1038/nature12373 ")).toBe("10.1038/nature12373");
    expect(normalizeDoi("doi:10.1038/nature12373")).toBe("10.1038/nature12373");
    expect(normalizeDoi("DOI: 10.1038/nature12373/")).toBe("10.1038/nature12373");
    expect(normalizeDoi("doi.org/10.1038/nature12373")).toBe("10.1038/nature12373");
  });

  it("detects exact DOI match as Definite Duplicate (100%)", () => {
    const candidate = {
      doi: "10.48550/arXiv.1706.03762",
      title: "Some different draft title",
    };
    const result = checkForDuplicates(candidate, existingLibrary);
    expect(result.isDuplicate).toBe(true);
    expect(result.confidence).toBe("definite");
    expect(result.similarityPercent).toBe(100);
    expect(result.existingItem?.id).toBe("source-2");
  });

  it("detects exact title match as Likely Duplicate (100%)", () => {
    const candidate = {
      title: "Attention Is All You Need",
    };
    const result = checkForDuplicates(candidate, existingLibrary);
    expect(result.isDuplicate).toBe(true);
    expect(result.confidence).toBe("likely");
    expect(result.similarityPercent).toBe(100);
    expect(result.existingItem?.id).toBe("source-2");
  });

  it("detects high title similarity with author/year match as Likely Duplicate", () => {
    const candidate = {
      title: "Retrieval Augmented Generation for Knowledge Intensive NLP Tasks",
      authors: ["Lewis, P."],
      year: "2020",
    };
    const result = checkForDuplicates(candidate, existingLibrary);
    expect(result.isDuplicate).toBe(true);
    expect(result.confidence).toBe("likely");
    expect(result.similarityPercent).toBeGreaterThanOrEqual(90);
    expect(result.existingItem?.id).toBe("source-1");
  });

  it("detects moderate title similarity as Possible Duplicate", () => {
    const candidate = {
      title: "Retrieval-Augmented Generation for Knowledge Tasks",
    };
    const result = checkForDuplicates(candidate, existingLibrary);
    expect(result.isDuplicate).toBe(true);
    expect(result.confidence).toBe("possible");
    expect(result.similarityPercent).toBeGreaterThanOrEqual(70);
  });

  it("returns isDuplicate: false for unrelated papers", () => {
    const candidate = {
      title: "Deep Reinforcement Learning in Robotics Navigation",
      authors: ["Smith, John"],
      year: "2024",
      doi: "10.1111/robotics.999",
    };
    const result = checkForDuplicates(candidate, existingLibrary);
    expect(result.isDuplicate).toBe(false);
  });

  it("treats exact title with conflicting authors as Possible Duplicate, never Definite or Likely", () => {
    // Existing has: Attention Is All You Need by Vaswani, Ashish
    const candidateWithDifferentAuthor = {
      title: "Attention Is All You Need",
      authors: ["Garcia, Fernando", "Martinez, Elena"],
      year: "2024",
    };
    const result = checkForDuplicates(candidateWithDifferentAuthor, existingLibrary);
    expect(result.isDuplicate).toBe(true);
    expect(result.confidence).toBe("possible");
    expect(result.reason).toContain("different author");
  });

  it("guarantees title similarity alone NEVER declares a Definite Duplicate", () => {
    const candidate = {
      title: "Attention Is All You Need",
    };
    const result = checkForDuplicates(candidate, existingLibrary);
    expect(result.confidence).not.toBe("definite");
  });
});
