import express from "express";
import path from "path";
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../../src/citation_compliance/model/reference.ts";
import { PDFParser } from "../../src/document_intelligence/parser/parsers/pdfParser.ts";
import { DOCXParser } from "../../src/document_intelligence/parser/parsers/docxParser.ts";
import { TXTParser } from "../../src/document_intelligence/parser/parsers/txtParser.ts";
import { MarkdownParser } from "../../src/document_intelligence/parser/parsers/markdownParser.ts";
import { detectHeadings } from "../../src/document_intelligence/parser/headingDetection.ts";
import { importBibTex } from "../../src/citation_compliance/importers/bibtexImporter.ts";
import { importRis } from "../../src/citation_compliance/importers/risImporter.ts";
import { completeWithFailover } from "../../src/platform/gateway/gateway.js";
import { defaultPolicy } from "../../src/platform/warden/policy.js";
import { mapTaskType, getCandidates } from "../utils/llm.js";

function extractPrintableStrings(buffer: Buffer): string {
  let result = "";
  let currentString = "";
  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];
    if (char >= 32 && char <= 126) {
      currentString += String.fromCharCode(char);
    } else if (char === 10 || char === 13) {
      if (currentString.length >= 4) {
        result += currentString + "\n";
      }
      currentString = "";
    } else {
      if (currentString.length >= 4) {
        result += currentString + " ";
      }
      currentString = "";
    }
  }
  if (currentString.length >= 4) {
    result += currentString;
  }
  // Strip common binary layout tags
  return result
    .replace(/[a-zA-Z0-9_\-\/]+\s*<<[^>]*>>/g, "")
    .replace(/\/Type\s*\/[a-zA-Z]+/g, "")
    .replace(/endstream|endobj|startxref/g, "")
    .slice(0, 100000);
}

/** Build a human-readable plain-text summary of imported references (for the `text` response field). */
function summarizeReferences(references: CanonicalReference[]): string {
  return references
    .map((r, i) => {
      const authorNames = r.authors.map((a) => `${a.firstName} ${a.lastName}`.trim()).join(", ");
      return `${i + 1}. ${r.title}${authorNames ? ` - ${authorNames}` : ""}${r.year ? ` (${r.year})` : ""}${r.source ? ` [${r.source}]` : ""}`;
    })
    .join("\n");
}

export function registerParseRoutes(app: express.Express, parseFileLimit: any, parseExternalLinkLimit: any, lookupDoiLimit: any): void {
  // File Parser Endpoint (Accepts Base64 JSON Payload)
  app.post("/api/parse-file", parseFileLimit, async (req, res) => {
    try {
      const { fileName, fileType, fileContent } = req.body;
      if (!fileName || !fileContent) {
        return res.status(400).json({ error: "Missing required parameters: fileName, fileContent" });
      }

      const buffer = Buffer.from(fileContent, "base64");
      let text = "";
      let references: CanonicalReference[] | undefined;
      let importWarnings: string[] | undefined;
      const ext = path.extname(fileName).toLowerCase();

      if (ext === ".bib") {
        const result = importBibTex(buffer.toString("utf8"));
        references = result.references;
        importWarnings = result.warnings;
        text = summarizeReferences(result.references) || buffer.toString("utf8");
      } else if (ext === ".ris") {
        const result = importRis(buffer.toString("utf8"));
        references = result.references;
        importWarnings = result.warnings;
        text = summarizeReferences(result.references) || buffer.toString("utf8");
      } else if (ext === ".txt") {
        try {
          const result = await new TXTParser().parse({ data: buffer, filename: fileName });
          if (result.ok === false) throw new Error(result.error.message);
          text = result.data.text || "";
        } catch (err: any) {
          console.warn("[Parser] TXTParser failed, using raw text fallback:", err.message);
          text = buffer.toString("utf8");
        }
      } else if ([".md", ".markdown"].includes(ext)) {
        try {
          const result = await new MarkdownParser().parse({ data: buffer, filename: fileName });
          if (result.ok === false) throw new Error(result.error.message);
          text = result.data.text || "";
        } catch (err: any) {
          console.warn("[Parser] MarkdownParser failed, using raw text fallback:", err.message);
          text = buffer.toString("utf8");
        }
      } else if ([".csv", ".tsv", ".json", ".xml"].includes(ext)) {
        text = buffer.toString("utf8");
      } else if (ext === ".pdf") {
        try {
          const result = await new PDFParser().parse({ data: buffer, filename: fileName });
          if (result.ok === false) throw new Error(result.error.message);
          text = result.data.text || "";
        } catch (err: any) {
          console.warn("[Parser] PDFParser failed, using strings fallback:", err.message);
          text = extractPrintableStrings(buffer);
        }
      } else if (ext === ".docx") {
        try {
          const result = await new DOCXParser().parse({ data: buffer, filename: fileName });
          if (result.ok === false) throw new Error(result.error.message);
          text = result.data.text || "";
        } catch (err: any) {
          console.warn("[Parser] DOCXParser failed, using strings fallback:", err.message);
          text = extractPrintableStrings(buffer);
        }
      } else if ([".xlsx", ".xls"].includes(ext)) {
        try {
          const xlsx = await import("xlsx");
          const workbook = xlsx.read(buffer, { type: "buffer" });
          let csvs: string[] = [];
          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            csvs.push(xlsx.utils.sheet_to_csv(sheet));
          });
          text = csvs.join("\n\n");
        } catch (err: any) {
          console.warn("[Parser] xlsx failed, using strings fallback:", err.message);
          text = extractPrintableStrings(buffer);
        }
      } else if ([".png", ".jpg", ".jpeg"].includes(ext)) {
        const candidates = getCandidates();
        if (candidates.length === 0) {
          res.status(426).json({ requireFrontendLLM: true, systemPrompt: "", userPrompt: "", taskType: "vision" });
          return;
        }
        const ocrPrompt = "You are an expert OCR and document analyzer. Transcribe all readable text from this image page of academic research or notes. Output only the clean transcribed text, maintaining structure, without any conversational preamble or comments.";
        try {
          const result = await completeWithFailover(
            {
              taskClass: mapTaskType("vision"),
              systemPrompt: ocrPrompt,
              userPrompt: "",
              segments: [{ label: "Image", text: "" }]
            },
            { candidates },
            defaultPolicy()
          );
          text = result.ok ? result.value.text : `[OCR Extraction Failed] The image file "${fileName}" could not be parsed automatically.`;
        } catch (err: any) {
          console.warn("[Parser] OCR failed via gateway:", err.message);
          text = `[OCR Extraction Failed] The image file "${fileName}" could not be parsed automatically.`;
        }
      } else if ([".mp3", ".wav", ".m4a"].includes(ext)) {
        const candidates = getCandidates();
        if (candidates.length === 0) {
          res.status(426).json({ requireFrontendLLM: true, systemPrompt: "", userPrompt: "", taskType: "audio" });
          return;
        }
        const audioPrompt = "Listen to this audio recording carefully and transcribe it completely. Output only the clean transcription.";
        try {
          const result = await completeWithFailover(
            {
              taskClass: mapTaskType("audio"),
              systemPrompt: audioPrompt,
              userPrompt: "",
              segments: [{ label: "Audio", text: "" }]
            },
            { candidates },
            defaultPolicy()
          );
          text = result.ok ? result.value.text : `[Audio Transcription Failed] The audio file "${fileName}" could not be parsed automatically.`;
        } catch (err: any) {
          console.warn("[Parser] Audio transcription failed via gateway:", err.message);
          text = `[Audio Transcription Failed] The audio file "${fileName}" could not be parsed automatically.`;
        }
      } else {
        text = extractPrintableStrings(buffer);
      }

      // Stage 7 (target-workflow.md) sample-document structure learning: a
      // real, deterministic heading-detection pass over the already-extracted
      // text — never AI-inferred, never a fabricated structure. Only applied
      // to real prose formats (txt/md/pdf/docx); citation-import formats
      // (.bib/.ris) and tabular/data formats have no "section structure" to
      // detect.
      const headings = [".txt", ".md", ".markdown", ".pdf", ".docx"].includes(ext) ? detectHeadings(text) : [];

      return res.json({
        text: text.slice(0, 80000), // Protect local storage by truncating to 80k characters
        headings,
        metadata: {
          fileName,
          fileSize: buffer.length,
          extension: ext,
          charCount: text.length
        },
        ...(references ? { references, importWarnings } : {})
      });
    } catch (err: any) {
      console.error("File parser error:", err);
      res.status(500).json({ error: err.message || "Failed to parse document" });
    }
  });

  // External link content parser (accepts URL, fetches and extracts text / online PDF)
  app.post("/api/parse-external-link", parseExternalLinkLimit, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      let text = "";

      if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        text = result.text || "";
      } else {
        const html = await response.text();
        text = html
          .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
          .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      if (!text || text.length < 50) {
        throw new Error("Could not extract meaningful text from the website link.");
      }

      const domain = new URL(url).hostname;
      const pageTitle = `Web Source: ${domain}`;

      return res.json({
        text: text.slice(0, 80000),
        metadata: {
          fileName: pageTitle,
          fileSize: text.length,
          extension: ".url",
          charCount: text.length
        }
      });
    } catch (err: any) {
      console.error("External link parser error:", err);
      res.status(500).json({ error: err.message || "Failed to parse website link" });
    }
  });

  // DOI bibliographic lookup (CrossRef)
  app.post("/api/lookup-doi", lookupDoiLimit, async (req, res) => {
    try {
      const { doi } = req.body;
      if (!doi) {
        return res.status(400).json({ error: "DOI is required" });
      }

      const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, "");
      const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`);
      if (!response.ok) {
        throw new Error(`DOI not found on CrossRef registry.`);
      }

      const resData: any = await response.json();
      const item = resData.message;

      if (!item) {
        throw new Error("Invalid response structure from CrossRef API");
      }

      const title = Array.isArray(item.title) ? item.title[0] : item.title || "Unknown Research Title";
      const authorsList = (item.author || []).map((a: any) => `${a.given || ""} ${a.family || ""}`.trim());
      const author = authorsList.length > 0 ? authorsList.join(", ") : "Academic Researcher";
      const journal = Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"] || "CrossRef Registered Publication";
      const volume = item.volume || "";
      const issue = item.issue || "";
      const yearVal = item.published?.["date-parts"]?.[0]?.[0]?.toString() || new Date().getFullYear().toString();
      const urlVal = item.URL || `https://doi.org/${cleanDoi}`;

      const textRepresentation = `
Title: ${title}
Author(s): ${author}
Journal/Publisher: ${journal}
Volume/Issue: Vol. ${volume}, Issue ${issue}
Year: ${yearVal}
DOI: ${cleanDoi}
URL: ${urlVal}
Abstract: ${item.abstract || "Abstract not provided in CrossRef registry metadata. Source registered for academic referencing."}
      `.trim();

      return res.json({
        text: textRepresentation,
        metadata: {
          title,
          author,
          year: yearVal,
          institutionOrJournal: journal,
          volumeIssue: volume && issue ? `Vol. ${volume}, No. ${issue}` : "Academic Article",
          doiOrUrl: urlVal,
          citationTag: authorsList.length > 0 ? `${authorsList[0].split(" ").pop()} (${yearVal})` : `CrossRef (${yearVal})`,
          bibtex: `@article{doi_${cleanDoi.replace(/[^a-zA-Z0-9]/g, "")},\n  author = {${author}},\n  title = {${title}},\n  journal = {${journal}},\n  year = {${yearVal}},\n  doi = {${cleanDoi}}\n}`
        }
      });
    } catch (err: any) {
      console.error("DOI lookup error:", err);
      res.status(500).json({ error: err.message || "Failed to lookup DOI metadata" });
    }
  });
}
