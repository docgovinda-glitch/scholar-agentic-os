/**
 * Real client-side retrieval for discoverDataSources (aiService.ts) — scholarly
 * literature (Crossref, OpenAlex, PubMed, Semantic Scholar) and statistical/open
 * data (World Bank, OECD), all six confirmed directly browser-callable
 * (CORS-permissive) via empirical testing, see docs/planning/target-workflow.md
 * §5/§6. Replaces the prior LLM-naming behavior in discoverDataSources, which asked
 * a model to *name* sources from memory instead of retrieving any (recorded as a
 * defect — target-workflow.md §0/§2).
 *
 * arXiv, WHO GHO, and IMF DataMapper are deliberately excluded here: all three are
 * confirmed CORS-blocked and need the accepted fetch/search proxy (HANDOVER.md's
 * Standing Boundary Rule), which is out of scope for this pass.
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

/**
 * Statistical/open-data retrieval — World Bank Open Data API and OECD SDMX API,
 * both confirmed CORS-permissive (target-workflow.md §5/§6). Neither exposes a
 * server-side keyword-search parameter (confirmed against each API's own docs —
 * World Bank's Indicators API only supports lookup by known indicator code/topic/
 * source; OECD's SDMX API only supports lookup by known agency/dataflow/version).
 * Both DO expose a full catalog listing with real names and descriptions, so this
 * fetches that catalog once (module-level cache — ~15MB/~2.4s for World Bank's
 * ~29,500 indicators, ~5.8MB for OECD's ~1,540 dataflows, empirically measured
 * 2026-07-23) and scores it client-side by keyword overlap against the query. This
 * is real retrieval against a real, complete catalog, not an LLM guess — just via
 * client-side filtering instead of a server-side search param, because neither API
 * offers one.
 *
 * Deliberately more forgiving than discoverLiterature above: this is a supplementary
 * source for discoverDataSources (aiService.ts), not the primary one, so it never
 * throws — an empty query or a total failure of both sources just yields an empty
 * result, and discoverDataSources' literature results still return on their own.
 */

const STATISTICAL_PER_SOURCE_LIMIT = 5;
const STATISTICAL_RESULT_CAP = 6;
const CATALOG_FETCH_TIMEOUT_MS = REQUEST_TIMEOUT_MS * 3;

export interface StatisticalDataResult {
  name: string;
  url: string;
  description: string;
  source: "World Bank" | "OECD";
}

export interface StatisticalDataDiscoveryResult {
  results: StatisticalDataResult[];
  sourceErrors: string[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeQuery(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3)));
}

function scoreTextMatch(queryTokens: string[], text: string): number {
  const lower = text.toLowerCase();
  return queryTokens.reduce((score, token) => (lower.includes(token) ? score + 1 : score), 0);
}

function normalizeNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

interface WorldBankIndicator {
  id: string;
  name: string;
  sourceNote?: string;
}

let worldBankCatalogPromise: Promise<WorldBankIndicator[]> | null = null;

async function fetchWorldBankCatalog(): Promise<WorldBankIndicator[]> {
  const res = await fetch("https://api.worldbank.org/v2/indicator?format=json&per_page=30000", {
    signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`World Bank returned HTTP ${res.status}`);
  const data = await res.json();
  return (data?.[1] || []) as WorldBankIndicator[];
}

function getWorldBankCatalog(): Promise<WorldBankIndicator[]> {
  if (!worldBankCatalogPromise) {
    worldBankCatalogPromise = fetchWorldBankCatalog().catch((err) => {
      worldBankCatalogPromise = null;
      throw err;
    });
  }
  return worldBankCatalogPromise;
}

async function searchWorldBank(query: string, tokens: string[]): Promise<StatisticalDataResult[]> {
  const catalog = await getWorldBankCatalog();

  return catalog
    .map((ind) => ({ ind, score: scoreTextMatch(tokens, `${ind.name} ${ind.sourceNote || ""}`) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, STATISTICAL_PER_SOURCE_LIMIT)
    .map(({ ind }): StatisticalDataResult => ({
      name: ind.name,
      url: `https://data.worldbank.org/indicator/${ind.id}`,
      description: ind.sourceNote || "",
      source: "World Bank",
    }));
}

interface OecdDataflow {
  id: string;
  agencyID: string;
  version: string;
  name: string;
  description?: string;
}

let oecdCatalogPromise: Promise<OecdDataflow[]> | null = null;

async function fetchOecdCatalog(): Promise<OecdDataflow[]> {
  const res = await fetch("https://sdmx.oecd.org/public/rest/dataflow/all", {
    headers: { Accept: "application/vnd.sdmx.structure+json;version=1.0" },
    signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OECD returned HTTP ${res.status}`);
  const data = await res.json();
  const flows: OecdDataflow[] = data?.data?.dataflows || [];
  // The registry at this endpoint spans multiple agencies (Eurostat, IAEG-SDGs,
  // etc.), not just OECD's own — scope to genuinely OECD-produced dataflows only,
  // matching this source's actual identity ("OECD"), confirmed empirically 2026-07-23.
  return flows.filter((f) => (f.agencyID || "").startsWith("OECD"));
}

function getOecdCatalog(): Promise<OecdDataflow[]> {
  if (!oecdCatalogPromise) {
    oecdCatalogPromise = fetchOecdCatalog().catch((err) => {
      oecdCatalogPromise = null;
      throw err;
    });
  }
  return oecdCatalogPromise;
}

async function searchOecd(query: string, tokens: string[]): Promise<StatisticalDataResult[]> {
  const catalog = await getOecdCatalog();

  return catalog
    .map((flow) => ({ flow, score: scoreTextMatch(tokens, `${flow.name} ${stripHtml(flow.description || "")}`) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, STATISTICAL_PER_SOURCE_LIMIT)
    .map(({ flow }): StatisticalDataResult => ({
      name: flow.name,
      url: `https://sdmx.oecd.org/public/rest/dataflow/${flow.agencyID}/${flow.id}/${flow.version}`,
      description: stripHtml(flow.description || ""),
      source: "OECD",
    }));
}

export async function discoverStatisticalData(query: string): Promise<StatisticalDataDiscoveryResult> {
  const trimmedQuery = query.trim();
  const tokens = tokenizeQuery(trimmedQuery);
  if (tokens.length === 0) return { results: [], sourceErrors: [] };

  const searches: Array<{ source: StatisticalDataResult["source"]; run: () => Promise<StatisticalDataResult[]> }> = [
    { source: "World Bank", run: () => searchWorldBank(trimmedQuery, tokens) },
    { source: "OECD", run: () => searchOecd(trimmedQuery, tokens) },
  ];

  const settled = await Promise.allSettled(searches.map((s) => s.run()));

  const perSourceResults: StatisticalDataResult[][] = [];
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

  const merged: StatisticalDataResult[] = [];
  const maxLen = Math.max(0, ...perSourceResults.map((r) => r.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of perSourceResults) {
      if (list[i]) merged.push(list[i]);
    }
  }

  const seen = new Set<string>();
  const deduped: StatisticalDataResult[] = [];
  for (const item of merged) {
    const key = normalizeNameKey(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return { results: deduped.slice(0, STATISTICAL_RESULT_CAP), sourceErrors };
}

/** Test-only: clears the module-level catalog caches so each test starts fresh. */
export function __resetStatisticalDataCacheForTests(): void {
  worldBankCatalogPromise = null;
  oecdCatalogPromise = null;
}
