import { Router } from "express";
import multer from "multer";
import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";

const parseRouter = Router({ mergeParams: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; numPages?: number }> {
  try {
    if (typeof (pdfParseModule as any).PDFParse === "function") {
      const parser = new (pdfParseModule as any).PDFParse({ data: buffer });
      const res = await parser.getText();
      return { text: res.text || "" };
    }
    const fn = (pdfParseModule as any).default || pdfParseModule;
    if (typeof fn === "function") {
      const res = await fn(buffer);
      return { text: res.text || "", numPages: res.numpages };
    }
  } catch (err) {
    console.warn("PDF parser error:", err);
  }
  return { text: "" };
}

/** Extract text from PowerPoint (.pptx) by reading slide XML files inside the zip */
async function extractTextFromPptx(buffer: Buffer): Promise<{ text: string; slideCount: number }> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/i.test(name)
    );

    // Sort slides numerically: slide1, slide2, slide3...
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });

    const slideTexts: string[] = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const filename = slideFiles[i];
      const xml = await zip.files[filename].async("text");
      // Extract all <a:t> text nodes
      const textMatches = xml.match(/<a:t[^>]*>(.*?)<\/a:t>/g) || [];
      const cleaned = textMatches
        .map((m) => m.replace(/<\/?a:t[^>]*>/g, "").trim())
        .filter(Boolean)
        .join(" ");

      if (cleaned) {
        slideTexts.push(`[Slide ${i + 1}]\n${cleaned}`);
      }
    }

    if (slideTexts.length > 0) {
      return { text: slideTexts.join("\n\n"), slideCount: slideFiles.length };
    }
  } catch (err) {
    console.warn("PPTX parser error:", err);
  }
  return { text: "", slideCount: 0 };
}

/** Extract tabular data from Excel / Spreadsheet (.xlsx, .xls, .csv, .tsv) */
function extractTextFromSpreadsheet(buffer: Buffer, ext: string): { text: string; summary: string; rowCount: number } {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames || [];
    const textParts: string[] = [];
    let totalRows = 0;

    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
      totalRows += rows.length;
      textParts.push(`[Sheet: ${sheetName}] (${rows.length} rows)`);

      // Extract header and first 100 sample data rows
      const sample = rows.slice(0, 100);
      sample.forEach((row, rowIdx) => {
        const rowStr = row.map((c) => String(c).trim()).filter(Boolean).join(" | ");
        if (rowStr) {
          textParts.push(`Row ${rowIdx + 1}: ${rowStr}`);
        }
      });
      if (rows.length > 100) {
        textParts.push(`... and ${rows.length - 100} more rows`);
      }
      textParts.push("");
    }

    const summary = `Spreadsheet containing ${sheetNames.length} sheet(s) (${sheetNames.join(", ")}), with ${totalRows} total rows.`;
    return { text: textParts.join("\n"), summary, rowCount: totalRows };
  } catch (err) {
    console.warn("Spreadsheet parser error:", err);
    return { text: buffer.toString("utf-8"), summary: "", rowCount: 0 };
  }
}

/** Clean HTML to readable text for URLs */
function cleanHtmlToText(html: string): { title: string; text: string } {
  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/&[^;]+;/g, " ").trim() : "Web Article";

  // Remove scripts, styles, svg
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");

  // Convert common block elements to newlines
  cleaned = cleaned
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

  return { title, text: cleaned };
}

/**
 * POST /api/projects/:id/parse-file
 * Multipart file upload handler for all document types (PDF, Word, PPTX, Excel, CSV, Images, Text)
 */
parseRouter.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const filename = file.originalname || "document";
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  let text = "";
  let sourceType: "pdf" | "docx" | "pptx" | "spreadsheet" | "image" | "text" | "other" = "other";
  let metadata: Record<string, any> = { filename, mimeType: file.mimetype, size: file.size };

  try {
    if (file.mimetype === "application/pdf" || ext === "pdf") {
      sourceType = "pdf";
      const data = await extractTextFromPdf(file.buffer);
      text = data.text;
      if (data.numPages) metadata.pageCount = data.numPages;
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "application/msword" ||
      ext === "docx" ||
      ext === "doc"
    ) {
      sourceType = "docx";
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value;
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      file.mimetype === "application/vnd.ms-powerpoint" ||
      ext === "pptx" ||
      ext === "ppt"
    ) {
      sourceType = "pptx";
      const result = await extractTextFromPptx(file.buffer);
      text = result.text;
      metadata.slideCount = result.slideCount;
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "text/csv" ||
      file.mimetype === "text/tab-separated-values" ||
      ext === "xlsx" ||
      ext === "xls" ||
      ext === "csv" ||
      ext === "tsv"
    ) {
      sourceType = "spreadsheet";
      const result = extractTextFromSpreadsheet(file.buffer, ext);
      text = result.text;
      metadata.summary = result.summary;
      metadata.rowCount = result.rowCount;
    } else if (file.mimetype.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif"].includes(ext)) {
      sourceType = "image";
      metadata.isImage = true;
      metadata.dimensions = "Standard Visual Artifact";
      // Heuristic text marker for scanned diagrams / figures
      text = `[Visual Document / Scanned Figure: ${filename}]\nImage source provided for research analysis and visual grounding.`;
    } else if (
      file.mimetype.startsWith("text/") ||
      ["txt", "md", "markdown", "json", "rtf"].includes(ext)
    ) {
      sourceType = "text";
      text = file.buffer.toString("utf-8");
    } else {
      // Fallback extraction
      const raw = file.buffer.toString("utf-8");
      const matches = raw.match(/[\x20-\x7E\t\r\n]{4,}/g);
      text = matches ? matches.join("\n").replace(/\n{3,}/g, "\n\n").trim() : raw;
    }
  } catch (error: any) {
    return res.status(400).json({ error: `Failed to parse document: ${error.message}` });
  }

  res.json({
    success: true,
    text,
    title: filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
    sourceType,
    metadata,
  });
});

/**
 * POST /api/projects/:id/parse-file/url
 * Fetch and extract article content from web pages / academic URLs
 */
parseRouter.post("/url", async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Valid URL is required" });
  }

  try {
    const parsedUrl = new URL(url.trim());
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": "ScholarCoreAcademicReader/2.0 (Research & Citation Grounding)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Could not access URL (${response.status} ${response.statusText})`,
      });
    }

    const html = await response.text();
    const { title, text } = cleanHtmlToText(html);

    res.json({
      success: true,
      text,
      title,
      sourceType: "weblink",
      metadata: {
        url: parsedUrl.toString(),
        domain: parsedUrl.hostname,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: `Failed to fetch URL: ${err.message}` });
  }
});

/**
 * POST /api/projects/:id/parse-file/text
 * Process pasted text or lecture notes
 */
parseRouter.post("/text", async (req, res) => {
  const { text, title } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text content is required" });
  }

  res.json({
    success: true,
    text: text.trim(),
    title: (title && typeof title === "string" && title.trim()) || "Pasted Lecture Notes",
    sourceType: "text",
    metadata: {
      wordCount: text.trim().split(/\s+/).filter(Boolean).length,
      createdAt: new Date().toISOString(),
    },
  });
});

export default parseRouter;
