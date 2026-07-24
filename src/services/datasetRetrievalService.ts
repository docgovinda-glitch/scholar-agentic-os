/**
 * Real dataset discovery — fabrication-audit fix (target-workflow.md §10,
 * the 7th and final instance) for ResearchQuestionSkill's
 * `recommendedDatasets: ["dataset-1"]` hardcoded stub.
 *
 * DataCite's public DOI-search API (api.datacite.org) is directly
 * browser-callable — no proxy needed, confirmed via a live fetch before
 * writing this, same verification standard as literatureRetrievalService.ts
 * and journalRetrievalService.ts. `resource-type-id=dataset` scopes results
 * to real, registered research datasets (not papers/software), each with a
 * real DOI, title, publisher, and description — never invented.
 *
 * Single-source deliberately (DataCite alone, not also Zenodo/re3data) —
 * this task was scoped narrowly ("don't over-build"), and DataCite's
 * dataset-type filter and metadata richness already cover what
 * recommendedDatasets needs. A future task can add more sources the same
 * way literatureRetrievalService.ts accumulated its four.
 */

const REQUEST_TIMEOUT_MS = 10000;
const PER_SOURCE_LIMIT = 5;

export interface DatasetResult {
  name: string;
  url: string;
  description: string;
  doi: string | null;
  source: "DataCite";
}

export interface DatasetDiscoveryResult {
  results: DatasetResult[];
  sourceErrors: string[];
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function searchDataCite(query: string): Promise<DatasetResult[]> {
  const params = new URLSearchParams({
    query,
    "resource-type-id": "dataset",
    "page[size]": String(PER_SOURCE_LIMIT),
  });
  const res = await fetch(`https://api.datacite.org/dois?${params.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DataCite returned HTTP ${res.status}`);
  const data = await res.json();
  const items: any[] = data?.data || [];

  return items.map((item): DatasetResult => {
    const attrs = item.attributes || {};
    const title: string = attrs.titles?.[0]?.title || "Untitled Dataset";
    const rawDescription: string = attrs.descriptions?.[0]?.description || "";
    const description = rawDescription
      ? `${stripHtml(rawDescription).slice(0, 300)}${rawDescription.length > 300 ? "…" : ""}`
      : "No description provided by DataCite.";
    const doi: string | null = attrs.doi || null;

    return {
      name: title,
      url: attrs.url || (doi ? `https://doi.org/${doi}` : ""),
      description,
      doi,
      source: "DataCite",
    };
  });
}

/** Discovers real, registered research datasets matching a query. Never throws — returns an honest empty array with sourceErrors on failure. */
export async function discoverDatasets(query: string): Promise<DatasetDiscoveryResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], sourceErrors: [] };
  }

  try {
    const results = await searchDataCite(trimmed);
    return { results, sourceErrors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { results: [], sourceErrors: [`DataCite: ${message}`] };
  }
}
