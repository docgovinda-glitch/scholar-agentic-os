/**
 * RetrievalService: the single live-search and academic-retrieval entry point
 * for AskScholar and every workspace (`/api/search/live`, deep research, the
 * canonical-source pipeline).
 *
 * - Scholarly records come from the shared provider adapters
 *   (`src/shared/retrieval/providers.ts`), the only code that calls
 *   OpenAlex / Crossref / Semantic Scholar / Europe PMC / ERIC.
 * - Web, news and official-site records come from `executeWebSearch`
 *   (authority-tiered, dated, SSRF-guarded page fetch).
 * - Budget, discipline and query variations come from `askScholarConfig`.
 * Nothing here invents a record: a provider that fails reports its error and
 * contributes zero results.
 */

import {
  classifyResearchPrompt,
  generateQueryVariations,
  resolveSourceBudget,
  type AcademicDiscipline,
  type AskScholarDisciplineId,
  type AskScholarRequestType,
} from "../../../src/config/askScholarConfig.ts";
import type { RawSourceInput } from "../../../src/citation_compliance/cslEngine.ts";
import {
  scoreRelevance,
  searchCrossref,
  searchEric,
  searchEuropePmc,
  searchOpenAlex,
  searchSemanticScholar,
  searchWorkingPapers,
  type ProviderId,
  type ProviderOptions,
  type ProviderResult,
} from "../../../src/shared/retrieval/providers.ts";
import { executeWebSearch, type SearchResultItem } from "../research/webSearchEngine.ts";

export type RetrievalMode = "all" | "scholarly" | "web" | "deep_research";

export interface RetrievalRequest {
  query: string;
  mode?: RetrievalMode;
  limit?: number;
  candidateBudget?: number;
  discipline?: AcademicDiscipline | string;
  signal?: AbortSignal;
}

export type RetrievedSource = RawSourceInput & {
  provider: ProviderId | "web";
  kind: "scholarly" | "web";
  /** Web records only: authority tier from the source's own domain. */
  authorityTier?: SearchResultItem["authorityTier"];
  authorityBadge?: string;
  domain?: string;
  relevance: number;
};

export interface ProviderReport {
  provider: ProviderId | "web";
  count: number;
  error?: string;
}

export interface RetrievalResponse {
  results: RetrievedSource[];
  /** Candidates retrieved before dedupe, relevance gating and the final cut. */
  searchedCount: number;
  queriesExecuted: string[];
  providers: ProviderReport[];
  complexity: AskScholarRequestType;
  discipline: AskScholarDisciplineId;
  retrievedAt: string;
}

const DISCIPLINES: ReadonlySet<string> = new Set([
  "stem", "management_business", "social_sciences", "humanities", "health", "law", "education", "general", "auto",
]);

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\W_]+/g, " ").trim();
}

function providerOptions(signal?: AbortSignal): ProviderOptions {
  return {
    signal,
    mailto: process.env.OPENALEX_MAILTO,
    openAlexApiKey: process.env.OPENALEX_API_KEY,
  };
}

function toWebSource(item: SearchResultItem, relevance: number): RetrievedSource {
  const authors = item.authors && item.authors.length > 0 ? item.authors : item.author ? [item.author] : [];
  return {
    title: item.title,
    url: item.url,
    doi: item.doi,
    snippet: item.snippet,
    year: item.year,
    publicationDate: item.publishedDate,
    authors: authors.length > 0 ? authors : item.publisher ? [item.publisher] : [],
    venue: item.venue,
    publisher: item.publisher,
    sourceType: item.sourceType === "official" ? "institutional report" : "web page",
    domain: item.domain,
    provider: "web",
    kind: "web",
    authorityTier: item.authorityTier,
    authorityBadge: item.authorityBadge,
    relevance,
  };
}

/** A scholarly record must overlap the question's own keywords, not just match a provider's fuzzy search. */
function passesRelevanceGate(rel: ReturnType<typeof scoreRelevance>): boolean {
  if (rel.keywordCount <= 1) return rel.ratio > 0;
  return rel.titleMatches >= 1 && rel.ratio >= 0.4;
}

export async function retrieveSources(request: RetrievalRequest): Promise<RetrievalResponse> {
  const query = request.query.trim();
  const mode: RetrievalMode = request.mode ?? "all";
  const preferred =
    typeof request.discipline === "string" && DISCIPLINES.has(request.discipline)
      ? (request.discipline as AcademicDiscipline)
      : undefined;
  const classification = classifyResearchPrompt(query, {
    isDeepResearch: mode === "deep_research",
    preferredDiscipline: preferred,
  });
  const budget = resolveSourceBudget(classification.requestType);
  const limit = Math.max(1, Math.min(request.limit ?? budget.maxCited, 120));
  const candidateTarget = Math.max(request.candidateBudget ?? 0, budget.minCandidates, limit * 2);
  const variations = generateQueryVariations(query, classification);
  const retrievedAt = new Date().toISOString();

  const empty: RetrievalResponse = {
    results: [],
    searchedCount: 0,
    queriesExecuted: variations,
    providers: [],
    complexity: classification.requestType,
    discipline: classification.discipline,
    retrievedAt,
  };
  if (!query) return empty;

  const opts = providerOptions(request.signal);
  const wantScholarly = mode !== "web";
  const wantWeb = mode !== "scholarly";
  const deep = mode === "deep_research";

  const scholarlyJobs: Array<Promise<ProviderResult>> = [];
  if (wantScholarly) {
    const perProvider = Math.max(10, Math.ceil(candidateTarget / (Math.max(1, Math.min(variations.length, 2)) * 3)));
    const pages = candidateTarget > 50 ? 2 : 1;
    const variationLimit = deep ? 4 : 2;
    for (const q of variations.slice(0, variationLimit)) {
      for (let page = 1; page <= pages; page++) {
        scholarlyJobs.push(searchOpenAlex(q, perProvider, page, opts));
        scholarlyJobs.push(searchCrossref(q, perProvider, page, opts));
      }
      scholarlyJobs.push(searchSemanticScholar(q, perProvider, opts));
    }
    const d = classification.discipline;
    if (d === "health" || d === "general" || d === "stem") scholarlyJobs.push(searchEuropePmc(variations[0] ?? query, perProvider, opts));
    if (d === "education") scholarlyJobs.push(searchEric(variations[0] ?? query, perProvider, opts));
    if (d === "management_business" || d === "social_sciences" || d === "law") {
      scholarlyJobs.push(searchWorkingPapers(variations[0] ?? query, perProvider, opts));
    }
  }

  const webJob: Promise<SearchResultItem[]> = wantWeb
    ? executeWebSearch(query, {
        maxResults: Math.min(15, Math.max(6, limit)),
        mode: deep ? "deep-research" : "search",
        includeScholarly: false,
      })
        .then((r) => r.results)
        .catch(() => [])
    : Promise.resolve([]);

  const [scholarlySettled, webItems] = await Promise.all([Promise.all(scholarlyJobs), webJob]);

  const reports = new Map<ProviderId | "web", ProviderReport>();
  const note = (provider: ProviderId | "web", count: number, error?: string) => {
    const prev = reports.get(provider);
    reports.set(provider, { provider, count: (prev?.count ?? 0) + count, error: prev?.error ?? error });
  };

  const scholarly: RetrievedSource[] = [];
  let candidates = 0;
  for (const result of scholarlySettled) {
    note(result.provider, result.items.length, result.error);
    candidates += result.items.length;
    for (const item of result.items) {
      if (!item.title) continue;
      const rel = scoreRelevance(query, item.title, item.snippet ?? "", {
        citedByCount: item.citedByCount,
        year: typeof item.year === "number" ? item.year : Number(item.year) || undefined,
      });
      if (!passesRelevanceGate(rel)) continue;
      scholarly.push({ ...item, provider: result.provider, kind: "scholarly", relevance: rel.score });
    }
  }

  candidates += webItems.length;
  note("web", webItems.length);
  const web = webItems.map((w) => toWebSource(w, w.score));

  const seenDoi = new Set<string>();
  const seenTitle = new Set<string>();
  const seenUrl = new Set<string>();
  const dedupe = (list: RetrievedSource[]): RetrievedSource[] =>
    list.filter((item) => {
      const doi = item.doi?.toLowerCase().trim();
      const title = normalizeTitle(item.title ?? "");
      const url = (item.url ?? "").toLowerCase().replace(/\/+$/, "");
      if ((doi && seenDoi.has(doi)) || (title && seenTitle.has(title)) || (url && seenUrl.has(url))) return false;
      if (doi) seenDoi.add(doi);
      if (title) seenTitle.add(title);
      if (url) seenUrl.add(url);
      return true;
    });

  const rankedScholarly = dedupe([...scholarly].sort((a, b) => b.relevance - a.relevance));
  const rankedWeb = dedupe([...web].sort((a, b) => b.relevance - a.relevance));

  // Scholarly-first, but web/news/official sources always get a share when requested,
  // so a current-events question is never answered from papers alone.
  const webShare = mode === "all" ? Math.min(rankedWeb.length, Math.max(3, Math.floor(limit * 0.35))) : rankedWeb.length;
  const scholarlyShare = mode === "web" ? 0 : limit - (mode === "scholarly" ? 0 : webShare);
  const results = [...rankedScholarly.slice(0, Math.max(0, scholarlyShare)), ...rankedWeb.slice(0, webShare)].slice(0, limit);

  return {
    results,
    searchedCount: candidates,
    queriesExecuted: variations,
    providers: [...reports.values()],
    complexity: classification.requestType,
    discipline: classification.discipline,
    retrievedAt,
  };
}

/** Adapts a retrieved record to the web-search item shape the research and answer pipelines cite from. */
export function retrievedToSearchItem(r: RetrievedSource): SearchResultItem {
  const authors = Array.isArray(r.authors) ? (r.authors as unknown[]).filter((a): a is string => typeof a === "string") : [];
  const scholarly = r.kind === "scholarly";
  const peerReviewed = r.sourceType === "peer-reviewed article" || r.sourceType === "conference paper";
  const url = r.url || (r.doi ? `https://doi.org/${r.doi}` : "");
  let domain = "";
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    domain = "";
  }
  return {
    title: r.title ?? "",
    url,
    snippet: r.snippet ?? "",
    domain,
    publisher: r.publisher || r.venue,
    sourceType: scholarly ? "scholarly" : r.authorityTier === "A" ? "official" : "web",
    authorityTier: scholarly ? (peerReviewed ? "A" : "B") : r.authorityTier ?? "C",
    authorityBadge: scholarly ? `Scholarly index (${r.provider})` : r.authorityBadge ?? "Web source",
    score: r.relevance,
    publishedDate: r.publicationDate || (r.year ? String(r.year) : undefined),
    year: r.year,
    authors,
    author: authors[0],
    doi: r.doi,
    venue: r.venue,
    isPrimary: scholarly,
  };
}
