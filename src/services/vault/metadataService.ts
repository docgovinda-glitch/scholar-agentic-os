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
      const dateParts =
        item["published-print"]?.["date-parts"]?.[0] ||
        item["published-online"]?.["date-parts"]?.[0] ||
        item.published?.["date-parts"]?.[0] ||
        item.issued?.["date-parts"]?.[0] ||
        item.created?.["date-parts"]?.[0] ||
        item["journal-issue"]?.published?.["date-parts"]?.[0] ||
        item["journal-issue"]?.["published-print"]?.["date-parts"]?.[0] ||
        item["journal-issue"]?.["published-online"]?.["date-parts"]?.[0];

      const year = dateParts?.[0] ? String(dateParts[0]) : "";
      const journal = Array.isArray(item["container-title"])
        ? item["container-title"][0]
        : item["container-title"] || "";

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

  // 4. DataCite API (CORS enabled, covers arXiv, Zenodo, Figshare, institutional repos)
  try {
    const dataCiteUrl = `https://api.datacite.org/dois/${clean}`;
    const res = await fetch(dataCiteUrl, {
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const dcData = await res.json();
      const attr = dcData.data?.attributes;
      if (attr) {
        const title = attr.titles?.[0]?.title || "";
        const authors: string[] = (attr.creators || [])
          .map((c: any) => c.name || `${c.givenName || ""} ${c.familyName || ""}`.trim())
          .filter(Boolean);
        const year = String(
          attr.publicationYear ||
            attr.dates?.find(
              (d: any) => d.dateType === "Issued" || d.dateType === "Created" || d.dateType === "Submitted"
            )?.date?.slice(0, 4) ||
            ""
        );
        const journal = attr.container?.title || attr.publisher || "";

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

  // 1. If URL directly contains a DOI, delegate to high-fidelity DOI resolver
  const directDoiMatch = trimmed.match(/(?:doi\.org\/|doi:)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (directDoiMatch?.[1]) {
    const doiResult = await resolveDoiMetadata(directDoiMatch[1]);
    if (doiResult.success && doiResult.metadata.title) {
      return doiResult;
    }
  }

  try {
    const res = await authedJsonFetch("/api/vault/parse-url", "POST", { url: trimmed });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        title?: string;
        authors?: string[];
        year?: string;
        publisher?: string;
        journal?: string;
        doi?: string;
        sourceType?: string;
        citation?: string;
        canonicalReference?: any;
        description?: string;
        error?: string;
      };

      if (data && data.success && data.title) {
        // If DOI was discovered in page metadata, attempt to enrich with CrossRef/OpenAlex
        if (data.doi) {
          try {
            const enriched = await resolveDoiMetadata(data.doi);
            if (enriched.success && enriched.metadata.title) {
              return {
                ...enriched,
                metadata: {
                  ...enriched.metadata,
                  url: trimmed, // retain user-entered web URL
                  publisher: enriched.metadata.publisher || data.publisher,
                },
              };
            }
          } catch {}
        }

        const domain = new URL(trimmed).hostname.replace(/^www\./, "");
        const title = data.title;
        const authors = Array.isArray(data.authors) ? data.authors : [];
        const year = data.year || "";
        const journal = data.journal || "";
        const publisher = data.publisher || data.canonicalReference?.publisher || domain;
        const doi = data.doi || "";
        const isPaper = data.sourceType === "paper" || Boolean(doi || journal);

        const citation =
          generateAPA7Citation({
            title,
            authors,
            publisher,
            journal,
            year: year || undefined,
            doi: doi || undefined,
            url: trimmed,
          });

        const confidence: "verified" | "needs_review" =
          authors.length > 0 && Boolean(year) ? "verified" : "needs_review";

        return {
          success: true,
          metadata: {
            title,
            authors,
            year,
            journal,
            publisher,
            doi,
            url: trimmed,
            type: isPaper ? "paper" : "website",
          },
          citation,
          confidence,
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
      year: "",
      publisher: domain,
      url: trimmed,
      type: "website",
    },
    citation: `${domain}. Retrieved from ${trimmed}`,
    confidence: "needs_review",
  };
}
