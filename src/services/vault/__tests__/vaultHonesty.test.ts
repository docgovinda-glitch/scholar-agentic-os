import { describe, it, expect, vi, afterEach } from "vitest";
import { vaultItemToSource, sourceToVaultItemPayload } from "../sourceTypes";
import { generateKeyPointsAndNotes } from "../metadataService";
import { checkItemRetraction } from "../retractionService";

afterEach(() => vi.restoreAllMocks());

const paper = () =>
  sourceToVaultItemPayload({
    metadata: { title: "Array programming with NumPy", authors: ["Harris, C. R."], year: "2020", journal: "Nature", doi: "10.1038/s41586-020-2649-2", url: "https://doi.org/10.1038/s41586-020-2649-2", type: "paper" },
    projects: [],
    tags: [],
    notes: {},
    citation: "Harris (2020)",
  });

describe("Knowledge Vault keeps sources honest", () => {
  it("a paper saved with its doi.org link stays a paper", () => {
    const payload = paper();
    const s = vaultItemToSource({ id: "v1", createdAt: "2026-11-04", ...payload } as any);
    expect(s.metadata.type).toBe("paper");
  });

  it("is not marked as checked for retractions before a check runs", () => {
    const payload = paper();
    expect(payload.retractionStatus).toBe("unknown");
    expect(vaultItemToSource({ id: "v1", createdAt: "x", ...payload } as any).integrityStatus).toBe("unknown");
  });

  it("writes no notes, quotes or takeaways for the student, and quotes the abstract only", () => {
    const none = generateKeyPointsAndNotes({ title: "Array programming with NumPy", journal: "Nature", year: "2020" });
    expect(none).toMatchObject({ keyPoints: [], whySaved: "", keyQuote: "" });
    const abstract =
      "Array programming provides a powerful syntax for accessing and manipulating data. Here we review how a few fundamental array concepts lead to a simple and powerful programming paradigm. We show that NumPy underpins research across many fields.";
    const r = generateKeyPointsAndNotes({ title: "Array programming with NumPy", rawText: abstract });
    expect(r.whySaved).toBe("");
    expect(r.keyQuote).toBe("");
    for (const k of r.keyPoints) expect(abstract).toContain(k);
    expect(r.suggestedTags).not.toContain("provides");
  });

  it("a source without a DOI is 'not checked', never 'clean'", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const r = await checkItemRetraction({ id: "w", title: "A blog post", externalReference: "https://example.org/post", metadata: {} } as any);
    expect(r.status).toBe("unknown");
    expect(spy).not.toHaveBeenCalled();
  });
});
