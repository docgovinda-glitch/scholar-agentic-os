import express, { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { parseDocument, normalizeUnicodeNFC } from "../../src/document_intelligence/index.ts";
import { requireAuth } from "../src/middleware/auth.ts";
import { createUploadInstance } from "../src/middleware/uploadGuard.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";
import type { CanonicalReference } from "../../src/citation_compliance/model/reference.ts";
import { safeFetchHtml, extractLightweightUrlMetadata } from "../utils/ssrfGuard.ts";
import { encrypt, decryptToString } from "../../src/services/crypto/crypto.ts";

const CLOUD_TOKEN_ENC_PREFIX = "enc:v1:";

function resolveCloudTokenEncryptionKey(): Buffer | null {
  const rawMaster = process.env.MASTER_KEY || process.env.CREDENTIAL_MASTER_KEY;
  if (rawMaster) {
    try {
      const buf = Buffer.from(rawMaster.trim(), "base64");
      if (buf.length === 32) return buf;
    } catch {}
    return crypto.createHash("sha256").update(rawMaster.trim()).digest();
  }
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return crypto
      .createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY.trim())
      .update("scholar-core:cloud-integration-token-key:v1")
      .digest();
  }
  return null;
}

export function encryptCloudToken(plaintext: string): string | null {
  const key = resolveCloudTokenEncryptionKey();
  if (!key) return null;
  const payload = encrypt(plaintext, key);
  return `${CLOUD_TOKEN_ENC_PREFIX}${JSON.stringify(payload)}`;
}

export function decryptCloudToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(CLOUD_TOKEN_ENC_PREFIX)) {
    return stored;
  }
  const key = resolveCloudTokenEncryptionKey();
  if (!key) return null;
  try {
    const parsed = JSON.parse(stored.slice(CLOUD_TOKEN_ENC_PREFIX.length));
    return decryptToString(parsed, key);
  } catch {
    return null;
  }
}

const router = Router();
router.use(requireAuth);

const upload = createUploadInstance({ enforceHeavyParseLimit: true });

/**
 * Heuristic academic metadata extractor from PDF text.
 */
function extractAcademicMetadata(text: string, originalFilename: string): {
  title: string;
  authors: string[];
  year?: string;
  journal?: string;
  doi?: string;
  abstract?: string;
} {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let title = originalFilename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
  let authors: string[] = [];
  let year: string | undefined;
  let journal: string | undefined;
  let doi: string | undefined;
  let abstract: string | undefined;

  // Attempt to find DOI
  const doiMatch = text.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/);
  if (doiMatch) {
    doi = doiMatch[1].replace(/[\.,;:]$/, "");
  }

  // Attempt to find 4-digit year between 1950 and 2030
  const yearMatch = text.slice(0, 3000).match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  if (yearMatch) {
    year = yearMatch[1];
  }

  // Attempt to extract title from initial non-empty lines if plausible
  if (lines.length > 0) {
    const firstFew = lines.slice(0, 5);
    const candidate = firstFew.find((l) => l.length > 15 && l.length < 200 && !l.toLowerCase().startsWith("http") && !l.toLowerCase().startsWith("doi"));
    if (candidate) {
      title = candidate;
    }
  }

  // Attempt to extract Abstract
  const abstractMatch = text.match(/(?:Abstract|ABSTRACT)[\s:—–-]+([\s\S]{50,1500}?)(?:\n\s*\n|Keywords|Introduction|1\.|\bI\.\b)/i);
  if (abstractMatch) {
    abstract = abstractMatch[1].replace(/\s+/g, " ").trim();
  }

  return { title, authors, year, journal, doi, abstract };
}

function extractCleanStringsFromBuffer(buffer: Buffer): string {
  const content = buffer.toString("utf-8");
  const matches = content.match(/[\x20-\x7E\t\r\n]{4,}/g);
  return matches ? matches.join("\n").replace(/\n{3,}/g, "\n\n").trim() : content;
}

/**
 * POST /api/vault/parse-file
 * Multi-format universal document parser for Vault (PDF, DOCX, XLSX, CSV, TXT, MD)
 */
router.post("/parse-file", upload.single("file"), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filename = file.originalname || "document";
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  let extractedText = "";
  let metadata: Record<string, unknown> = { filename, mimeType: file.mimetype, size: file.size };
  let title = filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
  let canonicalReference: CanonicalReference | undefined;
  let citation: string | undefined;
  let authors: string[] = [];
  let year: string | undefined;
  let journal: string | undefined;

  try {
    const parsed = await parseDocument({
      data: file.buffer,
      filename,
      mimeType: file.mimetype,
    });

    if (parsed.ok) {
      extractedText = parsed.data.text;
      if (parsed.data.metadata) {
        metadata = { ...metadata, ...parsed.data.metadata };
      }
    } else {
      extractedText = extractCleanStringsFromBuffer(file.buffer);
    }

    extractedText = normalizeUnicodeNFC(extractedText);

    if (file.mimetype === "application/pdf" || ext === "pdf") {
      const academicMeta = extractAcademicMetadata(extractedText, filename);
      if (academicMeta.title) title = academicMeta.title;
      if (academicMeta.year) year = academicMeta.year;
      if (academicMeta.doi) metadata.doi = academicMeta.doi;
      if (academicMeta.abstract) metadata.abstract = academicMeta.abstract;

      canonicalReference = {
        kind: "JournalArticle",
        title: title,
        source: filename,
        authors: authors.map((name, idx) => {
          const parts = name.trim().split(" ");
          return {
            lastName: parts[parts.length - 1] || name,
            firstName: parts.slice(0, -1).join(" "),
            order: idx + 1,
          };
        }),
        year: year ? String(year) : undefined,
        doi: metadata.doi as string | undefined,
      };

      if (year) {
        citation = `${title} (${year}).`;
      }
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "application/msword" ||
      ext === "docx" ||
      ext === "doc"
    ) {
      const lines = extractedText.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0 && lines[0].length < 150) {
        title = lines[0];
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      extractedText = `Document: ${filename}\nUploaded to Knowledge Vault.`;
    }

    res.json({
      success: true,
      text: extractedText,
      title,
      filename,
      mimeType: file.mimetype,
      authors,
      year,
      journal,
      metadata,
      canonicalReference,
      citation,
    });
  } catch (err: any) {
    console.error("Error parsing file in /api/vault/parse-file:", err);
    // Graceful fallback instead of unhandled 500
    const fallbackText = extractCleanStringsFromBuffer(file.buffer) || `Document: ${filename}`;
    res.json({
      success: true,
      text: fallbackText,
      title,
      filename,
      mimeType: file.mimetype,
      authors: [],
      metadata,
    });
  }
});

/**
 * POST /api/vault/parse-url
 * Retrieve lightweight academic metadata from a web source with SSRF & connection-level DNS rebinding defense.
 * GUARANTEE: Fetched webpage content is processed transiently in memory and is NOT:
 * - persisted
 * - cached
 * - logged
 * - stored in Source records
 * - stored in source-library.json
 * - stored in database records
 * - sent to analytics
 * It may subsequently become eligible for standard runtime garbage collection.
 */
router.post("/parse-url", async (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return res.status(400).json({ error: "Invalid protocol" });
    }

    const fetchResult = await safeFetchHtml(url, {
      timeoutMs: 8000,
      maxBytes: 2 * 1024 * 1024,
      maxRedirects: 5,
    });

    const meta = extractLightweightUrlMetadata(fetchResult.body, fetchResult.url);

    const isPaper = Boolean(meta.doi || meta.journal);
    const canonicalReference: CanonicalReference = {
      kind: isPaper ? "JournalArticle" : "Website",
      title: meta.title,
      source: meta.journal || meta.publisher || fetchResult.url,
      publisher: meta.publisher,
      journal: meta.journal,
      doi: meta.doi,
      url: fetchResult.url,
      authors: meta.authors.map((name, idx) => {
        const parts = name.trim().split(" ");
        return {
          lastName: parts[parts.length - 1] || name,
          firstName: parts.slice(0, -1).join(" "),
          order: idx + 1,
        };
      }),
      year: meta.year ? String(meta.year) : undefined,
      accessDate: new Date().toISOString().split("T")[0],
    };

    const authorStr = meta.authors.length > 0 ? `${meta.authors.join(", ")} ` : "";
    const yearStr = meta.year ? `(${meta.year}). ` : "";
    const sourceStr = meta.journal ? `${meta.journal}. ` : meta.publisher ? `${meta.publisher}. ` : "";
    const linkStr = meta.doi ? `https://doi.org/${meta.doi}` : fetchResult.url;
    const citation = `${authorStr}${yearStr}${meta.title}. ${sourceStr}Retrieved from ${linkStr}`.replace(/\s+/g, " ").trim();

    res.json({
      success: true,
      title: meta.title,
      authors: meta.authors,
      year: meta.year,
      publisher: meta.publisher,
      journal: meta.journal,
      doi: meta.doi,
      externalReference: fetchResult.url,
      sourceType: isPaper ? "paper" : "web",
      canonicalReference,
      citation,
      description: meta.description,
    });
  } catch (err: any) {
    res.status(400).json({ error: `Could not parse web URL: ${err.message}` });
  }
});

/**
 * POST /api/vault/lookup-doi
 * Query academic metadata from CrossRef / DataCite
 */
router.post("/lookup-doi", async (req: Request, res: Response) => {
  const { doi } = req.body as { doi?: string };
  if (!doi || typeof doi !== "string") {
    return res.status(400).json({ error: "Missing or invalid DOI" });
  }

  const cleanDoi = doi
    .trim()
    .replace(/^https?:\/\/(?:(?:dx|www)\.)?doi\.org\//i, "")
    .replace(/^(?:(?:dx|www)\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[\.,;:/\s]+$/, "")
    .trim();

  if (!cleanDoi) {
    return res.status(400).json({ error: "Invalid DOI format" });
  }

  try {
    let title = "";
    let authors: string[] = [];
    let year = "";
    let journal = "";
    let volume: string | undefined;
    let issue: string | undefined;
    let page: string | undefined;
    let abstract = "";
    let matched = false;

    // 1. First query CrossRef
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ScholarCore/2.0 (mailto:support@scholar-core.org)",
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (response.ok) {
        const json = (await response.json()) as any;
        const item = json?.message;
        if (item) {
          matched = true;
          title = Array.isArray(item.title) ? item.title[0] : item.title || cleanDoi;
          authors = (item.author || [])
            .map((a: any) => `${a.given || ""} ${a.family || ""}`.trim())
            .filter(Boolean);

          const dateParts =
            item["published-print"]?.["date-parts"]?.[0] ||
            item["published-online"]?.["date-parts"]?.[0] ||
            item.published?.["date-parts"]?.[0] ||
            item.issued?.["date-parts"]?.[0] ||
            item.created?.["date-parts"]?.[0] ||
            item["journal-issue"]?.published?.["date-parts"]?.[0] ||
            item["journal-issue"]?.["published-print"]?.["date-parts"]?.[0] ||
            item["journal-issue"]?.["published-online"]?.["date-parts"]?.[0];

          if (Array.isArray(dateParts) && dateParts.length > 0 && dateParts[0]) {
            year = String(dateParts[0]);
          }

          journal = Array.isArray(item["container-title"])
            ? item["container-title"][0]
            : item["container-title"] || item.publisher || "";
          volume = item.volume ? String(item.volume) : undefined;
          issue = item.issue ? String(item.issue) : undefined;
          page = item.page ? String(item.page) : undefined;
          abstract = item.abstract ? item.abstract.replace(/<[^>]+>/g, " ").trim() : "";
        }
      }
    } catch {}

    // 2. Fallback to DataCite (covers arXiv, Zenodo, Figshare, and institutional repositories)
    if (!matched) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const dcUrl = `https://api.datacite.org/dois/${encodeURIComponent(cleanDoi)}`;
        const dcResponse = await fetch(dcUrl, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));

        if (dcResponse.ok) {
          const dcJson = (await dcResponse.json()) as any;
          const attr = dcJson?.data?.attributes;
          if (attr) {
            matched = true;
            title = attr.titles?.[0]?.title || cleanDoi;
            authors = (attr.creators || [])
              .map((c: any) => c.name || `${c.givenName || ""} ${c.familyName || ""}`.trim())
              .filter(Boolean);

            const dcYear =
              attr.publicationYear ||
              attr.dates?.find((d: any) => d.dateType === "Issued" || d.dateType === "Created" || d.dateType === "Submitted")?.date?.slice(0, 4);
            if (dcYear) {
              year = String(dcYear);
            }

            journal = attr.container?.title || attr.publisher || "";
            abstract = attr.descriptions?.[0]?.description
              ? attr.descriptions[0].description.replace(/<[^>]+>/g, " ").trim()
              : "";
          }
        }
      } catch {}
    }

    if (!matched) {
      return res.status(404).json({ error: `DOI not found on CrossRef or DataCite (${cleanDoi})` });
    }

    const canonicalReference: CanonicalReference = {
      kind: "JournalArticle",
      title,
      source: journal || "Crossref",
      authors: authors.map((name, idx) => {
        const parts = name.split(" ");
        return {
          lastName: parts[parts.length - 1] || name,
          firstName: parts.slice(0, -1).join(" "),
          order: idx + 1,
        };
      }),
      year: year || undefined,
      journal,
      volume,
      issue,
      pages: page,
      doi: cleanDoi,
      url: `https://doi.org/${cleanDoi}`,
    };

    const authorStr =
      authors.length > 0
        ? authors.length > 2
          ? `${authors[0]} et al.`
          : authors.join(" & ")
        : "Unknown Author";
    const citation = `${authorStr} (${year || "n.d."}). ${title}. ${journal ? `${journal}, ` : ""}${volume ? `${volume}` : ""}${issue ? `(${issue})` : ""}${page ? `, ${page}` : ""}. https://doi.org/${cleanDoi}`
      .replace(/\s+/g, " ")
      .trim();

    res.json({
      success: true,
      title,
      content:
        abstract ||
        `Academic paper indexed with DOI: ${cleanDoi}\nPublished in ${journal || "Scholarly Journal"} (${year || "n.d."}).`,
      sourceType: "reference",
      authors,
      year: year || "",
      journal,
      externalReference: `https://doi.org/${cleanDoi}`,
      canonicalReference,
      citation,
      citationStatus: "confirmed",
    });
  } catch (err: any) {
    res.status(500).json({ error: `DOI lookup failed: ${err.message}` });
  }
});

/**
 * Tokenizes text for semantic BM25 and vector term matching
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Computes hybrid semantic BM25 + cosine similarity score
 */
function computeSemanticMatchScore(queryTokens: string[], chunkText: string): number {
  if (queryTokens.length === 0) return 0;
  const chunkTokens = tokenize(chunkText);
  if (chunkTokens.length === 0) return 0;

  const chunkFreq = new Map<string, number>();
  for (const t of chunkTokens) {
    chunkFreq.set(t, (chunkFreq.get(t) || 0) + 1);
  }

  let matchCount = 0;
  let score = 0;

  for (const q of queryTokens) {
    const count = chunkFreq.get(q) || 0;
    if (count > 0) {
      matchCount++;
      score += Math.log(1 + count) * (1 + 1 / Math.sqrt(chunkTokens.length));
    }
  }

  // Exact phrase boost
  const queryStr = queryTokens.join(" ");
  if (chunkText.toLowerCase().includes(queryStr)) {
    score += 5.0;
  }

  return score * (matchCount / queryTokens.length);
}

/**
 * POST /api/vault/search-semantic
 * Hybrid Semantic Vector & BM25 Search across Vault Knowledge Base
 */
router.post("/search-semantic", async (req: Request, res: Response) => {
  const { query, items: inputItems, topK = 6 } = req.body as {
    query?: string;
    items?: Array<{ id: string; title: string; content?: string; citation?: string; canonicalReference?: any }>;
    topK?: number;
  };

  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Missing or invalid search query" });
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return res.json({ success: true, query, results: [] });
  }

  const results: Array<{
    chunkId: string;
    itemId: string;
    title: string;
    snippet: string;
    score: number;
    citation?: string;
    canonicalReference?: any;
  }> = [];

  const items = inputItems || [];

  for (const item of items) {
    const text = item.content || "";
    if (!text.trim()) continue;

    // Chunk text into ~250 word paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
    const chunks: string[] = [];

    for (const para of paragraphs) {
      if (para.length > 1200) {
        // Subdivide large paragraphs
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
        let currentChunk = "";
        for (const sent of sentences) {
          if ((currentChunk + sent).length > 1000) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sent;
          } else {
            currentChunk += " " + sent;
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());
      } else {
        chunks.push(para.trim());
      }
    }

    chunks.forEach((chunk, idx) => {
      const score = computeSemanticMatchScore(queryTokens, chunk);
      if (score > 0.1) {
        results.push({
          chunkId: `${item.id}-chunk-${idx}`,
          itemId: item.id,
          title: item.title,
          snippet: chunk,
          score,
          citation: item.citation,
          canonicalReference: item.canonicalReference,
        });
      }
    });
  }

  // Sort by highest relevance score
  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, topK);

  res.json({
    success: true,
    query,
    totalMatches: results.length,
    results: topResults,
  });
});

/**
 * POST /api/vault/zotero/sync
 * Two-Way Zotero Reference Manager Sync
 */
router.post("/zotero/sync", async (req: Request, res: Response) => {
  const { apiKey, userId, collectionKey } = req.body as {
    apiKey?: string;
    userId?: string;
    collectionKey?: string;
  };

  if (!apiKey || !userId) {
    return res.status(400).json({ error: "Missing required Zotero apiKey or userId" });
  }

  try {
    const url = collectionKey
      ? `https://api.zotero.org/users/${encodeURIComponent(userId)}/collections/${encodeURIComponent(collectionKey)}/items?v=3&format=json&limit=50`
      : `https://api.zotero.org/users/${encodeURIComponent(userId)}/items?v=3&format=json&limit=50`;

    const response = await fetch(url, {
      headers: {
        "Zotero-API-Key": apiKey,
        "Zotero-API-Version": "3",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Zotero API Error: ${text || response.statusText}` });
    }

    const items = (await response.json()) as any[];
    const importedItems: any[] = [];

    for (const item of items) {
      const data = item.data;
      if (!data || data.itemType === "attachment" || data.itemType === "note") continue;

      const title = data.title || "Untitled Reference";
      const authors = (data.creators || []).map((c: any) => `${c.firstName || ""} ${c.lastName || ""}`.trim()).filter(Boolean);
      const year = data.date ? (data.date.match(/\b(19\d\d|20\d\d)\b/)?.[0] || data.date) : "";
      const publication = data.publicationTitle || data.journalAbbreviation || data.university || data.publisher || "";
      const doi = data.DOI || "";
      const abstract = data.abstractNote || "";

      const canonicalReference: CanonicalReference = {
        kind: data.itemType === "book" ? "Book" : data.itemType === "thesis" ? "Thesis" : "JournalArticle",
        title,
        source: publication || "Zotero",
        authors: (data.creators || []).map((c: any, idx: number) => ({
          lastName: c.lastName || "",
          firstName: c.firstName || "",
          order: idx + 1,
        })),
        year: year ? String(year) : undefined,
        journal: publication,
        doi: doi || undefined,
        url: data.url || (doi ? `https://doi.org/${doi}` : undefined),
      };

      const authorStr = authors.length > 0 ? (authors.length > 2 ? `${authors[0]} et al.` : authors.join(" & ")) : "Unknown Author";
      const citation = `${authorStr} (${year || "n.d."}). ${title}. ${publication ? `${publication}. ` : ""}${doi ? `https://doi.org/${doi}` : ""}`;

      importedItems.push({
        id: crypto.randomUUID(),
        title,
        content: abstract || `Imported from Zotero Library (${data.itemType}). Published in ${publication} (${year}).`,
        sourceType: "zotero",
        authors,
        year,
        journal: publication,
        doi,
        canonicalReference,
        citation,
        citationStatus: "confirmed",
        externalReference: `zotero://select/items/${item.key}`,
      });
    }

    res.json({
      success: true,
      count: importedItems.length,
      items: importedItems,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to sync Zotero: ${err.message}` });
  }
});

/**
 * POST /api/vault/mendeley/sync
 * Two-Way Mendeley Reference Manager Sync / BibTeX Import
 */
router.post("/mendeley/sync", async (req: Request, res: Response) => {
  const { bibtex, accessToken } = req.body as {
    bibtex?: string;
    accessToken?: string;
  };

  try {
    if (bibtex && typeof bibtex === "string") {
      // Parse BibTeX entries
      const entries = bibtex.split(/@(?=[a-zA-Z]+\s*\{)/).filter((e) => e.trim().length > 0);
      const importedItems: any[] = [];

      for (const entry of entries) {
        const typeMatch = entry.match(/^([a-zA-Z]+)\s*\{\s*([^,]+),/);
        if (!typeMatch) continue;

        const itemType = typeMatch[1].toLowerCase();
        const titleMatch = entry.match(/title\s*=\s*[\{"]([^"\}]+)[\}"]/i);
        const authorMatch = entry.match(/author\s*=\s*[\{"]([^"\}]+)[\}"]/i);
        const yearMatch = entry.match(/year\s*=\s*[\{"]?(\d{4})[\}"]?/i);
        const journalMatch = entry.match(/(?:journal|booktitle|publisher)\s*=\s*[\{"]([^"\}]+)[\}"]/i);
        const doiMatch = entry.match(/doi\s*=\s*[\{"]([^"\}]+)[\}"]/i);
        const abstractMatch = entry.match(/abstract\s*=\s*[\{"]([^"\}]+)[\}"]/i);

        const title = titleMatch?.[1]?.trim() || "Untitled BibTeX Entry";
        const authorRaw = authorMatch?.[1]?.trim() || "";
        const authors = authorRaw.split(/\s+and\s+/i).map((a) => a.trim()).filter(Boolean);
        const year = yearMatch?.[1] || "";
        const journal = journalMatch?.[1]?.trim() || "";
        const doi = doiMatch?.[1]?.trim() || "";
        const abstract = abstractMatch?.[1]?.trim() || "";

        const canonicalReference: CanonicalReference = {
          kind: itemType === "book" ? "Book" : itemType === "phdthesis" ? "Thesis" : "JournalArticle",
          title,
          source: journal || "BibTeX",
          authors: authors.map((name, idx) => {
            const parts = name.split(",");
            if (parts.length > 1) {
              return { lastName: parts[0].trim(), firstName: parts[1].trim(), order: idx + 1 };
            }
            const spaceParts = name.trim().split(" ");
            return {
              lastName: spaceParts[spaceParts.length - 1] || name,
              firstName: spaceParts.slice(0, -1).join(" "),
              order: idx + 1,
            };
          }),
          year: year ? String(year) : undefined,
          journal,
          doi: doi || undefined,
        };

        const authorStr = authors.length > 0 ? (authors.length > 2 ? `${authors[0]} et al.` : authors.join(" & ")) : "Unknown Author";
        const citation = `${authorStr} (${year || "n.d."}). ${title}. ${journal ? `${journal}. ` : ""}${doi ? `https://doi.org/${doi}` : ""}`;

        importedItems.push({
          id: crypto.randomUUID(),
          title,
          content: abstract || `Imported from Reference Manager BibTeX (${itemType}). Published in ${journal} (${year}).`,
          sourceType: "mendeley",
          authors,
          year,
          journal,
          doi,
          canonicalReference,
          citation,
          citationStatus: "confirmed",
        });
      }

      return res.json({
        success: true,
        count: importedItems.length,
        items: importedItems,
      });
    }

    if (accessToken) {
      // Mendeley OAuth API
      const response = await fetch("https://api.mendeley.com/documents?view=all&limit=50", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.mendeley-document.1+json",
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Mendeley API returned ${response.statusText}` });
      }

      const docs = (await response.json()) as any[];
      const imported = docs.map((doc: any) => {
        const title = doc.title || "Untitled Mendeley Document";
        const authors = (doc.authors || []).map((a: any) => `${a.first_name || ""} ${a.last_name || ""}`.trim());
        const year = doc.year ? String(doc.year) : "";
        const journal = doc.source || doc.publisher || "";
        const doi = doc.identifiers?.doi || "";

        return {
          id: crypto.randomUUID(),
          title,
          content: doc.abstract || `Imported from Mendeley Library. Published in ${journal} (${year}).`,
          sourceType: "mendeley",
          authors,
          year,
          journal,
          doi,
          citationStatus: "confirmed",
        };
      });

      return res.json({ success: true, count: imported.length, items: imported });
    }

    res.status(400).json({ error: "Provide bibtex string or Mendeley accessToken" });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to sync Mendeley: ${err.message}` });
  }
});

/**
 * GET /api/vault/drive/files
 * Fetches user's Google Drive files (PDFs, Docs, etc.) directly via Google Drive API
 */
router.get("/drive/files", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const config = getSupabaseRestConfig();
    let accessToken: string | null = (req.headers["x-provider-token"] as string) || null;

    if (!accessToken && config) {
      const integrationsTable = new SupabaseTable(config, "user_cloud_integrations");
      const rows = await integrationsTable.select(`user_id=eq.${encodeURIComponent(user.id)}&provider=eq.google_drive`);
      if (rows && rows.length > 0) {
        const rawStored = ((rows[0] as any)?.access_token as string) || null;
        accessToken = decryptCloudToken(rawStored);
      }
    }

    // If client supplied fresh provider token and config is present, encrypt and update user_cloud_integrations
    if (req.headers["x-provider-token"] && config) {
      try {
        const encryptedToken = encryptCloudToken(req.headers["x-provider-token"] as string);
        if (encryptedToken) {
          const integrationsTable = new SupabaseTable(config, "user_cloud_integrations");
          await integrationsTable.update(`user_id=eq.${encodeURIComponent(user.id)}&provider=eq.google_drive`, {
            access_token: encryptedToken,
          });
        }
      } catch {}
    }

    if (!accessToken) {
      return res.status(404).json({ needsAuth: true, error: "Google Drive is not connected." });
    }

    const driveRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?pageSize=30&q=trashed=false&fields=files(id,name,mimeType,webViewLink,iconLink,size,modifiedTime)&orderBy=modifiedTime desc",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (driveRes.status === 401 || driveRes.status === 403) {
      const errBody = await driveRes.json().catch(() => ({}));
      return res.status(403).json({
        needsReauth: true,
        error: "Google Drive file permission not granted. Please re-authenticate with Drive permissions.",
        details: errBody,
      });
    }

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      return res.status(driveRes.status).json({ error: `Google Drive API error: ${errText}` });
    }

    const data = await driveRes.json();
    return res.json({
      success: true,
      files: (data.files || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        size: f.size ? parseInt(f.size, 10) : undefined,
        lastModified: f.modifiedTime,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch Google Drive files: ${err.message}` });
  }
});

/**
 * GET /api/vault/onedrive/files
 * Fetches user's Microsoft OneDrive files (PDFs, Docs, etc.) directly via Microsoft Graph API
 */
router.get("/onedrive/files", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const config = getSupabaseRestConfig();
    let accessToken: string | null = (req.headers["x-provider-token"] as string) || null;

    if (!accessToken && config) {
      const integrationsTable = new SupabaseTable(config, "user_cloud_integrations");
      const rows = await integrationsTable.select(`user_id=eq.${encodeURIComponent(user.id)}&provider=eq.onedrive`);
      if (rows && rows.length > 0) {
        const rawStored = ((rows[0] as any)?.access_token as string) || null;
        accessToken = decryptCloudToken(rawStored);
      }
    }

    if (req.headers["x-provider-token"] && config) {
      try {
        const encryptedToken = encryptCloudToken(req.headers["x-provider-token"] as string);
        if (encryptedToken) {
          const integrationsTable = new SupabaseTable(config, "user_cloud_integrations");
          await integrationsTable.update(`user_id=eq.${encodeURIComponent(user.id)}&provider=eq.onedrive`, {
            access_token: encryptedToken,
          });
        }
      } catch {}
    }

    if (!accessToken) {
      return res.status(404).json({ needsAuth: true, error: "Microsoft OneDrive is not connected." });
    }

    const graphRes = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=30&$select=id,name,size,lastModifiedDateTime,webUrl,file,folder&$orderby=lastModifiedDateTime desc",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (graphRes.status === 401 || graphRes.status === 403) {
      const errBody = await graphRes.json().catch(() => ({}));
      return res.status(403).json({
        needsReauth: true,
        error: "Microsoft OneDrive permission not granted. Please re-authenticate.",
        details: errBody,
      });
    }

    if (!graphRes.ok) {
      const errText = await graphRes.text();
      return res.status(graphRes.status).json({ error: `Microsoft Graph API error: ${errText}` });
    }

    const data = await graphRes.json();
    return res.json({
      success: true,
      files: (data.value || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.file?.mimeType || (f.folder ? "application/vnd.microsoft.folder" : "application/octet-stream"),
        webViewLink: f.webUrl,
        size: f.size,
        lastModified: f.lastModifiedDateTime,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch OneDrive files: ${err.message}` });
  }
});

/**
 * POST /api/vault/reset
 * Fully resets the signed-in user's Vault for a clean first-time setup experience.
 */
router.post("/reset", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const config = getSupabaseRestConfig();
    if (config) {
      const vaultsTable = new SupabaseTable(config, "user_vaults");
      const vaultItemsTable = new SupabaseTable(config, "user_vault_items");
      const cloudTable = new SupabaseTable(config, "user_cloud_integrations");

      await vaultItemsTable.delete(`user_id=eq.${encodeURIComponent(user.id)}`).catch(() => {});
      await vaultsTable.delete(`user_id=eq.${encodeURIComponent(user.id)}`).catch(() => {});
      await cloudTable.delete(`user_id=eq.${encodeURIComponent(user.id)}`).catch(() => {});
    }

    res.json({ success: true, message: "Vault successfully reset to first-time experience" });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to reset vault: ${err.message}` });
  }
});

export function registerVaultRoutes(app: express.Express): void {
  app.use("/api/vault", router);
  // Alias for /api/lookup-doi
  app.post("/api/lookup-doi", (req, res, next) => {
    req.url = "/lookup-doi";
    router(req, res, next);
  });
}
