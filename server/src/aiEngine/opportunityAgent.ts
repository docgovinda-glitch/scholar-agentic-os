/**
 * AI Opportunity Agent — Section 17. An admin-triggered research assistant,
 * not an autonomous background bot: every run is started by an admin action
 * (server/routes/admin.ts's /opportunities/research route) and every
 * finding lands with status='new', requiring an explicit admin review
 * (approve/reject/ignore, already implemented in admin.ts) before it means
 * anything. Nothing here ever creates an account, applies for a credit, or
 * takes any action against a provider — it only searches, reads, and
 * writes rows to ai_opportunities.
 *
 * Two existing, already-cost-controlled pieces are reused rather than
 * duplicated:
 *
 *  - Web search goes through supabase/functions/search-proxy, which
 *    supabase/functions/search-proxy/index.ts documents as a MANDATORY,
 *    bright-line-rule boundary: basic/advanced Tavily search ONLY, never
 *    Tavily's open-ended-cost Research endpoint. Calling Tavily directly
 *    from here instead would bypass that boundary — so this module never
 *    holds or sends a Tavily key itself.
 *  - Synthesis uses the same raw Gemini generateContent call
 *    server/routes/parse.ts already makes for OCR, against the existing
 *    GEMINI_API_KEY — no new provider credential.
 *
 * The synthesis prompt is deliberately restrictive about what counts as a
 * usable finding (Section 17's safety rule): official sources only, honest
 * "unclear" over a guessed "yes", and no invented numbers.
 */

import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";

interface RawOpportunity {
  providerName: string;
  opportunityName: string;
  officialUrl: string;
  valueEstimate?: string;
  eligibility?: string;
  geoRestrictions?: string;
  applicationRequired?: boolean;
  usageRestrictions?: string;
  creditsTransferable?: boolean;
  multiUserAllowed: "allowed" | "not_allowed" | "unclear";
  confidence: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  sourceNotes?: string;
}

interface OpportunityRow extends Record<string, unknown> {
  provider_name: string;
  opportunity_name: string;
  official_url: string;
  value_estimate: string | null;
  eligibility: string | null;
  geo_restrictions: string | null;
  application_required: boolean | null;
  usage_restrictions: string | null;
  credits_transferable: boolean | null;
  multi_user_allowed: string;
  confidence: string;
  risk: string;
  source_notes: string | null;
  status: "new";
}

async function searchWeb(query: string): Promise<Array<{ title: string; url: string; content: string }>> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const res = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/search-proxy`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`search-proxy ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const body = (await res.json()) as { results?: Array<{ title: string; url: string; content: string }>; error?: string };
  if (body.error) throw new Error(`search-proxy: ${body.error}`);
  return body.results ?? [];
}

const SYNTHESIS_PROMPT = `You are the Scholar AI Opportunity Agent — a compliance-conscious research
assistant, not a marketer. Your job is to identify LEGITIMATE, OFFICIAL ways
Scholar (a research-writing platform serving many users) could obtain AI API
capacity at low or no cost, from the search results provided below.

STRICT RULES:
- Only report opportunities backed by an OFFICIAL source (the provider's own
  site, developer program page, or documented terms). Never report a
  third-party blog's claim as if it were the provider's own offer.
- "multiUserAllowed" must be "allowed" only when the official terms clearly
  permit use behind a multi-user service. If the terms are silent, ambiguous,
  or restrict to personal/individual use, answer "unclear" or "not_allowed" —
  never guess "allowed" to make a finding look more useful than it is.
- Do not invent a dollar value, request limit, or expiration date. If the
  search results do not state one, omit that field rather than estimate.
- Confidence and risk must reflect the actual clarity of the source: a
  precise, current, official program page is "high confidence, low risk"; a
  vague or old mention is "low confidence" regardless of how promising it
  sounds.
- If nothing in the search results is a genuine, verifiable opportunity,
  return an empty array. An empty result is correct and expected more often
  than not — never fabricate an opportunity to have something to report.

Return ONLY a JSON array (no markdown fences, no commentary) matching this
shape:
[{
  "providerName": string,
  "opportunityName": string,
  "officialUrl": string,
  "valueEstimate": string | omit,
  "eligibility": string | omit,
  "geoRestrictions": string | omit,
  "applicationRequired": boolean | omit,
  "usageRestrictions": string | omit,
  "creditsTransferable": boolean | omit,
  "multiUserAllowed": "allowed" | "not_allowed" | "unclear",
  "confidence": "low" | "medium" | "high",
  "risk": "low" | "medium" | "high",
  "sourceNotes": string
}]

SEARCH RESULTS:
`;

async function synthesize(searchResults: Array<{ title: string; url: string; content: string }>): Promise<RawOpportunity[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server.");
  if (searchResults.length === 0) return [];

  const resultsText = searchResults.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 1500)}\n`).join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: SYNTHESIS_PROMPT + resultsText }] }] }),
  });

  if (!response.ok) throw new Error(`Gemini synthesis ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`);
  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

  // Strip markdown code fences if the model added them despite the prompt.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Runs one research pass for `query` and stores every finding as a new,
 * unreviewed ai_opportunities row. Returns the count stored so the calling
 * admin route can report it.
 */
export async function runOpportunityResearch(query: string): Promise<number> {
  const results = await searchWeb(query);
  const opportunities = await synthesize(results);
  if (opportunities.length === 0) return 0;

  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const table = new SupabaseTable<OpportunityRow>(config, "ai_opportunities");

  const rows: OpportunityRow[] = opportunities
    .filter((o) => o.providerName && o.opportunityName && o.officialUrl)
    .map((o) => ({
      provider_name: o.providerName,
      opportunity_name: o.opportunityName,
      official_url: o.officialUrl,
      value_estimate: o.valueEstimate ?? null,
      eligibility: o.eligibility ?? null,
      geo_restrictions: o.geoRestrictions ?? null,
      application_required: o.applicationRequired ?? null,
      usage_restrictions: o.usageRestrictions ?? null,
      credits_transferable: o.creditsTransferable ?? null,
      multi_user_allowed: o.multiUserAllowed,
      confidence: o.confidence,
      risk: o.risk,
      source_notes: o.sourceNotes ?? null,
      status: "new",
    }));

  if (rows.length > 0) await table.insert(rows);
  return rows.length;
}
