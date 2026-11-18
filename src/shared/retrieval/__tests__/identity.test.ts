import { describe, it, expect } from "vitest";
import { arxivId, clusterWorks, dedupeWorks, firstAuthorSurname, isSameWork, normalizeWorkTitle, workKeys } from "../identity";

describe("source identity", () => {
  it("matches the same paper with and without a DOI (the duplicate students saw)", () => {
    const crossref = { title: "Customer loyalty programs and retention in grocery retail", doi: "10.1016/j.jretai.2019.01.002", authors: ["Smith, J."], year: 2019 };
    const semantic = { title: "Customer Loyalty Programs and Retention in Grocery Retail.", authors: ["J. Smith"], year: "2019" };
    expect(isSameWork(crossref, semantic)).toBe(true);
  });

  it("normalises DOI forms", () => {
    expect(isSameWork({ doi: "https://doi.org/10.1000/ABC.1" }, { doi: "doi:10.1000/abc.1" })).toBe(true);
  });

  it("matches an arXiv preprint by its arXiv DOI and abs URL, ignoring the version", () => {
    expect(arxivId({ doi: "10.48550/arXiv.1706.03762" })).toBe("1706.03762");
    expect(isSameWork({ doi: "10.48550/arXiv.1706.03762" }, { url: "https://arxiv.org/abs/1706.03762v5" })).toBe(true);
  });

  it("matches a title with and without its subtitle by the same first author and year", () => {
    expect(isSameWork({ title: "Deep learning: a review of methods", authors: ["LeCun, Y."], year: 2015 }, { title: "Deep learning", authors: ["Yann LeCun"], year: 2015 })).toBe(true);
    // Same short title, different author: different works.
    expect(isSameWork({ title: "Deep learning: a review", authors: ["LeCun, Y."], year: 2015 }, { title: "Deep learning", authors: ["Goodfellow, I."], year: 2016 })).toBe(false);
  });

  it("does not merge short generic titles from different years", () => {
    expect(isSameWork({ title: "Introduction", year: 2001 }, { title: "Introduction", year: 2010 })).toBe(false);
    expect(workKeys({ title: "Introduction" })).toEqual([]);
  });

  it("reads surnames in the usual name orders", () => {
    expect(firstAuthorSurname(["Smith, J."])).toBe("smith");
    expect(firstAuthorSurname(["Jane Smith"])).toBe("smith");
    expect(firstAuthorSurname(["Smith JA"])).toBe("smith");
    expect(firstAuthorSurname(["et al."])).toBeUndefined();
    expect(normalizeWorkTitle("The Économie & Société")).toBe("economie and societe");
  });

  it("clusters by any shared key, transitively", () => {
    const a = { title: "Retention effects of loyalty schemes in UK supermarkets", doi: "10.1234/x" };
    const b = { title: "Retention effects of loyalty schemes in UK supermarkets" };
    const c = { doi: "10.1234/X", title: "Retention effects of loyalty schemes (UK)" };
    const d = { title: "A different paper about something else entirely" };
    expect(clusterWorks([a, b, c, d]).map((g) => g.length)).toEqual([3, 1]);
  });

  it("keeps the most complete record of each work, with the others' links", () => {
    const thin = { title: "Retention effects of loyalty schemes in UK supermarkets", url: "https://www.semanticscholar.org/paper/abc" };
    const full = { title: "Retention effects of loyalty schemes in UK supermarkets", doi: "10.1234/x", authors: ["Smith, J."], year: 2020, url: "https://doi.org/10.1/x" };
    const out = dedupeWorks([thin, full]);
    expect(out).toHaveLength(1);
    expect(out[0].doi).toBe("10.1234/x");
    expect(out[0].alternateLinks).toEqual(["https://www.semanticscholar.org/paper/abc"]);
  });
});
