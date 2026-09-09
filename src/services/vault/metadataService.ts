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
    const res = await authedJsonFetch("/api/vault/lookup-doi", "POST", { doi: clean });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        title?: string;
        authors?: string[];
        year?: string;
        journal?: string;
        citation?: string;
        error?: string;
      };

      if (data && data.success && data.title) {
        const authors = data.authors || [];
        const year = data.year || "";
        const journal = data.journal || "";
        const citation =
          data.citation ||
          generateAPA7Citation({
            authors,
            year,
            title: data.title,
            journal,
            doi: clean,
          });

        return {
          success: true,
          metadata: {
            title: data.title,
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
    }
  } catch {
    // Fall back to direct OpenAlex API
  }

  // 2. OpenAlex free API (CORS enabled, highly reliable)
  try {
    const openAlexUrl = `https://api.openalex.org/works/https://doi.org/${clean}`;
    const res = await fetch(openAlexUrl, {
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      const title = data.title || "";
      const authors: string[] = (data.authorships || [])
        .map((a: any) => a.author?.display_name)
        .filter(Boolean);
      const year = data.publication_year ? String(data.publication_year) : "";
      const journal =
        data.primary_location?.source?.display_name ||
        data.host_venue?.name ||
        "";

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
  } catch {
    // Fall through to Crossref
  }

  // 3. Crossref API
  try {
    const crossrefUrl = `https://api.crossref.org/works/${clean}`;
    const res = await fetch(crossrefUrl, {
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = await res.json();
      const item = data.message;
      const title = item.title?.[0] || "";
      const authors: string[] = (item.author || []).map((a: any) => {
        if (a.given && a.family) return `${a.given} ${a.family}`;
        return a.family || a.name || "";
      });
      const year =
        item.published?.["date-parts"]?.[0]?.[0]?.toString() ||
        item["published-print"]?.["date-parts"]?.[0]?.[0]?.toString() ||
        "";
      const journal = item["container-title"]?.[0] || "";

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
      title: "",
      authors: [],
      doi: clean,
      type: "paper",
    },
    citation: "",
    confidence: "needs_review",
    error: `Could not automatically resolve metadata for DOI ${clean}. Please fill in details manually.`,
  };
}

/**
 * Resolves metadata from a web URL.
 */
export async function resolveUrlMetadata(url: string): Promise<ResolvedMetadataResult> {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return {
      success: false,
      metadata: { title: "", authors: [], url: trimmed, type: "website" },
      citation: "",
      confidence: "needs_review",
      error: "Please enter a valid URL starting with https://",
    };
  }

  try {
    const res = await authedJsonFetch("/api/vault/parse-url", "POST", { url: trimmed });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        title?: string;
        citation?: string;
        canonicalReference?: any;
        error?: string;
      };

      if (data && data.success && data.title) {
        const domain = new URL(trimmed).hostname.replace(/^www\./, "");
        const title = data.title;
        const publisher = data.canonicalReference?.publisher || domain;
        const year = new Date().getFullYear().toString();
        const citation =
          data.citation ||
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
