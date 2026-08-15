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

interface OpenAlexAuthorship {
  author?: { display_name?: string };
}

interface OpenAlexWork {
  id: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  type?: string;
  authorships?: OpenAlexAuthorship[];
  primary_location?: {
    landing_page_url?: string;
    source?: { display_name?: string; type?: string };
  };
}

export type DiscoveredSourceDraft = Omit<DiscoveredSource, "id" | "discoveredAt">;

async function callProxy<T>(fn: "arxiv-proxy" | "search-proxy", body: unknown): Promise<T[]> {
  const config = getSupabaseRestConfig();
  if (!config) {
    throw new Error("Supabase is not configured — literature discovery needs its Edge Functions, which run on Supabase.");
  }
  const res = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/${fn}`, {
    method: "POST",
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

/**
 * A peer-reviewed-journal article indexed by OpenAlex outranks a preprint or
 * repository entry the same way arXiv's own preprints are tiered B above —
 * "A" is only ever assigned when OpenAlex itself reports the work as a
 * journal article (`type: "article"` in a `primary_location.source.type:
 * "journal"`), never guessed from the query or title.
 */
function openAlexAuthority(work: OpenAlexWork): { sourceType: SourceType; authorityTier: AuthorityTier } {
  if (work.type === "article" && work.primary_location?.source?.type === "journal") {
    return { sourceType: "scholarly", authorityTier: "A" };
  }
  return { sourceType: "scholarly", authorityTier: "B" };
}

/**
 * OpenAlex (https://openalex.org) — a free, fully open scholarly index of
 * ~250M works across every discipline, not just arXiv's preprint corpus.
 * Unlike arxiv-proxy/search-proxy, no Supabase Edge Function or API key is
 * needed: OpenAlex's REST API is public. `OPENALEX_MAILTO`, if set, is sent
 * per OpenAlex's own etiquette guidance for faster, more reliable service
 * ("the polite pool") — never required.
 */
export async function discoverOpenAlexSources(query: string, maxResults = 10): Promise<DiscoveredSourceDraft[]> {
  const params = new URLSearchParams({ search: query, "per-page": String(maxResults) });
  const mailto = process.env.OPENALEX_MAILTO;
  if (mailto) params.set("mailto", mailto);

  let res: Response;
  try {
    res = await fetch(`https://api.openalex.org/works?${params.toString()}`);
  } catch (err) {
    throw new Error(`OpenAlex request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new Error(`OpenAlex ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const parsed = (await res.json()) as { results?: OpenAlexWork[] };
  return (parsed.results ?? []).map((w) => {
    const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : undefined;
    const venue = w.primary_location?.source?.display_name;
    return {
      title: w.title || w.display_name || "Untitled",
      authors: (w.authorships ?? []).map((a) => a.author?.display_name).filter((n): n is string => Boolean(n)),
      url: w.doi ?? w.primary_location?.landing_page_url ?? w.id,
      ...(doi ? { doi } : {}),
      ...(venue ? { venue } : {}),
      ...(w.publication_year ? { year: w.publication_year } : {}),
      discoveredVia: "openalex" as const,
      ...openAlexAuthority(w),
    };
  });
}
