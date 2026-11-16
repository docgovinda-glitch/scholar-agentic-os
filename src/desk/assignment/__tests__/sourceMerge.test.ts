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
    const existing = [src("a", { doi: "10.1/X" }), src("b", { title: "Same Title", status: "removed" })];
    const found = [src("a"), src("c", { doi: "https://doi.org/10.1/x" }), src("d", { title: "same title" }), src("e")];
    const { added } = mergeSearchResults(existing, found, [], "add");
    expect(added.map((s) => s.id)).toEqual(["e"]);
  });
});
