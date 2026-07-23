/**
 * Client for the stateless arXiv preprint search proxy
 * (supabase/functions/arxiv-proxy) — the same accepted architectural
 * exception as searchProxyService.ts, documented in
 * .claude/HANDOVER.md's Standing Boundary Rule.
 *
 * Same calling pattern as every other Edge Function caller in this codebase:
 * invoke, check the transport-level error, return a typed result — never
 * throws.
 */

import { getSupabaseClient } from "./supabaseClient";

export interface ArxivResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  url: string;
}

export interface ArxivProxyResponse {
  results: ArxivResult[];
  error?: string;
}

export async function arxivProxy(query: string, maxResults?: number): Promise<ArxivProxyResponse> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("arxiv-proxy", {
    body: { query, maxResults },
  });

  if (error) {
    return { results: [], error: error.message };
  }

  return { results: data?.results ?? [], error: data?.error };
}
