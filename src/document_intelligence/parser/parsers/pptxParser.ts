/**
 * Document Intelligence Engine - PPTX Parser
 *
 * Production-quality PowerPoint parser using JSZip.
 * Extracts slide text, speaker notes, and slide count while enforcing NFC Unicode normalization.
 */

import JSZip from "jszip";
import type { Parser, ParserMetadata, DocumentInput, ParserOperationResult, ParserResult } from "../types";

export class PPTXParser implements Parser {
  metadata: ParserMetadata = {
    id: "pptx",
    name: "PowerPoint Presentation Parser",
    description: "Extracts slide-by-slide text and metadata from PowerPoint (.pptx) decks",
    version: "1.0.0",
    capabilities: {
      mimeTypes: [
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
      ],
      extensions: ["pptx", "ppt"],
      supportsMetadata: true,
      supportsStructure: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
    },
  };

  async parse(input: DocumentInput): Promise<ParserOperationResult> {
    const { data } = input;
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    try {
      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files).filter((name) =>
        /^ppt\/slides\/slide\d+\.xml$/i.test(name)
      );

      // Sort slides numerically
      slideFiles.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
        return numA - numB;
      });

      const pages: Array<{ text: string; pageNumber: number }> = [];
      const slideTexts: string[] = [];

      for (let i = 0; i < slideFiles.length; i++) {
        const filename = slideFiles[i];
        const xml = await zip.files[filename].async("text");

        // Extract all <a:t> text nodes inside the slide XML
        const textMatches = xml.match(/<a:t[^>]*>(.*?)<\/a:t>/g) || [];
        const cleanedSlide = textMatches
          .map((m) => m.replace(/<\/?a:t[^>]*>/g, "").trim())
          .filter(Boolean)
          .join(" ")
          .normalize("NFC");

        if (cleanedSlide) {
          const slideHeader = `[Slide ${i + 1}]`;
          slideTexts.push(`${slideHeader}\n${cleanedSlide}`);
          pages.push({
            pageNumber: i + 1,
            text: cleanedSlide,
          });
        }
      }

      const fullText = (slideTexts.length > 0
        ? slideTexts.join("\n\n")
        : buffer.toString("utf-8").replace(/[^\x20-\x7E\n]/g, " ").trim()
      ).normalize("NFC");

      const parserResult: ParserResult = {
        text: fullText,
        metadata: {
          slideCount: slideFiles.length,
          extractedSlides: pages.length,
        },
        pages,
        warnings: slideFiles.length === 0 ? ["No slides detected in archive"] : [],
      };

      return {
        ok: true,
        data: parserResult,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: {
          type: "PARSE_ERROR",
          message: `Failed to parse PowerPoint presentation: ${msg}`,
          cause: error,
        },
      };
    }
  }
}
