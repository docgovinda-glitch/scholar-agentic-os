/**
 * Client for the stateless IMF DataMapper indicator search proxy
 * (supabase/functions/imf-proxy) — the same accepted architectural
 * exception as searchProxyService.ts/arxivProxyService.ts, documented in
 * .claude/HANDOVER.md's Standing Boundary Rule.
 *
 * Same calling pattern as every other Edge Function caller in this codebase:
 * invoke, check the transport-level error, return a typed result — never
 * throws.
 */

import { getSupabaseClient } from "./supabaseClient";

export interface ImfResult {
  id: string;
  title: string;
  url: string;
  description: string;
}

export interface ImfProxyResponse {
  results: ImfResult[];
  error?: string;
}

export async function imfProxy(query: string): Promise<ImfProxyResponse> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("imf-proxy", {
    body: { query },
  });

  if (error) {
    return { results: [], error: error.message };
  }

  return { results: data?.results ?? [], error: data?.error };
}
