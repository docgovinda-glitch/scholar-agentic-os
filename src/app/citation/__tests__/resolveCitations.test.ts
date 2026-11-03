import { describe, it, expect } from "vitest";
import { resolveCitations, sourceToReference, isKnownCitationStyle, knownCitationStyleIds } from "../resolveCitations";
import { emptyDocument } from "../../../domain/document/model";
import { appendBlock } from "../../../domain/document/ops";
import type { DiscoveredSource, EvidenceItem, EvidenceLedger } from "../../../domain/evidence/types";

function source(id: string, overrides: Partial<DiscoveredSource> = {}): DiscoveredSource {
  const base: DiscoveredSource = {
    id,
    title: `Title of ${id}`,
    authors: ["Jane Q. Smith"],
    sourceType: "scholarly",
    authorityTier: "A",
    discoveredVia: "manual",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    venue: "Journal of Testing",
    year: 2023,
    citationStatus: "confirmed",
    ...overrides,
  };
  base.canonicalReference = sourceToReference(base);
  return base;
}

function item(id: string, sourceId: string): EvidenceItem {
  return { id, sourceId, state: "citable", quote: "q", history: [] };
}

function ledger(sources: DiscoveredSource[], items: EvidenceItem[]): EvidenceLedger {
  return { sources, items };
}

describe("app/citation: sourceToReference", () => {
  it("splits a single free-text author name into first/last, never inventing a middle name", () => {
    const ref = sourceToReference(source("s1", { authors: ["Jane Q. Smith"] }));
    expect(ref.authors[0]).toMatchObject({ firstName: "Jane Q.", lastName: "Smith" });
  });

  it("treats a single-word author name as lastName only, with no firstName", () => {
    const ref = sourceToReference(source("s1", { authors: ["Cher"] }));
    expect(ref.authors[0]).toMatchObject({ firstName: "", lastName: "Cher" });
  });

  it("omits doi/url/year when the source doesn't have them, rather than inventing placeholders", () => {
    const ref = sourceToReference(source("s1", { doi: undefined, url: undefined, year: undefined }));
    expect(ref.doi).toBeUndefined();
    expect(ref.url).toBeUndefined();
    expect(ref.year).toBeUndefined();
  });

  it("maps sourceType to a ReferenceKind using only data the source already captured", () => {
    expect(sourceToReference(source("s1", { sourceType: "web" })).kind).toBe("Website");
    expect(sourceToReference(source("s1", { sourceType: "official" })).kind).toBe("GovernmentPublication");
    expect(sourceToReference(source("s1", { sourceType: "scholarly" })).kind).toBe("JournalArticle");
  });
});

describe("app/citation: isKnownCitationStyle / knownCitationStyleIds", () => {
  it("recognises all seven real styles and rejects an unknown one", () => {
    expect(knownCitationStyleIds().sort()).toEqual(["apa-7", "chicago-author-date", "chicago-notes-bibliography", "harvard", "ieee", "mla-9", "vancouver"].sort());
    expect(isKnownCitationStyle("vancouver")).toBe(true);
    expect(isKnownCitationStyle("mla-9")).toBe(true);
    expect(isKnownCitationStyle("apa-6")).toBe(false);
  });
});

describe("app/citation: resolveCitations", () => {
  it("throws for an unknown style id", () => {
    expect(() => resolveCitations(emptyDocument("d1", "T"), ledger([], []), "apa-6")).toThrow(/Unknown citation style/);
  });

  it("is a safe no-op when the document has no bracket-ids to resolve", () => {
    const doc = emptyDocument("d1", "T");
    const result = resolveCitations(doc, ledger([], []), "apa-7");
    expect(result.citedSourceIds).toEqual([]);
    expect(result.unresolvedIds).toEqual([]);
    expect(result.document).toBe(doc); // untouched, same reference
  });

  it("does not mutate the input document", () => {
    let doc = emptyDocument("d1", "T");
    doc = appendBlock(doc, "introduction", "paragraph", "A claim is supported [ev-1].");
    const originalText = doc.blocks[0].text;
    resolveCitations(doc, ledger([source("s1")], [item("ev-1", "s1")]), "apa-7");
    expect(doc.blocks[0].text).toBe(originalText);
  });

  it("replaces a bracket-id with a numbered in-text citation for Vancouver, and builds a numbered bibliography in citation order", () => {
    let doc = emptyDocument("d1", "T");
    doc = appendBlock(doc, "introduction", "paragraph", "First point [ev-2]. Second point [ev-1].");
    doc = appendBlock(doc, "references", "paragraph", "");
    const result = resolveCitations(
      doc,
      ledger([source("s1", { title: "First Source" }), source("s2", { title: "Second Source" })], [item("ev-1", "s1"), item("ev-2", "s2")]),
      "vancouver"
    );
    const intro = result.document.blocks.find((b) => b.id === "introduction")!;
    expect(intro.text).toBe("First point [1]. Second point [2].");
    const refs = result.document.blocks.find((b) => b.id === "references")!;
    expect(refs.text).toContain("1. ");
    expect(refs.text.indexOf("Second Source")).toBeLessThan(refs.text.indexOf("First Source")); // s2 was cited first
    expect(result.citedSourceIds).toEqual(["s2", "s1"]); // citation order for a numbered-bibliography style
  });

  it("replaces a bracket-id with an author-date in-text citation for APA 7, and alphabetizes the bibliography by author", () => {
    let doc = emptyDocument("d1", "T");
    doc = appendBlock(doc, "introduction", "paragraph", "Zebra's finding [ev-z]. Also Apple's finding [ev-a].");
    const result = resolveCitations(
      doc,
      ledger(
        [source("s-zebra", { authors: ["Zoe Zebra"], year: 2020 }), source("s-apple", { authors: ["Amy Apple"], year: 2021 })],
        [item("ev-z", "s-zebra"), item("ev-a", "s-apple")]
      ),
      "apa-7"
    );
    const intro = result.document.blocks.find((b) => b.id === "introduction")!;
    expect(intro.text).toContain("(Zebra, 2020)");
    expect(intro.text).toContain("(Apple, 2021)");
    // Cited in order zebra-then-apple, but the bibliography is alphabetical: Apple before Zebra.
    expect(result.citedSourceIds).toEqual(["s-apple", "s-zebra"]);
    const refs = result.document.blocks.find((b) => b.id === "references")!;
    expect(refs.text.indexOf("Apple")).toBeLessThan(refs.text.indexOf("Zebra"));
  });

  it("chicago-notes-bibliography: in-text markers follow citation order, but the bibliography stays alphabetical", () => {
    let doc = emptyDocument("d1", "T");
    doc = appendBlock(doc, "introduction", "paragraph", "Zebra's finding [ev-z]. Also Apple's finding [ev-a].");
    const result = resolveCitations(
      doc,
      ledger([source("s-zebra", { authors: ["Zoe Zebra"] }), source("s-apple", { authors: ["Amy Apple"] })], [item("ev-z", "s-zebra"), item("ev-a", "s-apple")]),
      "chicago-notes-bibliography"
    );
    const intro = result.document.blocks.find((b) => b.id === "introduction")!;
    expect(intro.text).toContain("Zebra's finding 1."); // cited first -> footnote 1
    expect(intro.text).toContain("Also Apple's finding 2."); // cited second -> footnote 2
    const refs = result.document.blocks.find((b) => b.id === "references")!;
    expect(refs.text.indexOf("Apple")).toBeLessThan(refs.text.indexOf("Zebra")); // bibliography stays alphabetical
    expect(refs.text).not.toMatch(/^\d+\.\s/); // no numeric prefix — only vancouver/ieee bibliographies are numbered
  });

  it("the same source cited via two different evidence items gets one bibliography entry and the same in-text marker both times", () => {
    let doc = emptyDocument("d1", "T");
    doc = appendBlock(doc, "introduction", "paragraph", "One quote [ev-1a]. Another quote from the same paper [ev-1b].");
    const result = resolveCitations(doc, ledger([source("s1")], [item("ev-1a", "s1"), item("ev-1b", "s1")]), "vancouver");
    const intro = result.document.blocks.find((b) => b.id === "introduction")!;
    expect(intro.text).toBe("One quote [1]. Another quote from the same paper [1].");
    expect(result.citedSourceIds).toEqual(["s1"]);
  });

  it("leaves an unresolved bracket-id untouched (unknown evidence id) and reports it, never fabricating a citation", () => {
    let doc = emptyDocument("d1", "T");
    doc = appendBlock(doc, "introduction", "paragraph", "A claim [ev-does-not-exist].");
    const result = resolveCitations(doc, ledger([], []), "apa-7");
    const intro = result.document.blocks.find((b) => b.id === "introduction")!;
    expect(intro.text).toBe("A claim [ev-does-not-exist].");
    expect(result.unresolvedIds).toEqual(["ev-does-not-exist"]);
  });

  it("leaves an unresolved bracket-id untouched when the evidence item's source is missing from the ledger", () => {
    let doc = emptyDocument("d1", "T");
    doc = appendBlock(doc, "introduction", "paragraph", "A claim [ev-1].");
    const result = resolveCitations(doc, ledger([], [item("ev-1", "no-such-source")]), "apa-7");
    const intro = result.document.blocks.find((b) => b.id === "introduction")!;
    expect(intro.text).toBe("A claim [ev-1].");
    expect(result.unresolvedIds).toEqual(["ev-1"]);
  });

  it("appends a references block if the document doesn't have one yet", () => {
    let doc = emptyDocument("d1", "T");
    doc = appendBlock(doc, "introduction", "paragraph", "A claim [ev-1].");
    const result = resolveCitations(doc, ledger([source("s1")], [item("ev-1", "s1")]), "apa-7");
    expect(result.document.blocks.find((b) => b.id === "references")).toBeDefined();
  });

  it("replaces an existing references block's text rather than duplicating it", () => {
    let doc = emptyDocument("d1", "T");
    doc = appendBlock(doc, "introduction", "paragraph", "A claim [ev-1].");
    doc = appendBlock(doc, "references", "paragraph", "placeholder");
    const result = resolveCitations(doc, ledger([source("s1")], [item("ev-1", "s1")]), "apa-7");
    const referenceBlocks = result.document.blocks.filter((b) => b.id === "references");
    expect(referenceBlocks).toHaveLength(1);
    expect(referenceBlocks[0].text).not.toBe("placeholder");
  });
});

describe("app/citation: adversarial security validation", () => {
  it("Case A: Formal citation rejected when citation_status is 'missing'", () => {
    const doc = appendBlock(emptyDocument("d1", "T"), "intro", "paragraph", "A claim [ev-1].");
    const result = resolveCitations(
      doc,
      ledger([source("s1", { citationStatus: "missing" })], [item("ev-1", "s1")]),
      "apa-7"
    );
    expect(result.citedSourceIds).toEqual([]);
    expect(result.unresolvedIds).toEqual(["ev-1"]);
    expect(result.document.blocks[0].text).toBe("A claim [ev-1]."); // untranslated
  });

  it("Case B: Formal citation rejected when citation_status is 'needs_user_review'", () => {
    const doc = appendBlock(emptyDocument("d1", "T"), "intro", "paragraph", "A claim [ev-1].");
    const result = resolveCitations(
      doc,
      ledger([source("s1", { citationStatus: "needs_user_review" })], [item("ev-1", "s1")]),
      "apa-7"
    );
    expect(result.citedSourceIds).toEqual([]);
    expect(result.unresolvedIds).toEqual(["ev-1"]);
  });

  it("Case C: Formal citation rejected when citation_status is 'confirmed' but canonical_reference is incomplete", () => {
    const doc = appendBlock(emptyDocument("d1", "T"), "intro", "paragraph", "A claim [ev-1].");
    const incompleteSource = source("s1", { citationStatus: "confirmed" });
    incompleteSource.canonicalReference = { kind: "JournalArticle" } as any; // clearly incomplete
    const result = resolveCitations(doc, ledger([incompleteSource], [item("ev-1", "s1")]), "apa-7");
    expect(result.citedSourceIds).toEqual([]);
    expect(result.unresolvedIds).toEqual(["ev-1"]);
  });

  it("Case D: Formal citation accepted when citation_status is 'confirmed' and canonical_reference is valid", () => {
    const doc = appendBlock(emptyDocument("d1", "T"), "intro", "paragraph", "A claim [ev-1].");
    const result = resolveCitations(doc, ledger([source("s1")], [item("ev-1", "s1")]), "apa-7");
    expect(result.citedSourceIds).toEqual(["s1"]);
    expect(result.unresolvedIds).toEqual([]);
    expect(result.document.blocks.find(b => b.id === "references")).toBeDefined();
  });

  it("Case E: AI invents author/title/year for unconfirmed source -> rejected, not trusted", () => {
    const doc = appendBlock(emptyDocument("d1", "T"), "intro", "paragraph", "Fake fact [ev-1].");
    // Even if AI wrote a perfect citation in the manuscript text, if it uses [ev-1] and the source is missing, it's rejected.
    const result = resolveCitations(
      doc,
      ledger([source("s1", { citationStatus: "missing" })], [item("ev-1", "s1")]),
      "apa-7"
    );
    expect(result.citedSourceIds).toEqual([]);
    expect(result.unresolvedIds).toEqual(["ev-1"]);
  });

  it("Case F & G: AI references source ID belonging to another user or project -> access denied (not in ledger)", () => {
    const doc = appendBlock(emptyDocument("d1", "T"), "intro", "paragraph", "A claim [ev-other-project].");
    const result = resolveCitations(doc, ledger([], []), "apa-7");
    expect(result.citedSourceIds).toEqual([]);
    expect(result.unresolvedIds).toEqual(["ev-other-project"]);
  });
});
