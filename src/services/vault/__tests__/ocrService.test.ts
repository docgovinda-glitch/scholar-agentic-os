import { describe, it, expect } from "vitest";
import {
  isOcrSupportedImage,
  extractFigureCaptions,
  inferTitleFromOcr,
  structureOcrText,
  performOcrOnImage,
} from "../ocrService";

describe("ocrService", () => {
  describe("isOcrSupportedImage", () => {
    it("recognizes standard image file formats", () => {
      expect(isOcrSupportedImage("figure1.png")).toBe(true);
      expect(isOcrSupportedImage("lab_note.jpg")).toBe(true);
      expect(isOcrSupportedImage("scan.JPEG")).toBe(true);
      expect(isOcrSupportedImage("microscopy.webp")).toBe(true);
      expect(isOcrSupportedImage("document.pdf")).toBe(false);
      expect(isOcrSupportedImage("paper.docx")).toBe(false);
    });
  });

  describe("extractFigureCaptions", () => {
    it("extracts Figure and Table captions correctly", () => {
      const sampleText = `
        Introduction
        Figure 1: Mean temperature variation across trial periods.
        Some explanatory text about results.
        Table 2: Statistical summary of variance.
        Equation (3): E = mc^2
      `;

      const captions = extractFigureCaptions(sampleText);
      expect(captions.length).toBe(3);
      expect(captions[0].type).toBe("figure");
      expect(captions[0].caption).toContain("Figure 1:");
      expect(captions[1].type).toBe("table");
      expect(captions[1].caption).toContain("Table 2:");
      expect(captions[2].type).toBe("equation");
      expect(captions[2].caption).toContain("Equation (3):");
    });
  });

  describe("inferTitleFromOcr", () => {
    it("extracts the top heading line as title if present", () => {
      const ocrText = "# Neural Network Interpretability in Genomics\n\nAbstract: We analyze deep learning features...";
      const title = inferTitleFromOcr(ocrText);
      expect(title).toBe("Neural Network Interpretability in Genomics");
    });

    it("falls back to formatted filename when text has no obvious header", () => {
      const title = inferTitleFromOcr("", "crispr_cas9_experiment_results.png");
      expect(title).toBe("crispr cas9 experiment results");
    });
  });

  describe("structureOcrText", () => {
    it("bolds detected headings and preserves paragraph breaks", () => {
      const rawText = "Abstract\n\nThis study investigates polymer degradation.\n\nResults\n\nDegradation rate increased by 25%.";
      const structured = structureOcrText(rawText);
      expect(structured).toContain("**Abstract**");
      expect(structured).toContain("**Results**");
      expect(structured).toContain("This study investigates polymer degradation.");
    });
  });

  describe("performOcrOnImage", () => {
    it("processes a blob in headless test environment and returns structured OcrResult", async () => {
      const mockBlob = new Blob(["mock image bytes"], { type: "image/png" });
      const result = await performOcrOnImage(mockBlob, { filename: "gel_electrophoresis.png" });

      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThan(80);
      expect(result.metadata.isScannedDocument).toBe(true);
      expect(result.title).toBeDefined();
    });
  });
});
