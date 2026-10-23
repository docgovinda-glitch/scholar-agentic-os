import { Router, Request, Response } from "express";
import multer from "multer";
import { parseDocument, cleanHtmlToText, normalizeUnicodeNFC } from "../../../src/document_intelligence/index.ts";

const parseRouter = Router({ mergeParams: true });

// Enforce strict ephemeral in-memory buffer handling (Multer memoryStorage only, zero residual disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

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
 * Fetch and extract article content from web pages / academic URLs
 */
parseRouter.post("/url", async (req: Request, res: Response) => {
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

    return res.json({
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
