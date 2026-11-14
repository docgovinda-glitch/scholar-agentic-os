import { describe, it, expect } from "vitest";
import { CitationFormatterFactory } from "../../formattingEngine";
import type { CanonicalReference } from "../../model/reference";

const article: CanonicalReference = {
  kind: "JournalArticle",
  title: "Monetary transmission after the crisis",
  authors: [
    { firstName: "John Andrew", lastName: "Smith", order: 1 },
    { firstName: "Maria", lastName: "Lopez", order: 2 },
    { firstName: "K.", lastName: "van der Berg", order: 3 },
  ],
  source: "Journal of Money",
  journal: "Journal of Money",
  volume: "12",
  issue: "3",
  pages: "45-67",
  year: "2021",
  doi: "10.1000/xyz",
};
const book: CanonicalReference = {
  kind: "Book",
  title: "Central Banking",
  authors: [{ firstName: "Kate", lastName: "Jones", order: 1 }, { firstName: "Paul", lastName: "Lee", order: 2 }],
  source: "Academic Press",
  publisher: "Academic Press",
  year: "2019",
};

describe("shared reference-list entries (every workspace)", () => {
  it.each([
    ["apa7", article, "Smith, J. A., Lopez, M., & van der Berg, K. (2021). Monetary transmission after the crisis. *Journal of Money*, *12*(3), 45–67. https://doi.org/10.1000/xyz"],
    ["apa7", book, "Jones, K., & Lee, P. (2019). *Central Banking*. Academic Press."],
    ["harvard", article, "Smith, J.A., Lopez, M. and van der Berg, K. (2021) 'Monetary transmission after the crisis', *Journal of Money*, 12(3), pp. 45–67. Available at: https://doi.org/10.1000/xyz."],
    ["harvard", book, "Jones, K. and Lee, P. (2019) *Central Banking*. Academic Press."],
    ["ieee", article, "J. A. Smith, M. Lopez, and K. van der Berg, \"Monetary transmission after the crisis,\" *Journal of Money*, vol. 12, no. 3, pp. 45–67, 2021, doi: 10.1000/xyz."],
    ["ieee", book, "K. Jones and P. Lee, *Central Banking*. Academic Press, 2019."],
    ["chicago", article, "Smith, John Andrew, Maria Lopez, and K. van der Berg. 2021. \"Monetary transmission after the crisis.\" *Journal of Money* 12 (3): 45–67. https://doi.org/10.1000/xyz."],
    ["chicago", book, "Jones, Kate, and Paul Lee. 2019. *Central Banking*. Academic Press."],
    ["vancouver", article, "Smith JA, Lopez M, van der Berg K. Monetary transmission after the crisis. Journal of Money. 2021;12(3):45-67. doi:10.1000/xyz"],
    ["vancouver", book, "Jones K, Lee P. Central Banking. Academic Press; 2019."],
    ["mla9", article, "Smith, John Andrew, et al. \"Monetary transmission after the crisis.\" *Journal of Money*, vol. 12, no. 3, 2021, pp. 45–67, https://doi.org/10.1000/xyz."],
    ["mla9", book, "Jones, Kate, and Paul Lee. *Central Banking*. Academic Press, 2019."],
  ])("%s", (style, ref, expected) => {
    expect(CitationFormatterFactory.formatBibliography(style, ref as CanonicalReference)).toBe(expected);
  });

  it("never invents missing fields", () => {
    const bare: CanonicalReference = { kind: "JournalArticle", title: "A paper", authors: [{ firstName: "Hana", lastName: "Kim", order: 1 }], source: "", year: "2020" };
    for (const style of ["apa7", "harvard", "ieee", "chicago", "vancouver", "mla9"]) {
      const out = CitationFormatterFactory.formatBibliography(style, bare);
      expect(out, style).not.toMatch(/undefined|null|vol\. ,|pp\. ,|doi\.org\/undefined|Unknown/);
    }
  });

  it("numbers IEEE and Vancouver lists", () => {
    expect(CitationFormatterFactory.formatReferenceList("ieee", [article, book]).split("\n")[1]).toMatch(/^\[2\] K\. Jones/);
    expect(CitationFormatterFactory.formatReferenceList("vancouver", [article, book]).split("\n")[1]).toMatch(/^2\. Jones K/);
  });
});
