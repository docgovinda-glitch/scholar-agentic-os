import express from "express";
import path from "path";
import {
  parseFileLimit,
  parseExternalLinkLimit,
  lookupDoiLimit,
} from "../middleware/authRateLimiter.js";
import { extractPrintableStrings } from "../utils/parseUtils.js";

const router = express.Router();

// File Parser Endpoint (Accepts Base64 JSON Payload)
router.post("/api/parse-file", parseFileLimit, async (req, res) => {
  try {
    const { fileName, fileType, fileContent } = req.body;
    if (!fileName || !fileContent) {
      return res.status(400).json({ error: "Missing required parameters: fileName, fileContent" });
    }

    const buffer = Buffer.from(fileContent, "base64");
    let text = "";
    const ext = path.extname(fileName).toLowerCase();

    if ([".txt", ".ris", ".bib", ".csv", ".tsv", ".json", ".xml"].includes(ext)) {
      text = buffer.toString("utf8");
    } else if (ext === ".pdf") {
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        text = result.text || "";
      } catch (err: any) {
        console.warn("[Parser] pdf-parse failed, using strings fallback:", err.message);
        text = extractPrintableStrings(buffer);
      }
    } else if (ext === ".docx") {
      try {
        const mammoth = await import("mammoth");
        const data = await mammoth.extractRawText({ buffer });
        text = data.value || "";
      } catch (err: any) {
        console.warn("[Parser] mammoth failed, using strings fallback:", err.message);
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
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API key not configured on server");
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "You are an expert OCR and document analyzer. Transcribe all readable text from this image page of academic research or notes. Output only the clean transcribed text, maintaining structure, without any conversational preamble or comments." },
                {
                  inlineData: {
                    mimeType: fileType || `image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)}`,
                    data: fileContent
                  }
                }
              ]
            }]
          })
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data: any = await response.json();
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } catch (err: any) {
        console.warn("[Parser] Gemini OCR failed:", err.message);
        text = `[OCR Extraction Failed] The image file "${fileName}" could not be parsed automatically.`;
      }
    } else if ([".mp3", ".wav", ".m4a"].includes(ext)) {
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API key not configured on server");
        
        let mime = "audio/mp3";
        if (ext === ".wav") mime = "audio/wav";
        else if (ext === ".m4a") mime = "audio/m4a";

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Listen to this audio recording carefully and transcribe it completely. Output only the clean transcription." },
                {
                  inlineData: {
                    mimeType: mime,
                    data: fileContent
                  }
                }
              ]
            }]
          })
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data: any = await response.json();
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } catch (err: any) {
        console.warn("[Parser] Gemini Audio transcription failed:", err.message);
        text = `[Audio Transcription Failed] The audio file "${fileName}" could not be parsed automatically.`;
      }
    } else {
      text = extractPrintableStrings(buffer);
    }

    return res.json({
      text: text.slice(0, 80000), // Protect local storage by truncating to 80k characters
      metadata: {
        fileName,
        fileSize: buffer.length,
        extension: ext,
        charCount: text.length
      }
    });
  } catch (err: any) {
    console.error("File parser error:", err);
    res.status(500).json({ error: err.message || "Failed to parse document" });
  }
});

// External link content parser (accepts URL, fetches and extracts text / online PDF)
router.post("/api/parse-external-link", parseExternalLinkLimit, async (req, res) => {
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
router.post("/api/lookup-doi", lookupDoiLimit, async (req, res) => {
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

export default router;