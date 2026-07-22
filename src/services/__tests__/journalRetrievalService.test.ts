import { describe, it, expect, vi, afterEach } from "vitest";
import { discoverJournalCandidates } from "../journalRetrievalService";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function crossrefBody(titles: string[]) {
  return {
    message: {
      items: titles.map((title, i) => ({
        title,
        publisher: "Crossref Publisher",
        ISSN: [`000${i}-000${i}`],
        subjects: ["Testing"],
        counts: { "total-dois": 1000 + i },
      })),
    },
  };
}

function openAlexBody(names: string[]) {
  return {
    results: names.map((name, i) => ({
      display_name: name,
      host_organization_name: "OpenAlex Publisher",
      issn_l: `111${i}-111${i}`,
      is_oa: true,
      is_in_doaj: false,
      apc_usd: 1500 + i,
      works_count: 500 + i,
      cited_by_count: 2000 + i,
      topics: [{ display_name: "Testing Topic" }],
      type: "journal",
    })),
  };
}

function doajBody(titles: string[]) {
  return {
    results: titles.map((title, i) => ({
      bibjson: {
        title,
        publisher: { name: "DOAJ Publisher" },
        eissn: `222${i}-222${i}`,
        subject: [{ term: "Open Access Testing" }],
        apc: { has_apc: true, max: [{ price: 500 + i, currency: "USD" }] },
        publication_time_weeks: 6 + i,
        editorial: { review_process: ["Double blind"] },
        oa_start: 2018 + i,
      },
    })),
  };
}

describe("journalRetrievalService — per-source parsing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parses Crossref, OpenAlex, and DOAJ results into a merged, deduped list", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org")) return jsonResponse(crossrefBody(["Crossref Journal A"]));
      if (url.includes("api.openalex.org")) return jsonResponse(openAlexBody(["OpenAlex Journal B"]));
      if (url.includes("doaj.org")) return jsonResponse(doajBody(["DOAJ Journal C"]));
      throw new Error(`Unexpected URL in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results, sourceErrors } = await discoverJournalCandidates("test query");

    expect(sourceErrors).toEqual([]);
    expect(results).toHaveLength(3);

    const crossrefResult = results.find((r) => r.source === "Crossref")!;
    expect(crossrefResult.name).toBe("Crossref Journal A");
    expect(crossrefResult.scopeFit).toContain("Testing");
    expect(crossrefResult.feeStatus).toContain("Not available from Crossref");

    const openAlexResult = results.find((r) => r.source === "OpenAlex")!;
    expect(openAlexResult.feeStatus).toBe("$1500 USD APC (OpenAlex).");
    expect(openAlexResult.ranking).toContain("500 works");

    const doajResult = results.find((r) => r.source === "DOAJ")!;
    expect(doajResult.feeStatus).toBe("500 USD APC (DOAJ).");
    expect(doajResult.submissionOpenness).toContain("6 weeks");
    expect(doajResult.reviewContext).toContain("Double blind");
  });

  it("sends the OpenAlex API key and a type:journal filter", async () => {
    vi.stubEnv("VITE_OPENALEX_API_KEY", "test-key-123");
    let capturedUrl = "";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.openalex.org")) {
        capturedUrl = url;
        return jsonResponse(openAlexBody([]));
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    await discoverJournalCandidates("test query");

    expect(capturedUrl).toContain("api_key=test-key-123");
    expect(capturedUrl).toContain("filter=type%3Ajournal");
  });

  it("caps an overly long query to 3 tokens before searching (empirically required — see code comment)", async () => {
    let capturedQuery = "";
    const fetchMock = vi.fn(async (url: string) => {
      const decoded = decodeURIComponent(url);
      const match = decoded.match(/(?:query=|search=|journals\/)([^&]+)/);
      if (match) capturedQuery = match[1];
      return jsonResponse({ message: { items: [] }, results: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await discoverJournalCandidates("one two three four five");

    expect(capturedQuery).toBe("one two three");
  });

  it("dedupes results that share the same ISSN across sources", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org")) return jsonResponse(crossrefBody(["Shared Journal"]));
      if (url.includes("api.openalex.org")) {
        return jsonResponse({
          results: [
            {
              display_name: "Shared Journal (alt rendering)",
              issn_l: "0000-0000", // same normalized ISSN as Crossref's "0000-0000" above
              type: "journal",
            },
          ],
        });
      }
      if (url.includes("doaj.org")) return jsonResponse(doajBody([]));
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results } = await discoverJournalCandidates("test query");

    expect(results).toHaveLength(1);
    // Crossref runs first in the source order, so its version of the duplicate wins.
    expect(results[0].source).toBe("Crossref");
  });

  it("tolerates individual source failures and still returns the others", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org")) return jsonResponse(crossrefBody(["Surviving Journal"]));
      if (url.includes("api.openalex.org")) throw new Error("network error");
      if (url.includes("doaj.org")) return jsonResponse({}, false, 503);
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results, sourceErrors } = await discoverJournalCandidates("test query");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Surviving Journal");
    expect(sourceErrors.length).toBe(2);
    expect(sourceErrors.some((e) => e.startsWith("OpenAlex:"))).toBe(true);
    expect(sourceErrors.some((e) => e.startsWith("DOAJ:"))).toBe(true);
  });

  it("throws a combined error when every source fails", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverJournalCandidates("test query")).rejects.toThrow(/All journal sources failed/);
  });

  it("throws immediately without calling fetch when the query is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverJournalCandidates("   ")).rejects.toThrow(/Cannot search for journals/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
