import express, { Router, Request, Response } from "express";
import multer from "multer";
import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { requireAuth } from "../src/middleware/auth.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";
import type { CanonicalReference } from "../../src/citation_compliance/model/reference.ts";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB limit
  },
});

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
  let metadata: Record<string, any> = { filename, mimeType: file.mimetype, size: file.size };
  let title = filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
  let canonicalReference: CanonicalReference | undefined;
  let citation: string | undefined;
  let authors: string[] = [];
  let year: string | undefined;
  let journal: string | undefined;

  try {
    if (file.mimetype === "application/pdf" || ext === "pdf") {
      try {
        const pdfData = await pdfParse(file.buffer);
        extractedText = pdfData.text || "";
        metadata.pageCount = pdfData.numpages;
      } catch (pdfErr) {
        console.warn("pdf-parse fallback triggered:", pdfErr);
        extractedText = extractCleanStringsFromBuffer(file.buffer);
      }

      const academicMeta = extractAcademicMetadata(extractedText, filename);
      if (academicMeta.title) title = academicMeta.title;
      if (academicMeta.year) year = academicMeta.year;
      if (academicMeta.doi) metadata.doi = academicMeta.doi;
      if (academicMeta.abstract) metadata.abstract = academicMeta.abstract;

      canonicalReference = {
        id: crypto.randomUUID(),
        kind: "journal",
        title: title,
        authors: authors.map((name) => {
          const parts = name.split(" ");
          return { lastName: parts[parts.length - 1] || name, initials: parts[0]?.[0] || "" };
        }),
        year: year ? parseInt(year, 10) : undefined,
        doi: metadata.doi,
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
      try {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        extractedText = result.value || "";
      } catch (docErr) {
        console.warn("mammoth docx fallback triggered:", docErr);
        extractedText = extractCleanStringsFromBuffer(file.buffer);
      }
      const lines = extractedText.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length > 0 && lines[0].length < 150) {
        title = lines[0];
      }
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      ext === "xlsx" ||
      ext === "xls"
    ) {
      try {
        const workbook = XLSX.read(file.buffer, { type: "buffer" });
        const sheetNames = workbook.SheetNames;
        metadata.sheets = sheetNames;

        const textParts: string[] = [`Spreadsheet: ${filename}`, `Sheets: ${sheetNames.join(", ")}\n`];

        for (const sheetName of sheetNames.slice(0, 5)) {
          const worksheet = workbook.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
          textParts.push(`--- Sheet: ${sheetName} (${rows.length} rows) ---`);
          const previewRows = rows.slice(0, 20);
          previewRows.forEach((r) => {
            textParts.push(r.map((c) => String(c).trim()).filter(Boolean).join(" | "));
          });
          if (rows.length > 20) {
            textParts.push(`... and ${rows.length - 20} more rows`);
          }
          textParts.push("\n");
        }
        extractedText = textParts.join("\n");
      } catch (xlsxErr) {
        console.warn("xlsx fallback triggered:", xlsxErr);
        extractedText = extractCleanStringsFromBuffer(file.buffer);
      }
    } else if (file.mimetype === "text/csv" || ext === "csv") {
      try {
        const csvContent = file.buffer.toString("utf-8");
        const workbook = XLSX.read(csvContent, { type: "string" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        const textParts: string[] = [`Dataset (CSV): ${filename} (${rows.length} rows)\n`];
        rows.slice(0, 30).forEach((r) => {
          textParts.push(r.map((c) => String(c).trim()).filter(Boolean).join(" | "));
        });
        if (rows.length > 30) {
          textParts.push(`... and ${rows.length - 30} more rows`);
        }
        extractedText = textParts.join("\n");
        metadata.rowCount = rows.length;
      } catch {
        extractedText = file.buffer.toString("utf-8");
      }
    } else {
      // Plain text / markdown / fallback
      extractedText = extractCleanStringsFromBuffer(file.buffer);
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
 * Ingest web articles or online sources
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ScholarCore-VaultBot/2.0 (+https://scholar-core.org)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch URL: HTTP ${response.status}` });
    }

    const html = await response.text();

    // Extract title from <title> or OpenGraph
    let title = url;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/&[a-z]+;/g, " ").trim();
    }

    // Extract author / site name
    let siteName = parsedUrl.hostname;
    const siteMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    if (siteMatch) siteName = siteMatch[1].trim();

    // Clean body text
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim();

    const snippet = cleanText.slice(0, 50000);

    const canonicalReference: CanonicalReference = {
      id: crypto.randomUUID(),
      kind: "webpage",
      title: title,
      publisher: siteName,
      url: url,
      accessDate: new Date().toISOString().split("T")[0],
    };

    res.json({
      success: true,
      title,
      content: snippet,
      externalReference: url,
      sourceType: "web",
      canonicalReference,
      citation: `${title}. Retrieved from ${url}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Could not parse web URL: ${err.message}` });
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

  const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, "");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ScholarCore/2.0 (mailto:support@scholar-core.org)",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      return res.status(404).json({ error: `DOI not found on CrossRef (${cleanDoi})` });
    }

    const json = (await response.json()) as any;
    const item = json.message;
    if (!item) {
      return res.status(404).json({ error: "Empty response from CrossRef" });
    }

    const title = Array.isArray(item.title) ? item.title[0] : item.title || cleanDoi;
    const authors: string[] = (item.author || []).map((a: any) => `${a.given || ""} ${a.family || ""}`.trim()).filter(Boolean);
    const year = item.created?.["date-parts"]?.[0]?.[0] || item.issued?.["date-parts"]?.[0]?.[0] || "";
    const journal = Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"] || "";
    const volume = item.volume;
    const issue = item.issue;
    const page = item.page;
    const abstract = item.abstract ? item.abstract.replace(/<[^>]+>/g, " ").trim() : "";

    const canonicalReference: CanonicalReference = {
      id: crypto.randomUUID(),
      kind: "journal",
      title,
      authors: (item.author || []).map((a: any) => ({
        lastName: a.family || "",
        initials: (a.given || "").split(" ").map((s: string) => s[0]).join(""),
      })),
      year: year ? parseInt(String(year), 10) : undefined,
      journal,
      volume,
      issue,
      pages: page,
      doi: cleanDoi,
      url: `https://doi.org/${cleanDoi}`,
    };

    const authorStr = authors.length > 0 ? (authors.length > 2 ? `${authors[0]} et al.` : authors.join(" & ")) : "Unknown Author";
    const citation = `${authorStr} (${year || "n.d."}). ${title}. ${journal ? `${journal}, ` : ""}${volume ? `${volume}` : ""}${issue ? `(${issue})` : ""}${page ? `, ${page}` : ""}. https://doi.org/${cleanDoi}`;

    res.json({
      success: true,
      title,
      content: abstract || `Academic paper indexed with DOI: ${cleanDoi}\nPublished in ${journal || "Scholarly Journal"} (${year || "n.d."}).`,
      sourceType: "reference",
      authors,
      year: String(year),
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
}
