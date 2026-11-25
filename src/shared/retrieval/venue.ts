/**
 * Names of the lookup services and import formats themselves. A record whose
 * "source" is one of these says where it was found, not where it was published,
 * so it is never shown or cited as the journal. arXiv is left out on purpose:
 * it is a real venue for a preprint.
 */
const RETRIEVAL_SERVICE_NAMES = new Set([
  "openalex",
  "crossref",
  "semantic scholar",
  "semantic_scholar",
  "semanticscholar",
  "europe pmc",
  "europe_pmc",
  "europepmc",
  "eric",
  "doaj",
  "datacite",
  "repository",
  "bibtex",
  "ris",
  "web",
  "tavily",
  "serper",
  "brave",
]);

export function isRetrievalServiceName(value: string | null | undefined): boolean {
  return !!value && RETRIEVAL_SERVICE_NAMES.has(value.trim().toLowerCase());
}

/** The first candidate that is a real venue name (not empty, not a lookup service's name). */
export function venueOrEmpty(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) if (c && c.trim() && !isRetrievalServiceName(c)) return c.trim();
  return "";
}
