/**
 * Real author-guidelines discovery for extractRequirements (aiService.ts) —
 * fabrication-audit fix (target-workflow.md §10, HANDOVER.md). Previously,
 * when no guidelinesText was supplied, the prompt fell back to "generate
 * standard guidelines for a premier peer-reviewed journal in this field" —
 * inventing a specific named journal's actual submission rules from memory.
 *
 * No per-journal guidelines API exists (confirmed — this isn't a missed
 * lookup, structured author-guidelines data just isn't published as an API
 * by any registry), so this reuses two already-real, already-verified
 * pieces of infrastructure instead of adding anything new:
 * - OpenAlex Sources API's real `homepage_url` field (verified live before
 *   writing this — e.g. "Nature" resolves to https://www.nature.com/nature/)
 *   to find the journal's own domain, when it can be found.
 * - The existing Tavily search-proxy (searchProxyService.ts, the accepted
 *   Standing Boundary Rule exception), scoped to that domain when known,
 *   searching for the journal's real "instructions for authors" page.
 *
 * If nothing real is found, the caller (extractRequirements) throws an
 * honest error rather than fabricating — this module never returns
 * placeholder or invented content.
 */

import { searchProxy } from "./searchProxyService";

const OPENALEX_TIMEOUT_MS = 10000;

export interface AuthorGuidelinesResult {
  /** Real page-content snippet from the discovered source, or "" if nothing real was found. */
  text: string;
  /** The real URL the text came from, or null if nothing was found. */
  sourceUrl: string | null;
}

/** Looks up a journal's real homepage domain via OpenAlex Sources API — returns null if not found, never invented. */
async function findJournalHomepageDomain(journalName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.openalex.org/sources?search=${encodeURIComponent(journalName)}&filter=type:journal&per_page=1`,
      { signal: AbortSignal.timeout(OPENALEX_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const homepage: string | undefined = data?.results?.[0]?.homepage_url;
    if (!homepage) return null;
    return new URL(homepage).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Attempts to find the journal's real "instructions for authors" page.
 * Restricts the search to the journal's own homepage domain when OpenAlex
 * resolves one (real, verifiable), otherwise searches unrestricted by
 * journal name. Returns an honest empty result if nothing real is found —
 * never fabricates placeholder guidelines.
 */
export async function discoverAuthorGuidelines(journalName: string): Promise<AuthorGuidelinesResult> {
  const domain = await findJournalHomepageDomain(journalName);
  const query = `${journalName} instructions for authors submission guidelines`;
  const { results } = await searchProxy(query, domain ? [domain] : undefined);

  if (results.length === 0) {
    return { text: "", sourceUrl: null };
  }

  const best = results[0];
  return { text: best.content, sourceUrl: best.url };
}
