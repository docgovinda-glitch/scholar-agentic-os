import { describe, expect, it, vi } from "vitest";
import { arxivIdOf, canReadFullText, pmcidOf, readFullText, relevantPassages, withoutReferenceList } from "../fullTextReader.ts";
import { fetchEuropePmcFullText } from "../../../../src/shared/retrieval/providers.ts";
import type { SearchResultItem } from "../webSearchEngine.ts";

const source = (extra: Partial<SearchResultItem>): SearchResultItem => ({
  title: "Mindfulness in schools",
  url: "https://doi.org/10.1/x",
  snippet: "A short abstract.",
  domain: "doi.org",
  sourceType: "scholarly",
  authorityTier: "A",
  authorityBadge: "Scholarly index",
  score: 1,
  ...extra,
});

const article = (n: number) =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i + 1} describes the classroom programme, its eight weekly sessions and how teachers delivered them to pupils aged twelve to fifteen.`).join("\n\n");

describe("where a full text can come from", () => {
  it("finds a PMC id in an Europe PMC link and an arXiv id in a DOI or link", () => {
    expect(pmcidOf({ openAccessUrl: "https://europepmc.org/articles/PMC7654321?pdf=render", url: "" })).toBe("PMC7654321");
    expect(arxivIdOf({ doi: "10.48550/arXiv.2310.06825", url: "", openAccessUrl: undefined })).toBe("2310.06825");
    expect(arxivIdOf({ doi: undefined, url: "https://arxiv.org/abs/2401.01234", openAccessUrl: undefined })).toBe("2401.01234");
  });

  it("reads only scholarly sources with a PMC copy, an arXiv id or an open-access web page (not a PDF)", () => {
    expect(canReadFullText(source({ openAccessUrl: "https://journals.plos.org/plosone/article?id=10.1371/x" }))).toBe(true);
    expect(canReadFullText(source({ openAccessUrl: "https://example.org/paper.pdf" }))).toBe(false);
    expect(canReadFullText(source({ openAccessUrl: "https://europepmc.org/articles/PMC1234567?pdf=render" }))).toBe(true);
    expect(canReadFullText(source({ sourceType: "web", openAccessUrl: "https://example.org/a" }))).toBe(false);
    expect(canReadFullText(source({ doi: undefined }))).toBe(false);
    expect(canReadFullText(source({ doi: "10.1/x" }))).toBe(true);
    expect(canReadFullText(source({ openAccessUrl: "https://onlinelibrary.wiley.com/doi/pdfdirect/10.1111/x", doi: undefined }))).toBe(false);
  });
});

describe("readFullText", () => {
  it("takes a PubMed Central article as full text, without its reference list", async () => {
    const fetchPmc = vi.fn(async () => `${article(40)}\n\nReferences\n\nSmith J. 2020. Something.`);
    const got = await readFullText(source({ openAccessUrl: "https://europepmc.org/articles/PMC1234567?pdf=render" }), fetchPmc, async () => undefined);
    expect(fetchPmc).toHaveBeenCalledWith("PMC1234567", expect.anything());
    expect(got?.via).toBe("pmc");
    expect(got?.text).not.toMatch(/Smith J\. 2020/);
  });

  it("finds the PubMed Central copy of a paper by its DOI", async () => {
    const findPmcid = vi.fn(async () => "PMC7654321");
    const fetchPmc = vi.fn(async () => article(40));
    const got = await readFullText(source({ doi: "10.1111/camh.12572" }), fetchPmc, findPmcid);
    expect(findPmcid).toHaveBeenCalledWith("10.1111/camh.12572");
    expect(fetchPmc).toHaveBeenCalledWith("PMC7654321", expect.anything());
    expect(got?.via).toBe("pmc");
  });

  it("does not count a page no longer than an abstract as read in full", async () => {
    const fetchPmc = vi.fn(async () => "Only an abstract of a few sentences.");
    expect(await readFullText(source({ openAccessUrl: "https://europepmc.org/articles/PMC1234567" }), fetchPmc, async () => undefined)).toBeNull();
  });
});

describe("relevantPassages", () => {
  it("keeps the paragraphs that match the question, in their original order", () => {
    const text = [
      "Introduction paragraph about the history of meditation practices across many cultures and centuries in general terms.",
      "Methods: 412 adolescents completed the anxiety questionnaire before and after the eight-week mindfulness course in school.",
      "Unrelated paragraph about funding, ethics approval and the data availability statement for this particular article.",
      "Results: anxiety scores fell more in the mindfulness group than in the control group at follow-up, among adolescents.",
    ].join("\n\n");
    const out = relevantPassages(text, "Does school mindfulness reduce anxiety in adolescents?", 400);
    expect(out).toMatch(/^Methods: 412 adolescents/);
    expect(out).toMatch(/Results: anxiety scores fell/);
    expect(out).not.toMatch(/funding/);
  });

  it("cuts the reference list only from the second half of a text", () => {
    expect(withoutReferenceList("Intro\n\nReferences\n\nBody text that continues well beyond the heading and keeps going for a long while")).toMatch(/Body text/);
  });
});

describe("fetchEuropePmcFullText", () => {
  it("returns the article body as paragraphs, without figures, tables or citation markers", async () => {
    const xml = `<article><front><title>T</title></front><body><sec><title>Results</title><p>Anxiety fell<xref ref-type="bibr">12</xref> in the course group.</p><table-wrap><p>table</p></table-wrap></sec></body><back><ref-list>refs</ref-list></back></article>`;
    const fetchImpl = vi.fn(async () => new Response(xml, { status: 200 }));
    const text = await fetchEuropePmcFullText("pmc123", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://www.ebi.ac.uk/europepmc/webservices/rest/PMC123/fullTextXML");
    expect(text).toBe("Results\n\nAnxiety fell in the course group.");
    expect(await fetchEuropePmcFullText("not-a-pmcid", { fetchImpl: fetchImpl as unknown as typeof fetch })).toBeUndefined();
  });
});

describe("lookupEuropePmcOpenAccessIds", () => {
  it("looks every DOI up in one search and keeps only open-access PMC copies", async () => {
    const body = { resultList: { result: [
      { doi: "10.1/A", pmcid: "PMC111", isOpenAccess: "Y" },
      { doi: "10.1/b", pmcid: "PMC222", isOpenAccess: "N" },
      { doi: "10.9/other", pmcid: "PMC333", isOpenAccess: "Y" },
    ] } };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const { lookupEuropePmcOpenAccessIds } = await import("../../../../src/shared/retrieval/providers.ts");
    const ids = await lookupEuropePmcOpenAccessIds(["https://doi.org/10.1/a", "10.1/b"], { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(fetchImpl.mock.calls[0][0]).replace(/\+/g, " "))).toMatch(/DOI:"10\.1\/a" OR DOI:"10\.1\/b"/);
    expect([...ids]).toEqual([["10.1/a", "PMC111"]]);
  });
});

describe("PubMed Central through NCBI", () => {
  it("converts DOIs to PMC ids in one call, sending a tool name and no email", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ records: [{ "requested-id": "10.2147/nss.s223917", pmcid: "PMC7007500" }, { "requested-id": "10.1/none" }] }), { status: 200 }));
    const { lookupPmcIdsByDoi } = await import("../../../../src/shared/retrieval/providers.ts");
    const ids = await lookupPmcIdsByDoi(["10.2147/NSS.S223917", "10.1/none"], { fetchImpl: fetchImpl as unknown as typeof fetch });
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toMatch(/^https:\/\/pmc\.ncbi\.nlm\.nih\.gov\/tools\/idconv\/api\/v1\/articles\/\?/);
    expect(url).toMatch(/tool=scholar-core/);
    expect(url).not.toMatch(/email=/);
    expect([...ids]).toEqual([["10.2147/nss.s223917", "PMC7007500"]]);
  });

  it("reads the article from NCBI, and from Europe PMC when NCBI has no body", async () => {
    const { fetchPmcFullText } = await import("../../../../src/shared/retrieval/providers.ts");
    const jats = "<article><body><sec><title>Results</title><p>Recall improved after sleep.</p></sec></body></article>";
    const ncbi = vi.fn(async () => new Response(jats, { status: 200 }));
    expect(await fetchPmcFullText("PMC4836663", { fetchImpl: ncbi as unknown as typeof fetch })).toBe("Results\n\nRecall improved after sleep.");
    expect(String(ncbi.mock.calls[0][0])).toMatch(/efetch\.fcgi\?db=pmc&id=4836663/);

    const fallback = vi.fn(async (url: string) => new Response(url.includes("ncbi") ? "<article><front/></article>" : jats, { status: 200 }));
    expect(await fetchPmcFullText("PMC1", { fetchImpl: fallback as unknown as typeof fetch })).toBe("Results\n\nRecall improved after sleep.");
    expect(String(fallback.mock.calls[1][0])).toMatch(/europepmc\/webservices\/rest\/PMC1\/fullTextXML/);
  });
});

describe("cleaning PMC text and off-topic web pages", () => {
  it("leaves no empty brackets where citation numbers were removed", async () => {
    const { jatsBodyText } = await import("../../../../src/shared/retrieval/providers.ts");
    const xml = '<body><p>Shown to benefit from sleep [<xref ref-type="bibr">12</xref>], and used by Wilhelm et al. (<xref>4</xref>, <xref>5</xref>).</p></body>';
    expect(jatsBodyText(xml)).toBe("Shown to benefit from sleep, and used by Wilhelm et al.");
  });

  it("keeps a web page only when it shares a meaningful word with its search", async () => {
    const { sharesQueryTerm } = await import("../deepResearchEngine.ts");
    expect(sharesQueryTerm("sleep memory consolidation university students", "Joseph II, Holy Roman Emperor, studied at university")).toBe(false);
    expect(sharesQueryTerm("sleep memory consolidation university students", "How sleep helps students remember lectures")).toBe(true);
  });
});

