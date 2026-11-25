import { describe, it, expect } from "vitest";
import { normalizeAuthorName, cleanVenue, plainTitle } from "../authorNames";

describe("authorNames", () => {
  it("title-cases shouting surnames and keeps diacritics and mixed case", () => {
    expect(normalizeAuthorName("GARCÍA IOMMI, LUCRECIA")).toBe("García Iommi, Lucrecia");
    expect(normalizeAuthorName("Wendt, Alexander")).toBe("Wendt, Alexander");
    expect(normalizeAuthorName("VAN DER BERG, J.")).toBe("Van der Berg, J.");
    expect(normalizeAuthorName("O'NEILL, SEAN")).toBe("O'Neill, Sean");
  });
  it("never accepts a provider id as a venue", () => {
    expect(cleanVenue("crossref")).toBeUndefined();
    expect(cleanVenue("OpenAlex")).toBeUndefined();
    expect(cleanVenue("International Organization")).toBe("International Organization");
  });
  it("strips Markdown from titles", () => {
    expect(plainTitle("**Direct Answer** Wendt vs Mearsheimer in Asia?")).toBe("Direct Answer Wendt vs Mearsheimer in Asia");
  });
});
