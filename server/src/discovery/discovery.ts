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
import { searchOpenAlex, type ProviderResult } from "../../../src/shared/retrieval/providers";
import { retrieveSources } from "../retrieval/retrievalService";

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

const VIA: Partial<Record<string, DiscoveredSource["discoveredVia"]>> = {
  openalex: "openalex",
  crossref: "crossref",
  semantic_scholar: "semantic_scholar",
  europe_pmc: "europepmc",
  doaj: "doaj",
  datacite: "datacite",
  arxiv: "arxiv",
};

/**
 * Scholarly sources for a question, through the shared retrieval pipeline
 * (`retrieveSources`: the shared providers, relevance gate, one record per
 * work). Authority "A" only for what an index reports as peer reviewed;
 * records without a title are dropped, never named "Untitled".
 */
export async function discoverScholarlySources(query: string, maxResults = 50): Promise<DiscoveredSourceDraft[]> {
  const { results } = await retrieveSources({ query, mode: "scholarly", limit: Math.max(1, Math.min(120, maxResults)) });
  return results
    .filter((r) => r.title)
    .map((r) => {
      const authors = Array.isArray(r.authors) ? (r.authors as unknown[]).filter((a): a is string => typeof a === "string") : [];
      const year = typeof r.year === "number" ? r.year : Number(r.year) || undefined;
      const peer = r.sourceType === "peer-reviewed article" || r.sourceType === "conference paper";
      return {
        title: r.title as string,
        authors,
        url: r.url || (r.doi ? `https://doi.org/${r.doi}` : undefined),
        ...(r.doi ? { doi: r.doi } : {}),
        ...(r.venue ? { venue: r.venue } : {}),
        ...(year ? { year } : {}),
        discoveredVia: VIA[r.provider] ?? "multi_portal",
        sourceType: "scholarly" as const,
        authorityTier: peer ? ("A" as const) : ("B" as const),
      };
    });
}
