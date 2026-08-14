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
