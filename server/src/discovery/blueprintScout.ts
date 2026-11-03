/**
 * Recent papers and journals on a topic, from OpenAlex (with OPENALEX_API_KEY
 * when set) and Crossref as the fallback. Both are free public indexes; no AI
 * and no cost. Only what the index returns is passed on.
 */
import {
  abstractFromInvertedIndex,
  decodeEntities,
  rankVenues,
  stripJats,
  type ScoutPaper,
  type VenueMatch,
  type VenueWork,
} from "../../../src/domain/journal/blueprintFunnel.ts";

type Fetch = typeof fetch;
type Json = Record<string, unknown>;

const UA = "ScholarCore/2.0 (https://scholar.gkshah.com.np; mailto:support@scholar-core.org)";
export const RECENT_YEARS = 5;
export const fromYear = (now = new Date()) => now.getUTCFullYear() - RECENT_YEARS;

async function getJson(f: Fetch, url: string): Promise<Json> {
  const res = await f(url, { headers: { Accept: "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as Json;
}

function openAlexUrl(path: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  if (process.env.OPENALEX_API_KEY) q.set("api_key", process.env.OPENALEX_API_KEY);
  if (process.env.OPENALEX_MAILTO) q.set("mailto", process.env.OPENALEX_MAILTO);
  return `https://api.openalex.org/${path}?${q.toString()}`;
}

const cleanDoi = (d: unknown) => (typeof d === "string" && d ? d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") : undefined);
const firstString = (v: unknown) => {
  const s = Array.isArray(v) ? (typeof v[0] === "string" ? v[0] : undefined) : typeof v === "string" ? v : undefined;
  return s === undefined ? undefined : decodeEntities(s);
};
const crossrefYear = (item: Json) => {
  const parts = ((item.published ?? item["published-print"] ?? item["published-online"] ?? item.created) as { "date-parts"?: number[][] } | undefined)?.["date-parts"];
  return parts?.[0]?.[0];
};

async function openAlexPapers(f: Fetch, interest: string, n: number, since: number): Promise<ScoutPaper[]> {
  const data = await getJson(
    f,
    openAlexUrl("works", {
      search: interest,
      filter: `from_publication_date:${since}-01-01,has_abstract:true,type:article`,
      "per-page": String(n),
      select: "id,doi,title,publication_year,abstract_inverted_index,primary_location,authorships",
    })
  );
  return ((data.results as Json[]) ?? []).map((w, i) => ({
    key: `p${i + 1}`,
    title: String(w.title ?? "Untitled"),
    year: typeof w.publication_year === "number" ? w.publication_year : undefined,
    venue: ((w.primary_location as Json | null)?.source as Json | null)?.display_name as string | undefined,
    doi: cleanDoi(w.doi),
    url: typeof w.doi === "string" ? w.doi : (w.id as string | undefined),
    authors: ((w.authorships as Json[]) ?? []).map((a) => (a.author as Json | undefined)?.display_name).filter((x): x is string => typeof x === "string"),
    abstract: abstractFromInvertedIndex(w.abstract_inverted_index as Record<string, number[]> | null),
    source: "openalex" as const,
  }));
}

async function crossrefPapers(f: Fetch, interest: string, n: number, since: number): Promise<ScoutPaper[]> {
  const q = new URLSearchParams({
    query: interest,
    filter: `from-pub-date:${since}-01-01,type:journal-article,has-abstract:true`,
    rows: String(n),
    select: "DOI,title,abstract,container-title,published,published-print,published-online,created,author",
  });
  const data = await getJson(f, `https://api.crossref.org/works?${q.toString()}`);
  return (((data.message as Json)?.items as Json[]) ?? []).map((item, i) => {
    const doi = cleanDoi(item.DOI);
    return {
      key: `p${i + 1}`,
      title: firstString(item.title) ?? "Untitled",
      year: crossrefYear(item),
      venue: firstString(item["container-title"]),
      doi,
      url: doi ? `https://doi.org/${doi}` : undefined,
      authors: ((item.author as Json[]) ?? []).map((a) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
      abstract: stripJats(item.abstract as string | undefined),
      source: "crossref" as const,
    };
  });
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
    const data = await getJson(
      f,
      openAlexUrl("works", {
        search: query,
        filter: `from_publication_date:${since}-01-01,type:article,primary_location.source.type:journal`,
        "per-page": "100",
        select: "title,primary_location",
      })
    );
    const works: VenueWork[] = ((data.results as Json[]) ?? []).map((w) => {
      const src = ((w.primary_location as Json | null)?.source as Json | null) ?? {};
      return {
        title: String(w.title ?? ""),
        venue: src.display_name as string | undefined,
        venueId: typeof src.id === "string" ? src.id.replace("https://openalex.org/", "") : undefined,
        issn: src.issn_l as string | undefined,
        publisher: src.host_organization_name as string | undefined,
      };
    });
    const journals = rankVenues(works, "openalex");
    if (journals.length) {
      // Homepage and open-access status, from the index's record of each journal.
      try {
        const ids = journals.map((j) => j.id).join("|");
        const srcs = await getJson(f, openAlexUrl("sources", { filter: `openalex_id:${ids}`, select: "id,homepage_url,is_oa,host_organization_name,issn_l" }));
        for (const s of (srcs.results as Json[]) ?? []) {
          const j = journals.find((x) => x.id === String(s.id).replace("https://openalex.org/", ""));
          if (!j) continue;
          if (typeof s.homepage_url === "string") j.homepage = s.homepage_url;
          if (typeof s.is_oa === "boolean") j.isOpenAccess = s.is_oa;
          if (!j.publisher && typeof s.host_organization_name === "string") j.publisher = s.host_organization_name;
        }
      } catch {
        // the ranking stands without the extra details
      }
      return { journals, since };
    }
  } catch {
    // fall through to Crossref
  }
  const q = new URLSearchParams({
    query,
    filter: `from-pub-date:${since}-01-01,type:journal-article`,
    rows: "100",
    select: "title,container-title,ISSN,publisher",
  });
  const data = await getJson(f, `https://api.crossref.org/works?${q.toString()}`);
  const works: VenueWork[] = (((data.message as Json)?.items as Json[]) ?? []).map((item) => ({
    title: firstString(item.title) ?? "",
    venue: firstString(item["container-title"]),
    issn: firstString(item.ISSN),
    publisher: typeof item.publisher === "string" ? decodeEntities(item.publisher) : undefined,
  }));
  return { journals: rankVenues(works, "crossref"), since };
}
