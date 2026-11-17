/**
 * Recent papers and journals on a topic, from OpenAlex (with OPENALEX_API_KEY
 * when set) and Crossref as the fallback. Both are free public indexes; no AI
 * and no cost. Only what the index returns is passed on.
 */
import type { RawSourceInput } from "../../../src/citation_compliance/cslEngine.ts";
import { fetchOpenAlexSourceDetails, searchCrossref, searchOpenAlex, type ProviderOptions } from "../../../src/shared/retrieval/providers.ts";
import {
  rankVenues,
  type ScoutPaper,
  type VenueMatch,
  type VenueWork,
} from "../../../src/domain/journal/blueprintFunnel.ts";

type Fetch = typeof fetch;

export const RECENT_YEARS = 5;
export const fromYear = (now = new Date()) => now.getUTCFullYear() - RECENT_YEARS;



function toScoutPaper(r: RawSourceInput, i: number, source: ScoutPaper["source"]): ScoutPaper {
  return {
    key: `p${i + 1}`,
    title: r.title || "Untitled",
    year: typeof r.year === "number" ? r.year : Number(r.year) || undefined,
    venue: r.venue,
    doi: r.doi,
    url: r.url,
    authors: Array.isArray(r.authors) ? (r.authors as unknown[]).filter((a): a is string => typeof a === "string") : [],
    abstract: r.snippet || "",
    source,
  };
}

function scoutOptions(f: Fetch, extraParams: Record<string, string>): ProviderOptions {
  return {
    fetchImpl: f as typeof fetch,
    extraParams,
    mailto: process.env.OPENALEX_MAILTO,
    openAlexApiKey: process.env.OPENALEX_API_KEY,
    timeoutMs: 15_000,
  };
}

async function openAlexPapers(f: Fetch, interest: string, n: number, since: number): Promise<ScoutPaper[]> {
  const res = await searchOpenAlex(interest, n, 1, scoutOptions(f, { filter: `from_publication_date:${since}-01-01,has_abstract:true,type:article` }));
  if (res.error && res.items.length === 0) throw new Error(res.error);
  return res.items.map((r, i) => toScoutPaper(r, i, "openalex"));
}

async function crossrefPapers(f: Fetch, interest: string, n: number, since: number): Promise<ScoutPaper[]> {
  const res = await searchCrossref(interest, n, 1, scoutOptions(f, { filter: `from-pub-date:${since}-01-01,type:journal-article,has-abstract:true` }));
  if (res.error && res.items.length === 0) throw new Error(res.error);
  return res.items.map((r, i) => toScoutPaper(r, i, "crossref"));
}

/** Up to n recent papers with abstracts on the interest; OpenAlex first, then Crossref. */
export async function scoutPapers(interest: string, n = 15, f: Fetch = fetch): Promise<{ papers: ScoutPaper[]; since: number }> {
  const since = fromYear();
  try {
    const papers = await openAlexPapers(f, interest, n, since);
    if (papers.length) return { papers, since };
  } catch {
    // fall through to Crossref
  }
  return { papers: await crossrefPapers(f, interest, n, since), since };
}

/** Journals ranked by how many of the topic's most relevant recent articles they published. */
export async function scoutJournals(query: string, f: Fetch = fetch): Promise<{ journals: VenueMatch[]; since: number }> {
  const since = fromYear();
  try {
    const res = await searchOpenAlex(query, 100, 1, scoutOptions(f, { filter: `from_publication_date:${since}-01-01,type:article,primary_location.source.type:journal`, select: "title,primary_location" }));
    if (res.error && res.items.length === 0) throw new Error(res.error);
    const works: VenueWork[] = res.items.map((r) => ({
      title: r.title ?? "",
      venue: r.venue,
      venueId: r.venueId,
      issn: r.issn,
      publisher: r.publisher,
    }));
    const journals = rankVenues(works, "openalex");
    if (journals.length) {
      // Homepage and open-access status, from the index's record of each journal.
      try {
        const details = await fetchOpenAlexSourceDetails(journals.map((j) => j.id), scoutOptions(f, {}));
        for (const d of details) {
          const j = journals.find((x) => x.id === d.id);
          if (!j) continue;
          if (d.homepage) j.homepage = d.homepage;
          if (typeof d.isOpenAccess === "boolean") j.isOpenAccess = d.isOpenAccess;
          if (!j.publisher && d.publisher) j.publisher = d.publisher;
        }
      } catch {
        // the ranking stands without the extra details
      }
      return { journals, since };
    }
  } catch {
    // fall through to Crossref
  }
  const cr = await searchCrossref(query, 100, 1, scoutOptions(f, { filter: `from-pub-date:${since}-01-01,type:journal-article` }));
  if (cr.error && cr.items.length === 0) throw new Error(cr.error);
  const works: VenueWork[] = cr.items.map((r) => ({ title: r.title ?? "", venue: r.venue, issn: r.issn, publisher: r.publisher }));
  return { journals: rankVenues(works, "crossref"), since };
}
