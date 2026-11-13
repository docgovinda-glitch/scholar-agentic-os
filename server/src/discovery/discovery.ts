/**
 * Literature discovery — calls the already-deployed, already-cost-controlled
 * arxiv-proxy and search-proxy Supabase Edge Functions (same call pattern as
 * server/src/aiEngine/opportunityAgent.ts's searchWeb) to find candidate
 * sources for a research question.
 *
 * Returns plain discovery results only — never a DiscoveredSource (that
 * requires an id and a discoveredAt the caller assigns, same "route stamps
 * server-owned fields" convention journal-requirements uses for
 * capturedAt/capturedBy). Nothing here extracts a quote, verifies it, or
 * proposes/approves anything — see src/domain/evidence/stateMachine.ts for
 * what happens after a source is discovered. Authority tiers are assigned
 * only from what the proxy actually returned (a domain suffix, a preprint
 * host) — never guessed for anything discovery can't observe.
 */

import { getSupabaseRestConfig } from "../supabaseRest";
import type { AuthorityTier, DiscoveredSource, SourceType } from "../../../src/domain/evidence/types";
import type { RawSourceInput } from "../../../src/citation_compliance/cslEngine";
import {
  searchCrossref,
  searchOpenAlex,
  searchSemanticScholar,
  type ProviderResult,
} from "../../../src/shared/retrieval/providers";

interface ArxivResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  url: string;
}

interface WebResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export type DiscoveredSourceDraft = Omit<DiscoveredSource, "id" | "discoveredAt">;

async function callProxy<T>(fn: "arxiv-proxy" | "search-proxy", body: unknown): Promise<T[]> {
  const config = getSupabaseRestConfig();
  if (!config) {
    throw new Error("Supabase is not configured — literature discovery needs its Edge Functions, which run on Supabase.");
  }
  const res = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/${fn}`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${fn} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const parsed = (await res.json()) as { results?: T[]; error?: string };
  if (parsed.error) throw new Error(`${fn}: ${parsed.error}`);
  return parsed.results ?? [];
}

/** Best-effort authority classification from a URL's own domain — never a guess about the content itself, only what the domain suffix actually is. */
function webDomainAuthority(url: string): { sourceType: SourceType; authorityTier: AuthorityTier } {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith(".gov") || host.endsWith(".int")) return { sourceType: "official", authorityTier: "A" };
    if (host.endsWith(".edu")) return { sourceType: "official", authorityTier: "A" };
    if (host.endsWith(".org")) return { sourceType: "official", authorityTier: "B" };
    return { sourceType: "web", authorityTier: "C" };
  } catch {
    return { sourceType: "web", authorityTier: "D" };
  }
}

export async function discoverArxivSources(query: string, maxResults = 10): Promise<DiscoveredSourceDraft[]> {
  const results = await callProxy<ArxivResult>("arxiv-proxy", { query, maxResults });
  return results.map((r) => ({
    title: r.title,
    authors: r.authors,
    url: r.url,
    year: r.published ? new Date(r.published).getFullYear() || undefined : undefined,
    sourceType: "scholarly" as const,
    // A preprint, not peer-reviewed — real scholarly content, but a
    // journal's own peer-reviewed articles still outrank it. Never raised
    // to A just because arXiv is a scholarly venue.
    authorityTier: "B" as const,
    discoveredVia: "arxiv" as const,
  }));
}

export async function discoverWebSources(query: string, domains?: string[]): Promise<DiscoveredSourceDraft[]> {
  const results = await callProxy<WebResult>("search-proxy", { query, domains });
  return results.map((r) => ({
    title: r.title || r.url,
    authors: [],
    url: r.url,
    discoveredVia: "web_search" as const,
    ...webDomainAuthority(r.url),
  }));
}

/** A provider failure is an error (not "no results"): callers decide whether to swallow it. */
function unwrapProvider(result: ProviderResult): RawSourceInput[] {
  if (result.error && result.items.length === 0) throw new Error(`${result.error}`);
  return result.items;
}

function rawToDraft(
  r: RawSourceInput,
  via: DiscoveredSource["discoveredVia"],
  tier: AuthorityTier
): DiscoveredSourceDraft {
  const authors = Array.isArray(r.authors) ? (r.authors as unknown[]).filter((a): a is string => typeof a === "string") : [];
  const year = typeof r.year === "number" ? r.year : Number(r.year) || undefined;
  return {
    title: r.title || "Untitled",
    authors,
    url: r.url || (r.doi ? `https://doi.org/${r.doi}` : undefined),
    ...(r.doi ? { doi: r.doi } : {}),
    ...(r.venue ? { venue: r.venue } : {}),
    ...(year ? { year } : {}),
    discoveredVia: via,
    sourceType: "scholarly" as const,
    authorityTier: tier,
  };
}

function polite() {
  return { mailto: process.env.OPENALEX_MAILTO, openAlexApiKey: process.env.OPENALEX_API_KEY };
}

/**
 * OpenAlex, via the shared provider adapter. "A" is only ever assigned when OpenAlex itself
 * reports a peer-reviewed journal article, never guessed from the query or title.
 */
export async function discoverOpenAlexSources(query: string, maxResults = 10): Promise<DiscoveredSourceDraft[]> {
  const items = unwrapProvider(await searchOpenAlex(query, maxResults, 1, polite()));
  return items.map((r) => rawToDraft(r, "openalex", r.sourceType === "peer-reviewed article" ? "A" : "B"));
}

export async function discoverCrossrefSources(query: string, maxResults = 25): Promise<DiscoveredSourceDraft[]> {
  const items = unwrapProvider(await searchCrossref(query, maxResults, 1, polite()));
  return items.map((r) => rawToDraft(r, "crossref", "A"));
}

export async function discoverSemanticScholarSources(query: string, maxResults = 20): Promise<DiscoveredSourceDraft[]> {
  const items = unwrapProvider(await searchSemanticScholar(query, Math.min(maxResults, 50), polite()));
  return items.map((r) => rawToDraft(r, "semantic_scholar", "A"));
}

export async function discoverDoajSources(query: string, maxResults = 25): Promise<DiscoveredSourceDraft[]> {
  let res: Response;
  try {
    res = await fetch(`https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${maxResults}`, {
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(`DOAJ request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new Error(`DOAJ ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const parsed = (await res.json()) as { results?: any[] };
  return (parsed.results ?? []).map((item) => {
    const bib = item.bibjson || {};
    const doiObj = Array.isArray(bib.identifier) ? bib.identifier.find((i: any) => i.type === "doi") : undefined;
    const doi = doiObj?.id ? doiObj.id.replace(/^https?:\/\/doi\.org\//, "") : undefined;
    const authors = Array.isArray(bib.author) ? bib.author.map((a: any) => a.name).filter(Boolean) : [];
    const venue = bib.journal?.title;
    const link = Array.isArray(bib.link) ? bib.link.find((l: any) => l.type === "fulltext")?.url : undefined;

    return {
      title: bib.title || "Untitled Open Access Work",
      authors,
      url: link || (doi ? `https://doi.org/${doi}` : undefined),
      ...(doi ? { doi } : {}),
      ...(venue ? { venue } : {}),
      ...(bib.year ? { year: Number(bib.year) } : {}),
      discoveredVia: "doaj" as const,
      sourceType: "scholarly" as const,
      authorityTier: "A" as const,
    };
  });
}

export async function discoverDataCiteSources(query: string, maxResults = 25): Promise<DiscoveredSourceDraft[]> {
  let res: Response;
  try {
    res = await fetch(`https://api.datacite.org/dois?query=${encodeURIComponent(query)}&page[size]=${maxResults}`, {
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(`DataCite request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new Error(`DataCite ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const parsed = (await res.json()) as { data?: any[] };
  return (parsed.data ?? []).map((item) => {
    const attrs = item.attributes || {};
    const doi = attrs.doi ? attrs.doi.replace(/^https?:\/\/doi\.org\//, "") : undefined;
    const title = Array.isArray(attrs.titles) ? attrs.titles[0]?.title : "DataCite Resource";
    const authors = Array.isArray(attrs.creators) ? attrs.creators.map((c: any) => c.name).filter(Boolean) : [];
    const venue = attrs.publisher;

    return {
      title,
      authors,
      url: doi ? `https://doi.org/${doi}` : undefined,
      ...(doi ? { doi } : {}),
      ...(venue ? { venue } : {}),
      ...(attrs.publicationYear ? { year: Number(attrs.publicationYear) } : {}),
      discoveredVia: "datacite" as const,
      sourceType: "scholarly" as const,
      authorityTier: "B" as const,
    };
  });
}

export async function discoverMultiPortalSources(query: string, maxResults = 50): Promise<DiscoveredSourceDraft[]> {
  const perPortalLimit = Math.max(15, Math.ceil(maxResults / 3));

  const portalPromises = [
    discoverOpenAlexSources(query, perPortalLimit).catch(() => [] as DiscoveredSourceDraft[]),
    discoverCrossrefSources(query, perPortalLimit).catch(() => [] as DiscoveredSourceDraft[]),
    discoverDoajSources(query, Math.min(20, perPortalLimit)).catch(() => [] as DiscoveredSourceDraft[]),
    discoverDataCiteSources(query, Math.min(20, perPortalLimit)).catch(() => [] as DiscoveredSourceDraft[]),
    discoverArxivSources(query, Math.min(20, perPortalLimit)).catch(() => [] as DiscoveredSourceDraft[]),
    discoverSemanticScholarSources(query, Math.min(20, perPortalLimit)).catch(() => [] as DiscoveredSourceDraft[]),
  ];

  const results = await Promise.allSettled(portalPromises);
  const candidates: DiscoveredSourceDraft[] = [];

  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      candidates.push(...r.value);
    }
  }

  // Deduplicate by DOI and normalized title
  const seenDois = new Set<string>();
  const seenTitles = new Set<string>();
  const deduplicated: DiscoveredSourceDraft[] = [];

  for (const item of candidates) {
    const cleanDoi = item.doi ? item.doi.toLowerCase().trim() : null;
    const normTitle = (item.title || "").toLowerCase().replace(/[\W_]+/g, " ").trim();

    if (cleanDoi && seenDois.has(cleanDoi)) continue;
    if (normTitle && seenTitles.has(normTitle)) continue;

    if (cleanDoi) seenDois.add(cleanDoi);
    if (normTitle) seenTitles.add(normTitle);

    deduplicated.push(item);
  }

  return deduplicated.slice(0, maxResults);
}
