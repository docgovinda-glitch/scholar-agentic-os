import { describe, expect, it } from "vitest";
import { askYearSuffixes, formatAskScholarBibliography, formatAskScholarInText } from "../scholarCitationEngine";

const cite = (title: string, authors: string[], year: number, doi: string) =>
  ({ title, authors, year, venue: "BMC Medical Education", url: `https://doi.org/${doi}`, doi, sourceType: "scholarly" }) as never;

// Two 2024 papers whose first author is Durrani (the case seen in a Deep Research report).
const list = [
  cite("Spaced repetition in paediatric rotations", ["Shazia Durrani", "Naveed Yousuf", "A Khan"], 2024, "10.1/a"),
  cite("Anki use among first-year students", ["Shazia Durrani", "Naveed Yousuf", "B Ali"], 2024, "10.1/b"),
  cite("Retrieval practice in pharmacology", ["Joan Magro"], 2024, "10.1/c"),
];

describe("same author, same year", () => {
  it("labels the two works 2024a and 2024b (ordered by title) in the text and the reference list", () => {
    expect(askYearSuffixes(list, "apa")).toEqual(new Map([[1, "a"], [0, "b"]]));
    expect(formatAskScholarInText(list[1], 1, "apa", list)).toMatch(/2024a/);
    expect(formatAskScholarInText(list[0], 0, "apa", list)).toMatch(/2024b/);
    expect(formatAskScholarInText(list[2], 2, "apa", list)).not.toMatch(/2024[ab]/);
    const bib = formatAskScholarBibliography(list, "apa").map((e) => e.formattedText);
    expect(bib.some((t) => t.includes("2024a"))).toBe(true);
    expect(bib.some((t) => t.includes("2024b"))).toBe(true);
  });

  it("adds nothing for numbered styles or when the list is not given", () => {
    expect(askYearSuffixes(list, "ieee").size).toBe(0);
    expect(formatAskScholarInText(list[0], 0, "apa")).not.toMatch(/2024[ab]/);
  });
});
