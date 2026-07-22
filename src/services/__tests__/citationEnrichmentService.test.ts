import { describe, it, expect, vi, afterEach } from "vitest";
import { lookupCitation, lookupByIdentifier } from "../citationEnrichmentService";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function crossrefWork(overrides: any = {}) {
  return {
    message: {
      title: ["A Real Paper"],
      abstract: "<jats:p>Crossref abstract text.</jats:p>",
      author: [{ given: "Ada", family: "Lovelace" }],
      "container-title": ["Journal of Testing"],
      publisher: "Test Publisher",
      volume: "12",
      issue: "3",
      ISSN: ["1111-1111", "2222-2222"],
      published: { "date-parts": [[2021]] },
      DOI: "10.1234/test",
      ...overrides,
    },
  };
}

function openAlexWork(overrides: any = {}) {
  return {
    title: "A Real Paper (OpenAlex rendering)",
    abstract_inverted_index: { OpenAlex: [0], abstract: [1] },
    authorships: [{ author: { display_name: "Grace Hopper" } }],
    primary_location: { source: { display_name: "OpenAlex Venue", host_organization_name: "OA Publisher", issn: ["3333-3333"] } },
    publication_year: 2022,
    doi: "https://doi.org/10.1234/test",
    id: "https://openalex.org/W123",
    open_access: { is_oa: true },
    ...overrides,
  };
}

describe("citationEnrichmentService — lookupCitation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("looks up by DOI against both Crossref and OpenAlex and returns both matches", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org/works/")) return jsonResponse(crossrefWork());
      if (url.includes("api.openalex.org/works/doi:")) return jsonResponse(openAlexWork());
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { matches, sourceErrors } = await lookupCitation({ doi: "10.1234/test" });

    expect(sourceErrors).toEqual([]);
    expect(matches).toHaveLength(2);
    const crossref = matches.find((m) => m.source === "Crossref")!;
    expect(crossref.title).toBe("A Real Paper");
    expect(crossref.abstract).toBe("Crossref abstract text.");
    expect(crossref.authors).toEqual([{ firstName: "Ada", lastName: "Lovelace" }]);

    const openAlex = matches.find((m) => m.source === "OpenAlex")!;
    expect(openAlex.abstract).toBe("OpenAlex abstract");
    expect(openAlex.isOpenAccess).toBe(true);
    expect(openAlex.openAlexId).toBe("https://openalex.org/W123");
  });

  it("returns a 404 DOI lookup as no match, not an error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 404));
    vi.stubGlobal("fetch", fetchMock);

    const { matches, sourceErrors } = await lookupCitation({ doi: "10.9999/does-not-exist" });

    expect(matches).toEqual([]);
    expect(sourceErrors).toEqual([]);
  });

  it("falls back to a title search when no DOI is given, preferring Crossref and never merging both", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org/works?query.title=")) return jsonResponse({ message: { items: [crossrefWork().message] } });
      if (url.includes("api.openalex.org/works?search=")) return jsonResponse({ results: [openAlexWork()] });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { matches } = await lookupCitation({ title: "A Real Paper" });

    // Only Crossref's result is returned, even though OpenAlex would also have
    // matched — merging fields from two independent by-title top hits risks
    // combining data from two different papers.
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("Crossref");
  });

  it("falls back to OpenAlex by title when Crossref finds nothing", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org/works?query.title=")) return jsonResponse({ message: { items: [] } });
      if (url.includes("api.openalex.org/works?search=")) return jsonResponse({ results: [openAlexWork()] });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { matches } = await lookupCitation({ title: "A Real Paper" });

    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("OpenAlex");
  });

  it("rejects a Crossref title-search hit that doesn't actually resemble the query, instead of trusting it", async () => {
    // Regression test for a real finding (2026-07-22): Crossref's /works?query.title=
    // never returns zero results for rows=1 — for a nonsense query it returned one of
    // its own internal deleted-DOI tombstone records as "best available." Both
    // sources are mocked to return an unrelated title here to confirm the guard
    // rejects both, rather than trusting whichever responds.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org/works?query.title=")) {
        return jsonResponse({ message: { items: [crossrefWork({ title: ["Totally different Title"] }).message] } });
      }
      if (url.includes("api.openalex.org/works?search=")) {
        return jsonResponse({ results: [openAlexWork({ title: "Totally different Title" })] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { matches } = await lookupCitation({ title: "Zzzqqxx Totally Fabricated Nonexistent Paper Title 12345" });

    expect(matches).toEqual([]);
  });

  it("accepts a title-search hit whose title closely matches the query", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org/works?query.title=")) {
        return jsonResponse({ message: { items: [crossrefWork({ title: ["A Real Paper About Testing"] }).message] } });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { matches } = await lookupCitation({ title: "A Real Paper About Testing" });

    expect(matches).toHaveLength(1);
  });

  it("tolerates one source failing during a DOI lookup and still returns the other", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org/works/")) throw new Error("network error");
      if (url.includes("api.openalex.org/works/doi:")) return jsonResponse(openAlexWork());
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { matches, sourceErrors } = await lookupCitation({ doi: "10.1234/test" });

    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("OpenAlex");
    expect(sourceErrors).toEqual(["Crossref: network error"]);
  });

  it("throws when neither a DOI nor a title is given", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupCitation({})).rejects.toThrow(/Cannot enrich a citation/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("citationEnrichmentService — lookupByIdentifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("looks up a PMID directly against PubMed's esummary endpoint", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("esummary.fcgi") && url.includes("id=30049270")) {
        return jsonResponse({
          result: {
            "30049270": {
              title: "A Real PubMed Paper",
              authors: [{ name: "Alan Turing" }],
              pubdate: "2018 Aug",
              fulljournalname: "PubMed Journal",
              articleids: [{ idtype: "doi", value: "10.5555/pubmed-test" }],
            },
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { matches, supported } = await lookupByIdentifier("30049270", "PMID");

    expect(supported).toBe(true);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ title: "A Real PubMed Paper", journalName: "PubMed Journal", year: "2018", doi: "10.5555/pubmed-test", source: "PubMed" });
  });

  it("returns no match for a PMID PubMed doesn't recognize, rather than an error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { uids: ["99999999"] } }));
    vi.stubGlobal("fetch", fetchMock);

    const { matches, sourceErrors } = await lookupByIdentifier("99999999", "PMID");

    expect(matches).toEqual([]);
    expect(sourceErrors).toEqual([]);
  });

  it("looks up an OpenAlex ID directly, normalizing a pasted full URL", async () => {
    let capturedUrl = "";
    const fetchMock = vi.fn(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ title: "A Real OpenAlex Work", id: "https://openalex.org/W999", authorships: [], type: "journal" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { matches } = await lookupByIdentifier("https://openalex.org/W999", "OpenAlex");

    expect(capturedUrl).toBe("https://api.openalex.org/works/W999");
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("OpenAlex");
  });

  it("looks up an ISBN against Open Library", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("openlibrary.org/api/books") && url.includes("ISBN:9780262033848")) {
        return jsonResponse({
          "ISBN:9780262033848": {
            title: "Introduction to Algorithms",
            authors: [{ name: "Thomas Cormen" }],
            publishers: [{ name: "The MIT Press" }],
            publish_date: "2009",
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { matches } = await lookupByIdentifier("978-0-262-03384-8", "ISBN");

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ title: "Introduction to Algorithms", publisher: "The MIT Press", year: "2009", source: "Open Library" });
  });

  it("marks unsupported identifier types (e.g. YouTube, ResearchGate, arXiv) as not supported, without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const type of ["YouTube", "ResearchGate", "SSRN", "Zenodo", "Google Books", "Podcast", "URL Import", "arXiv"]) {
      const result = await lookupByIdentifier("some-identifier", type);
      expect(result).toEqual({ matches: [], sourceErrors: [], supported: false });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks an empty identifier as not supported without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupByIdentifier("   ", "DOI");

    expect(result).toEqual({ matches: [], sourceErrors: [], supported: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
