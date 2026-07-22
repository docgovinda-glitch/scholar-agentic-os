/**
 * Real client-side literature retrieval against Crossref, OpenAlex, PubMed, and
 * Semantic Scholar — all four confirmed directly browser-callable (CORS-permissive)
 * via empirical testing, see docs/planning/target-workflow.md §5. Replaces the prior
 * LLM-naming behavior in aiService.ts's discoverDataSources, which asked a model to
 * *name* sources from memory instead of retrieving any (recorded as a defect —
 * target-workflow.md §0/§2).
 *
 * arXiv is deliberately excluded here: it's confirmed CORS-blocked and needs the
 * accepted fetch/search proxy (HANDOVER.md's Standing Boundary Rule), which is out
 * of scope for this pass.
 */

const PER_SOURCE_LIMIT = 5;
const FINAL_RESULT_CAP = 12;
const REQUEST_TIMEOUT_MS = 10000;

export interface LiteratureResult {
  title: string;
  url: string;
  authors: string;
  year: string;
  venue: string;
  abstract: string;
  citationCount: number | null;
  source: "Crossref" | "OpenAlex" | "PubMed" | "Semantic Scholar";
}

export interface LiteratureDiscoveryResult {
  results: LiteratureResult[];
  sourceErrors: string[];
}

async function searchCrossref(query: string): Promise<LiteratureResult[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${PER_SOURCE_LIMIT}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Crossref returned HTTP ${res.status}`);
  const data = await res.json();
  const items: any[] = data?.message?.items || [];

  return items.map((item): LiteratureResult => ({
    title: Array.isArray(item.title) ? item.title[0] || "Untitled" : item.title || "Untitled",
    url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ""),
    authors: Array.isArray(item.author)
      ? item.author.map((a: any) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean).join(", ")
      : "",
    year: String(
      item.published?.["date-parts"]?.[0]?.[0]
        ?? item["published-print"]?.["date-parts"]?.[0]?.[0]
        ?? item.issued?.["date-parts"]?.[0]?.[0]
        ?? ""
    ),
    venue: Array.isArray(item["container-title"]) ? item["container-title"][0] || "" : "",
    abstract: typeof item.abstract === "string" ? item.abstract.replace(/<[^>]+>/g, "").trim() : "",
    citationCount: typeof item["is-referenced-by-count"] === "number" ? item["is-referenced-by-count"] : null,
    source: "Crossref",
  }));
}

function reconstructOpenAlexAbstract(invertedIndex: Record<string, number[]> | undefined): string {
  if (!invertedIndex) return "";
  const positions: string[] = [];
  for (const [word, indices] of Object.entries(invertedIndex)) {
    for (const idx of indices) positions[idx] = word;
  }
  return positions.filter(Boolean).join(" ");
}

async function searchOpenAlex(query: string): Promise<LiteratureResult[]> {
  // Free API key: OpenAlex's current documented policy requires one (even though
  // unkeyed calls were observed to still succeed as of 2026-07-22 — build against
  // the documented requirement, not the unenforced behavior; see target-workflow.md §5.
  const apiKey = import.meta.env.VITE_OPENALEX_API_KEY as string | undefined;
  const params = new URLSearchParams({ search: query, per_page: String(PER_SOURCE_LIMIT) });
  if (apiKey) params.set("api_key", apiKey);

  const res = await fetch(`https://api.openalex.org/works?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenAlex returned HTTP ${res.status}`);
  const data = await res.json();
  const items: any[] = data?.results || [];

  return items.map((item): LiteratureResult => ({
    title: item.title || item.display_name || "Untitled",
    url: item.doi || item.id || "",
    authors: Array.isArray(item.authorships)
      ? item.authorships.map((a: any) => a.author?.display_name).filter(Boolean).join(", ")
      : "",
    year: item.publication_year ? String(item.publication_year) : "",
    venue: item.primary_location?.source?.display_name || item.host_venue?.display_name || "",
    abstract: reconstructOpenAlexAbstract(item.abstract_inverted_index),
    citationCount: typeof item.cited_by_count === "number" ? item.cited_by_count : null,
    source: "OpenAlex",
  }));
}

async function searchPubMed(query: string): Promise<LiteratureResult[]> {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=${PER_SOURCE_LIMIT}`;
  const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!searchRes.ok) throw new Error(`PubMed search returned HTTP ${searchRes.status}`);
  const searchData = await searchRes.json();
  const ids: string[] = searchData?.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
  const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!summaryRes.ok) throw new Error(`PubMed summary returned HTTP ${summaryRes.status}`);
  const summaryData = await summaryRes.json();
  const resultMap = summaryData?.result || {};

  return ids
    .filter((id) => resultMap[id])
    .map((id): LiteratureResult => {
      const item = resultMap[id];
      return {
        title: item.title || "Untitled",
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        authors: Array.isArray(item.authors)
          ? item.authors.map((a: any) => a.name).filter(Boolean).join(", ")
          : "",
        year: (item.pubdate || "").match(/\d{4}/)?.[0] || "",
        venue: item.fulljournalname || item.source || "",
        abstract: "",
        citationCount: null,
        source: "PubMed",
      };
    });
}

async function searchSemanticScholar(query: string): Promise<LiteratureResult[]> {
  const fields = "title,url,year,authors,abstract,venue,citationCount";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${PER_SOURCE_LIMIT}&fields=${fields}`;
  // Note: this endpoint's shared anonymous pool is separately rate-limited
  // (confirmed 2026-07-22) independent of its confirmed CORS support — a 429 here
  // surfaces as a thrown error (caught by the orchestrator below), not a crash.
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Semantic Scholar returned HTTP ${res.status}`);
  const data = await res.json();
  const items: any[] = data?.data || [];

  return items.map((item): LiteratureResult => ({
    title: item.title || "Untitled",
    url: item.url || "",
    authors: Array.isArray(item.authors)
      ? item.authors.map((a: any) => a.name).filter(Boolean).join(", ")
      : "",
    year: item.year ? String(item.year) : "",
    venue: item.venue || "",
    abstract: item.abstract || "",
    citationCount: typeof item.citationCount === "number" ? item.citationCount : null,
    source: "Semantic Scholar",
  }));
}

function normalizeTitleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Queries all four sources in parallel, tolerating individual failures (a network
 * error, CORS gap, or rate limit on one source shouldn't block the others), then
 * merges results via round-robin interleaving (a fair mix across sources) and dedupes
 * by normalized title before capping the total returned.
 */
export async function discoverLiterature(query: string): Promise<LiteratureDiscoveryResult> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error("Cannot discover literature without a title, keywords, or field to search for.");
  }

  const searches: Array<{ source: LiteratureResult["source"]; run: () => Promise<LiteratureResult[]> }> = [
    { source: "Crossref", run: () => searchCrossref(trimmedQuery) },
    { source: "OpenAlex", run: () => searchOpenAlex(trimmedQuery) },
    { source: "PubMed", run: () => searchPubMed(trimmedQuery) },
    { source: "Semantic Scholar", run: () => searchSemanticScholar(trimmedQuery) },
  ];

  const settled = await Promise.allSettled(searches.map((s) => s.run()));

  const perSourceResults: LiteratureResult[][] = [];
  const sourceErrors: string[] = [];

  settled.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      perSourceResults.push(outcome.value);
    } else {
      perSourceResults.push([]);
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      sourceErrors.push(`${searches[i].source}: ${reason}`);
    }
  });

  const merged: LiteratureResult[] = [];
  const maxLen = Math.max(0, ...perSourceResults.map((r) => r.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of perSourceResults) {
      if (list[i]) merged.push(list[i]);
    }
  }

  const seen = new Set<string>();
  const deduped: LiteratureResult[] = [];
  for (const item of merged) {
    const key = normalizeTitleKey(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  if (deduped.length === 0 && sourceErrors.length === searches.length) {
    throw new Error(`All literature sources failed: ${sourceErrors.join("; ")}`);
  }

  return { results: deduped.slice(0, FINAL_RESULT_CAP), sourceErrors };
}
