/**
 * Client for the stateless WHO GHO indicator search proxy
 * (supabase/functions/who-proxy) — the same accepted architectural
 * exception as searchProxyService.ts/arxivProxyService.ts, documented in
 * .claude/HANDOVER.md's Standing Boundary Rule.
 *
 * Same calling pattern as every other Edge Function caller in this codebase:
 * invoke, check the transport-level error, return a typed result — never
 * throws.
 */

import { getSupabaseClient } from "./supabaseClient";

export interface WhoResult {
  id: string;
  title: string;
  url: string;
  description: string;
}

export interface WhoProxyResponse {
  results: WhoResult[];
  error?: string;
}

export async function whoProxy(query: string, maxResults?: number): Promise<WhoProxyResponse> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("who-proxy", {
    body: { query, maxResults },
  });

  if (error) {
    return { results: [], error: error.message };
  }

  return { results: data?.results ?? [], error: data?.error };
}
