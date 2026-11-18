import { describe, it, expect } from "vitest";
import { mergeSearchResults } from "../services/sourceMerge";
import type { DiscoveredSource } from "../types";

const src = (id: string, extra: Partial<DiscoveredSource> = {}): DiscoveredSource =>
  ({ id, title: `Paper ${id}`, authors: [], year: "2020", type: "journal_article", citation: "", mainFinding: "", suggestedUse: "", status: "kept", ...extra }) as DiscoveredSource;

describe("mergeSearchResults", () => {
  it("a re-run search keeps approved, prescribed, Vault, hand-entered and removed sources", () => {
    const existing = [
      src("a"), // approved
      src("p", { prescribedInBrief: true }),
      src("vault-1", { vaultItemId: "1" }),
      src("src-custom-9"),
      src("gone", { status: "removed" }),
      src("old"), // unreviewed search result
    ];
    const { sources, added } = mergeSearchResults(existing, [src("n1"), src("n2")], ["a"], "replace");
    expect(sources.map((s) => s.id)).toEqual(["a", "p", "vault-1", "src-custom-9", "gone", "n1", "n2"]);
    expect(added.map((s) => s.id)).toEqual(["n1", "n2"]);
  });

  it("skips results already in the list by id, DOI or title, including removed ones", () => {
    const existing = [src("a", { doi: "10.1234/X" }), src("b", { title: "Same Title", status: "removed" })];
    const found = [src("a"), src("c", { doi: "https://doi.org/10.1234/x" }), src("d", { title: "same title" }), src("e")];
    const { added } = mergeSearchResults(existing, found, [], "add");
    expect(added.map((s) => s.id)).toEqual(["e"]);
  });
});

describe("search merge: the same work from different providers", () => {
  it("skips a result that is the same work as a listed one without a DOI (and the reverse)", () => {
    const prescribed = src("p", { title: "Customer loyalty programs and retention in grocery retail", authors: ["Smith, J."], year: "2019", prescribedInBrief: true });
    const found = [
      src("f1", { title: "Customer Loyalty Programs and Retention in Grocery Retail", doi: "10.1016/j.jretai.2019.01.002", authors: ["J. Smith"], year: "2019" }),
      src("f2", { title: "Loyalty: a review", doi: "10.1016/j.jretai.2019.01.002" }),
      src("f3", { title: "An unrelated study of something else", year: "2020" }),
    ];
    const { added } = mergeSearchResults([prescribed], found, [], "replace");
    expect(added.map((s) => s.id)).toEqual(["f3"]);
  });
});
