/**
 * Client for the stateless generic-authoritative-web-search proxy
 * (supabase/functions/search-proxy) — the one accepted architectural
 * exception documented in .claude/HANDOVER.md's Standing Boundary Rule.
 *
 * Kept separate from supabaseAuthService.ts deliberately: this isn't an
 * auth/user/admin concern, it's a search concern, and bundling it into the
 * auth service would just be grouping by "both call supabase.functions.invoke,"
 * not by what the code is actually about.
 *
 * Same calling pattern as every other Edge Function caller in this codebase
 * (see supabaseAuthService.ts's requestProfileUpdate): invoke, check the
 * transport-level error, return a typed result — never throws.
 */

import { getSupabaseClient } from "./supabaseClient";

export interface SearchProxyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface SearchProxyResponse {
  results: SearchProxyResult[];
  error?: string;
}

/**
 * Searches via the Tavily-backed proxy, restricted to `domains` (default:
 * [".gov", ".edu", ".org", ".int"] — set server-side in the Edge Function
 * itself, so passing nothing still gets the authoritative-sources default).
 */
export async function searchProxy(query: string, domains?: string[]): Promise<SearchProxyResponse> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("search-proxy", {
    body: { query, domains },
  });

  if (error) {
    return { results: [], error: error.message };
  }

  return { results: data?.results ?? [], error: data?.error };
}
