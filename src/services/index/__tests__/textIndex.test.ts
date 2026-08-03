import { describe, it, expect } from "vitest";
import { TextIndex } from "../textIndex";

describe("services/index: TextIndex (BM25)", () => {
  it("finds a document containing the query term", () => {
    const index = new TextIndex();
    index.addOrUpdate("doc-1", "The quick brown fox jumps over the lazy dog");
    index.addOrUpdate("doc-2", "A completely unrelated sentence about weather");
    const hits = index.search("fox");
    expect(hits.map((h) => h.id)).toEqual(["doc-1"]);
  });

  it("ranks a document mentioning the query term more often above one mentioning it once", () => {
    const index = new TextIndex();
    index.addOrUpdate("frequent", "citation citation citation methodology results discussion conclusion");
    index.addOrUpdate("rare", "citation methodology results discussion conclusion introduction background");
    const hits = index.search("citation");
    expect(hits[0].id).toBe("frequent");
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("returns an empty array for a query with no matching terms", () => {
    const index = new TextIndex();
    index.addOrUpdate("doc-1", "hello world");
    expect(index.search("nonexistentterm")).toEqual([]);
  });

  it("returns an empty array for an empty index", () => {
    const index = new TextIndex();
    expect(index.search("anything")).toEqual([]);
  });

  it("addOrUpdate() replaces prior content for the same id rather than accumulating it", () => {
    const index = new TextIndex();
    index.addOrUpdate("doc-1", "apples");
    index.addOrUpdate("doc-1", "oranges");
    expect(index.search("apples")).toEqual([]);
    expect(index.search("oranges").map((h) => h.id)).toEqual(["doc-1"]);
    expect(index.size).toBe(1);
  });

  it("remove() drops a document from search results and from size()", () => {
    const index = new TextIndex();
    index.addOrUpdate("doc-1", "searchable content here");
    expect(index.size).toBe(1);
    index.remove("doc-1");
    expect(index.size).toBe(0);
    expect(index.search("searchable")).toEqual([]);
  });

  it("remove() on an unindexed id is a harmless no-op", () => {
    const index = new TextIndex();
    expect(() => index.remove("never-indexed")).not.toThrow();
  });

  it("rebuild() clears prior state and reindexes from scratch — the 'derived, rebuildable' contract", () => {
    const index = new TextIndex();
    index.addOrUpdate("stale", "old content");
    index.rebuild([
      { id: "a", text: "fresh alpha content" },
      { id: "b", text: "fresh beta content" },
    ]);
    expect(index.size).toBe(2);
    expect(index.search("old")).toEqual([]);
    expect(index.search("fresh").map((h) => h.id).sort()).toEqual(["a", "b"]);
  });

  it("respects the limit parameter", () => {
    const index = new TextIndex();
    for (let i = 0; i < 20; i++) index.addOrUpdate(`doc-${i}`, "shared term");
    expect(index.search("shared", 5)).toHaveLength(5);
  });

  it("is case-insensitive and ignores punctuation", () => {
    const index = new TextIndex();
    index.addOrUpdate("doc-1", "Rubric-Compliance, and G6!");
    expect(index.search("rubric").map((h) => h.id)).toEqual(["doc-1"]);
    expect(index.search("COMPLIANCE").map((h) => h.id)).toEqual(["doc-1"]);
  });

  it("a multi-term query matches on any term (OR semantics) and ranks by combined score", () => {
    const index = new TextIndex();
    index.addOrUpdate("both", "claim evidence");
    index.addOrUpdate("one", "claim only, nothing else relevant here at all");
    const hits = index.search("claim evidence");
    expect(hits.map((h) => h.id)).toContain("both");
    expect(hits.map((h) => h.id)).toContain("one");
    expect(hits.find((h) => h.id === "both")!.score).toBeGreaterThan(hits.find((h) => h.id === "one")!.score);
  });
});
