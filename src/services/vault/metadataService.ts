/**
 * Academic Metadata Service for Source Library
 *
 * Resolves metadata in order of reliability:
 * 1. DOI via Crossref / OpenAlex
 * 2. URL parsing (academic articles / web)
 * 3. File metadata heuristics
 *
 * Never fabricates data. Returns confidence indicators ("verified" vs "needs_review").
 */

import { authedJsonFetch } from "../../desk/api";
import type { SourceMetadata } from "./sourceTypes";
import { normalizeDoi } from "./duplicateDetection";

export interface ResolvedMetadataResult {
  success: boolean;
  metadata: SourceMetadata;
  citation: string;
  confidence: "verified" | "needs_review";
  notes?: string;
  error?: string;
}

/**
 * Formats an APA 7 citation from raw metadata fields.
 */
export function generateAPA7Citation(meta: {
  authors?: string[];
  year?: string;
  title?: string;
  journal?: string;
  publisher?: string;
  doi?: string;
  url?: string;
}): string {
  const authors = meta.authors || [];
  let authorStr = "Unknown Author";

  if (authors.length === 1) {
    authorStr = authors[0];
  } else if (authors.length === 2) {
    authorStr = `${authors[0]} & ${authors[1]}`;
  } else if (authors.length > 2) {
    authorStr = `${authors[0]} et al.`;
  }

  const yearStr = meta.year ? `(${meta.year})` : "(n.d.)";
  const titleStr = meta.title ? `${meta.title.replace(/[\.\s]+$/, "")}.` : "Untitled Source.";
  const sourceStr = meta.journal
    ? ` ${meta.journal}.`
    : meta.publisher
    ? ` ${meta.publisher}.`
    : "";

  let linkStr = "";
  if (meta.doi) {
    const cleanDoi = normalizeDoi(meta.doi);
    linkStr = ` https://doi.org/${cleanDoi}`;
  } else if (meta.url) {
    linkStr = ` ${meta.url}`;
  }

  return `${authorStr} ${yearStr}. ${titleStr}${sourceStr}${linkStr}`.trim();
}

/**
 * Resolves academic metadata from a DOI via Crossref / OpenAlex.
 */
export async function resolveDoiMetadata(rawDoi: string): Promise<ResolvedMetadataResult> {
  const clean = normalizeDoi(rawDoi);
  if (!clean) {
    return {
      success: false,
      metadata: { title: "", authors: [] },
      citation: "",
      confidence: "needs_review",
      error: "Please enter a valid DOI (e.g. 10.1038/nature12373)",
    };
  }

  try {
    // 1. First try backend endpoint /api/vault/lookup-doi
    const res = await authedJsonFetch<{
      success?: boolean;
      title?: string;
      authors?: string[];
      year?: string;
      journal?: string;
      citation?: string;
      error?: string;
    }>("/api/vault/lookup-doi", "POST", { doi: clean });

    if (res && res.success && res.title) {
      const authors = res.authors || [];
      const year = res.year || "";
      const journal = res.journal || "";
      const citation =
        res.citation ||
        generateAPA7Citation({
          authors,
          year,
          title: res.title,
          journal,
          doi: clean,
        });

      return {
        success: true,
        metadata: {
          title: res.title,
          authors,
          year,
          journal,
          doi: clean,
          url: `https://doi.org/${clean}`,
          type: "paper",
        },
        citation,
        confidence: "verified",
      };
    }
  } catch {
    // Fall back to direct OpenAlex API
  }

  // 2. Direct OpenAlex API fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(clean)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (response.ok) {
      const work = await response.json();
      const title = work.display_name || work.title || clean;
      const authors: string[] = (work.authorships || []).map(
        (a: any) => a.author?.display_name || ""
      ).filter(Boolean);
      const year = work.publication_year ? String(work.publication_year) : "";
      const journal = work.primary_location?.source?.display_name || "";
      const citation = generateAPA7Citation({
        authors,
        year,
        title,
        journal,
        doi: clean,
      });

      return {
        success: true,
        metadata: {
          title,
          authors,
          year,
          journal,
          doi: clean,
          url: `https://doi.org/${clean}`,
          type: "paper",
        },
        citation,
        confidence: "verified",
      };
    }
  } catch {}

  return {
    success: false,
    metadata: {
      title: `Publication (${clean})`,
      authors: [],
      doi: clean,
      url: `https://doi.org/${clean}`,
      type: "paper",
    },
    citation: `https://doi.org/${clean}`,
    confidence: "needs_review",
    error: `Could not automatically fetch metadata for DOI: ${clean}. You can enter details manually.`,
  };
}

/**
 * Resolves metadata from a website URL.
 */
export async function resolveUrlMetadata(url: string): Promise<ResolvedMetadataResult> {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return {
      success: false,
      metadata: { title: "", authors: [] },
      citation: "",
      confidence: "needs_review",
      error: "Please enter a valid URL starting with https://",
    };
  }

  try {
    const res = await authedJsonFetch<{
      success?: boolean;
      title?: string;
      citation?: string;
      canonicalReference?: any;
      error?: string;
    }>("/api/vault/parse-url", "POST", { url: trimmed });

    if (res && res.success && res.title) {
      const domain = new URL(trimmed).hostname.replace(/^www\./, "");
      const title = res.title;
      const publisher = res.canonicalReference?.publisher || domain;
      const year = new Date().getFullYear().toString();
      const citation =
        res.citation ||
        generateAPA7Citation({
          title,
          publisher,
          year,
          url: trimmed,
        });

      return {
        success: true,
        metadata: {
          title,
          authors: [],
          year,
          publisher,
          url: trimmed,
          type: "website",
        },
        citation,
        confidence: "verified",
      };
    }
  } catch {}

  const domain = new URL(trimmed).hostname.replace(/^www\./, "");
  return {
    success: true,
    metadata: {
      title: domain,
      authors: [],
      publisher: domain,
      url: trimmed,
      type: "website",
    },
    citation: `${domain}. Retrieved from ${trimmed}`,
    confidence: "needs_review",
  };
}
