import { describe, it, expect } from "vitest";
import { isRetrievalServiceName, venueOrEmpty } from "../venue";

describe("venue names", () => {
  it("never treats a lookup service as the journal", () => {
    expect(isRetrievalServiceName("crossref")).toBe(true);
    expect(isRetrievalServiceName(" Crossref ")).toBe(true);
    expect(isRetrievalServiceName("Semantic Scholar")).toBe(true);
    expect(isRetrievalServiceName("Nature")).toBe(false);
    expect(isRetrievalServiceName("arXiv")).toBe(false);
  });
  it("picks the first real venue", () => {
    expect(venueOrEmpty(undefined, "crossref")).toBe("");
    expect(venueOrEmpty("", "openalex", "The Lancet")).toBe("The Lancet");
    expect(venueOrEmpty("Journal of Finance", "crossref")).toBe("Journal of Finance");
  });
});
