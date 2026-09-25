import { Router } from "express";
import multer from "multer";
import * as pdfParseModule from "pdf-parse";
const pdfParse = (pdfParseModule as any).default || pdfParseModule;
import mammoth from "mammoth";

const parseRouter = Router({ mergeParams: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string }> {
  try {
    if (typeof (pdfParseModule as any).PDFParse === "function") {
      const parser = new (pdfParseModule as any).PDFParse({ data: buffer });
      const res = await parser.getText();
      return { text: res.text || "" };
    }
    const fn = (pdfParseModule as any).default || pdfParseModule;
    if (typeof fn === "function") {
      const res = await fn(buffer);
      return { text: res.text || "" };
    }
  } catch (err) {
    console.warn("PDF parser error:", err);
  }
  return { text: "" };
}

parseRouter.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file provided" });
  }

  let text = "";

  try {
    if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
      const data = await extractTextFromPdf(file.buffer);
      text = data.text;
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.originalname.endsWith(".docx") ||
      file.originalname.endsWith(".doc")
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value;
    } else if (
      file.mimetype.startsWith("text/") ||
      file.originalname.endsWith(".txt") ||
      file.originalname.endsWith(".md") ||
      file.originalname.endsWith(".csv") ||
      file.originalname.endsWith(".tsv") ||
      file.originalname.endsWith(".json")
    ) {
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

  res.json({ success: true, text });
});

export default parseRouter;
