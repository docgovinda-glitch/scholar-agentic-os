import { describe, it, expect } from "vitest";
import { formatReference, generateReferenceList } from "../referenceListGenerator";
import type { DiscoveredSource } from "../../types";

const base = { mainFinding: "", suggestedUse: "", citation: "", status: "kept" as const };

describe("Coursework APA 7 reference list (shared citation_compliance engine)", () => {
  it("lists every author up to 20 with APA 7 punctuation and italics", () => {
    const s: DiscoveredSource = {
      ...base, id: "a", type: "journal_article", year: "2021",
      title: "Monetary transmission after the crisis",
      authors: ["Smith, John A.", "Maria Lopez", "van der Berg, K."],
      journal: "Journal of Money", volumeIssue: "12(3)", pages: "45-67", doi: "10.1000/xyz",
    };
    expect(formatReference(s, "apa7")).toBe(
      "Smith, J. A., Lopez, M., & van der Berg, K. (2021). Monetary transmission after the crisis. *Journal of Money*, *12*(3), 45-67. https://doi.org/10.1000/xyz"
    );
  });

  it("formats books and two authors, and leaves missing fields out", () => {
    const book: DiscoveredSource = { ...base, id: "b", type: "book", year: "2019", title: "Central Banking", authors: ["Jones, K.", "Lee, P."], publisher: "Academic Press" };
    expect(formatReference(book, "apa7")).toBe("Jones, K., & Lee, P. (2019). *Central Banking*. Academic Press.");
    const bare: DiscoveredSource = { ...base, id: "c", type: "journal_article", year: "2020", title: "A paper", authors: ["Kim, H."] };
    expect(formatReference(bare, "apa7")).toBe("Kim, H. (2020). A paper.");
  });

  it("keeps the list alphabetical", () => {
    const list = generateReferenceList(
      [
        { ...base, id: "1", type: "journal_article", year: "2020", title: "Z", authors: ["Zed, A."] },
        { ...base, id: "2", type: "journal_article", year: "2020", title: "A", authors: ["Abel, B."] },
      ],
      "apa7"
    );
    expect(list.map((e) => e.slice(0, 4))).toEqual(["Abel", "Zed,"]);
  });
});
