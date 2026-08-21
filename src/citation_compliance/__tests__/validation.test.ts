import { describe, it, expect } from "vitest";
import { validateCitationCompleteness } from "../validation";
import type { CanonicalReference } from "../model/reference";

describe("Deterministic Citation Completeness Validation", () => {
  it("fails validation when reference is null or undefined", () => {
    const res1 = validateCitationCompleteness(null);
    expect(res1.isValid).toBe(false);
    expect(res1.missingFields).toContain("reference");

    const res2 = validateCitationCompleteness(undefined);
    expect(res2.isValid).toBe(false);
  });

  it("fails validation when title is missing or blank", () => {
    const ref: CanonicalReference = {
      kind: "JournalArticle",
      title: "   ",
      authors: [{ firstName: "John", lastName: "Smith", order: 1 }],
      source: "Nature",
      year: "2024",
    };
    const res = validateCitationCompleteness(ref);
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain("title");
  });

  it("validates complete JournalArticle", () => {
    const ref: CanonicalReference = {
      kind: "JournalArticle",
      title: "Quantum Supremacy Using a Programmable Superconducting Processor",
      authors: [{ firstName: "Frank", lastName: "Arute", order: 1 }],
      source: "Nature",
      journal: "Nature",
      year: "2019",
      volume: "574",
      pages: "505-510",
      doi: "10.1038/s41586-019-1666-5",
    };
    const res = validateCitationCompleteness(ref);
    expect(res.isValid).toBe(true);
    expect(res.missingFields).toHaveLength(0);
  });

  it("catches missing journal/source and year for JournalArticle", () => {
    const ref: CanonicalReference = {
      kind: "JournalArticle",
      title: "Some Paper",
      authors: [{ firstName: "A.", lastName: "Author", order: 1 }],
      source: "",
    };
    const res = validateCitationCompleteness(ref);
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain("journal");
    expect(res.missingFields).toContain("year");
  });

  it("validates complete Book and catches missing publisher", () => {
    const completeBook: CanonicalReference = {
      kind: "Book",
      title: "Introduction to Algorithms",
      authors: [
        { firstName: "Thomas", lastName: "Cormen", order: 1 },
        { firstName: "Charles", lastName: "Leiserson", order: 2 },
      ],
      publisher: "MIT Press",
      year: "2009",
      source: "MIT Press",
    };
    expect(validateCitationCompleteness(completeBook).isValid).toBe(true);

    const incompleteBook: CanonicalReference = {
      kind: "Book",
      title: "Algorithms",
      authors: [{ firstName: "T.", lastName: "Cormen", order: 1 }],
      source: "",
      year: "2009",
    };
    const res = validateCitationCompleteness(incompleteBook);
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain("publisher");
  });

  it("validates complete Website with access date and URL", () => {
    const completeWeb: CanonicalReference = {
      kind: "Website",
      title: "WHO COVID-19 Dashboard",
      authors: [{ firstName: "World Health", lastName: "Organization", order: 1 }],
      source: "World Health Organization",
      url: "https://covid19.who.int",
      accessDate: "2024-01-15",
    };
    expect(validateCitationCompleteness(completeWeb).isValid).toBe(true);

    const missingUrlWeb: CanonicalReference = {
      kind: "Website",
      title: "Web Article",
      authors: [],
      source: "Some Site",
    };
    const res = validateCitationCompleteness(missingUrlWeb);
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain("url");
  });

  it("validates complete Dataset with DOI/URL and creator", () => {
    const dataset: CanonicalReference = {
      kind: "Dataset",
      title: "Global Surface Temperature Anomalies",
      authors: [{ firstName: "NASA", lastName: "GISS", order: 1 }],
      source: "NASA Goddard Institute",
      year: "2023",
      doi: "10.5067/TEMPANOM-01",
    };
    expect(validateCitationCompleteness(dataset).isValid).toBe(true);

    const missingDoiDataset: CanonicalReference = {
      kind: "Dataset",
      title: "Temperature Dataset",
      authors: [{ firstName: "NASA", lastName: "GISS", order: 1 }],
      source: "NASA",
      year: "2023",
    };
    const res = validateCitationCompleteness(missingDoiDataset);
    expect(res.isValid).toBe(false);
    expect(res.missingFields).toContain("doi_or_url");
  });

  it("accepts publicationDate in lieu of year", () => {
    const ref: CanonicalReference = {
      kind: "JournalArticle",
      title: "Advances in Neural Information Processing",
      authors: [{ firstName: "Ian", lastName: "Goodfellow", order: 1 }],
      source: "NeurIPS",
      publicationDate: "2014-12-01",
    };
    const res = validateCitationCompleteness(ref);
    expect(res.isValid).toBe(true);
  });
});
