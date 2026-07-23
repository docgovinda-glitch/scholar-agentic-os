// Stateless generic authoritative-web-search proxy — the one accepted
// architectural exception documented in .claude/HANDOVER.md's Standing
// Boundary Rule: fetches an outbound resource and returns the response,
// nothing else. No storage, no auth, no session state.
//
// Vendor decision + full reasoning: docs/planning/target-workflow.md §7.
// MANDATORY, same weight as the bright-line rules in the Standing Boundary
// Rule: this must only ever call Tavily's basic/advanced search endpoint —
// NEVER Tavily's separate Research endpoint, whose cost is open-ended
// (4-250 credits, depth-dependent) and would defeat the entire reason
// Tavily was chosen over Exa (predictable, 1-credit-per-basic-search billing).
//
// Deploy: supabase functions deploy search-proxy
// Requires project secret: TAVILY_API_KEY

import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_DOMAINS = [".gov", ".edu", ".org", ".int"];

interface SearchProxyRequestBody {
  query: string;
  domains?: string[];
}

interface SearchProxyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface SearchProxyResponseBody {
  results: SearchProxyResult[];
  error?: string;
}

function jsonResponse(body: SearchProxyResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  let body: SearchProxyRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ results: [], error: "Invalid request body" }, 400);
  }

  const query = body.query?.trim();
  if (!query) {
    return jsonResponse({ results: [], error: "Query is required" }, 400);
  }

  const apiKey = Deno.env.get("TAVILY_API_KEY");
  if (!apiKey) {
    // Graceful, not a 500 — matches every other Edge Function's
    // missing-secret handling (see _shared/resend.ts).
    return jsonResponse({ results: [], error: "Search proxy is not configured (TAVILY_API_KEY not set on this Supabase project)." });
  }

  const includeDomains = body.domains && body.domains.length > 0 ? body.domains : DEFAULT_DOMAINS;

  try {
    const tavilyRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      // search_depth is explicit, not left to Tavily's default, so a future
      // edit to this file can't silently drift onto a different endpoint —
      // "basic" (1 credit) is the only depth this proxy is allowed to use.
      body: JSON.stringify({
        query,
        search_depth: "basic",
        include_domains: includeDomains,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text().catch(() => "");
      return jsonResponse({ results: [], error: `Tavily returned HTTP ${tavilyRes.status}${errText ? `: ${errText}` : ""}` });
    }

    const data = await tavilyRes.json();
    const results: SearchProxyResult[] = (Array.isArray(data.results) ? data.results : []).map((r: any) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      score: typeof r.score === "number" ? r.score : 0,
    }));

    return jsonResponse({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ results: [], error: `Search proxy request failed: ${message}` });
  }
});
