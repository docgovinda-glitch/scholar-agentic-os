import { Router, Request, Response, NextFunction } from "express";
import { parseDocument, cleanHtmlToText, normalizeUnicodeNFC } from "../../../src/document_intelligence/index.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { loadOwnedProject } from "./core/projectHelpers.ts";
import { createUploadInstance } from "../../src/middleware/uploadGuard.ts";
import { safeFetchHtml } from "../../utils/ssrfGuard.ts";

const parseRouter = Router({ mergeParams: true });

// Verify project ownership before parsing files or fetching URLs
parseRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await loadOwnedProject(getProjectStore(), req, res);
    if (!record) return;
    next();
  } catch (err) {
    next(err);
  }
});

// Enforce strict ephemeral in-memory buffer handling (MAX_UPLOAD_MB default 10 MB + heavy-parse concurrency guard)
const upload = createUploadInstance({ enforceHeavyParseLimit: true });

/**
 * POST /api/projects/:id/parse-file
 * Multipart file upload handler for all document types (PDF, Word, PPTX, Excel, CSV, Images, Text)
 * Uses the unified src/document_intelligence parser registry with lossless NFC Unicode preservation.
 */
parseRouter.post("/", upload.single("file"), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const filename = file.originalname || "document";
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  let text = "";
  let sourceType: "pdf" | "docx" | "pptx" | "spreadsheet" | "image" | "text" | "other" = "other";
  let metadata: Record<string, unknown> = { filename, mimeType: file.mimetype, size: file.size };

  try {
    if (file.mimetype.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif"].includes(ext)) {
      sourceType = "image";
      metadata.isImage = true;
      metadata.dimensions = "Standard Visual Artifact";
      text = normalizeUnicodeNFC(`[Visual Document / Scanned Figure: ${filename}]\nImage source provided for research analysis and visual grounding.`);
    } else {
      const parsed = await parseDocument({
        data: file.buffer,
        filename,
        mimeType: file.mimetype,
      });

      if (!parsed.ok) {
        return res.status(400).json({ error: `Failed to parse document: ${parsed.error.message}` });
      }

      text = parsed.data.text;
      if (parsed.data.metadata) {
        metadata = { ...metadata, ...parsed.data.metadata };
      }

      // Determine clean source type
      if (file.mimetype === "application/pdf" || ext === "pdf") {
        sourceType = "pdf";
      } else if (
        file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.mimetype === "application/msword" ||
        ext === "docx" ||
        ext === "doc"
      ) {
        sourceType = "docx";
      } else if (
        file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        file.mimetype === "application/vnd.ms-powerpoint" ||
        ext === "pptx" ||
        ext === "ppt"
      ) {
        sourceType = "pptx";
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
      } else if (file.mimetype.startsWith("text/") || ["txt", "md", "markdown", "json", "rtf"].includes(ext)) {
        sourceType = "text";
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: `Failed to parse document: ${errorMsg}` });
  }

  return res.json({
    success: true,
    text,
    title: normalizeUnicodeNFC(filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ")),
    sourceType,
    metadata,
  });
});

/**
 * POST /api/projects/:id/parse-file/url
 * Fetch and extract article content from web pages / academic URLs with SSRF & DNS rebinding defense
 */
parseRouter.post("/url", async (req: Request, res: Response) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Valid URL is required" });
  }

  try {
    const trimmed = url.trim();
    const parsedUrl = new URL(trimmed);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return res.status(400).json({ error: "Invalid protocol" });
    }

    const fetchResult = await safeFetchHtml(trimmed, {
      timeoutMs: 8000,
      maxBytes: 2 * 1024 * 1024,
      maxRedirects: 5,
    });

    const finalUrl = new URL(fetchResult.url);
    const { title, text } = cleanHtmlToText(fetchResult.body);

    return res.json({
      success: true,
      text,
      title,
      sourceType: "weblink",
      metadata: {
        url: finalUrl.toString(),
        domain: finalUrl.hostname,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: `Failed to fetch URL: ${errorMsg}` });
  }
});

/**
 * POST /api/projects/:id/parse-file/text
 * Process pasted text or lecture notes
 */
parseRouter.post("/text", async (req: Request, res: Response) => {
  const { text, title } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text content is required" });
  }

  const trimmedText = normalizeUnicodeNFC(text.trim());
  return res.json({
    success: true,
    text: trimmedText,
    title: (title && typeof title === "string" && normalizeUnicodeNFC(title.trim())) || "Pasted Lecture Notes",
    sourceType: "text",
    metadata: {
      wordCount: trimmedText.split(/\s+/).filter(Boolean).length,
      createdAt: new Date().toISOString(),
    },
  });
});

export default parseRouter;
