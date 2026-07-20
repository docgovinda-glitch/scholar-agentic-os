import { describe, it, expect, beforeEach } from "vitest";
import { FormatIdentifier, DocumentFormat } from "../formatIdentifier";

describe("FormatIdentifier", () => {
  let identifier: FormatIdentifier;

  beforeEach(() => {
    identifier = FormatIdentifier.getInstance();
  });

  describe("Signature Detection", () => {
    it("should detect PDF from magic bytes", () => {
      const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x20]); // %PDF
      const result = identifier.identify(pdfData);

      expect(result.resolvedFormat).toBe("pdf");
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.detections[0].method).toBe("signature");
    });

    it("should detect DOCX from ZIP signature", () => {
      const docxData = new Uint8Array([0x50, 0x4B, 0x03, 0x04]); // PK..
      const result = identifier.identify(docxData);

      // DOCX and EPUB share same signature - should prefer DOCX by default or detect one
      expect(["docx", "epub"]).toContain(result.resolvedFormat);
    });

    it("should return unknown for unrecognized signature", () => {
      const unknownData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const result = identifier.identify(unknownData);

      expect(result.resolvedFormat).toBe("unknown");
    });
  });

  describe("MIME Type Detection", () => {
    it("should detect PDF from MIME type", () => {
      const result = identifier.identify(new Uint8Array(10), "application/pdf");

      expect(result.resolvedFormat).toBe("pdf");
      expect(result.confidence).toBe(0.9);
    });

    it("should detect DOCX from MIME type", () => {
      const result = identifier.identify(new Uint8Array(10), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

      expect(result.resolvedFormat).toBe("docx");
      expect(result.confidence).toBe(0.95);
    });

    it("should detect markdown from MIME type", () => {
      const result = identifier.identify(new Uint8Array(10), "text/markdown");

      expect(result.resolvedFormat).toBe("markdown");
    });

    it("should return unknown for unrecognized MIME type", () => {
      const result = identifier.identify(new Uint8Array(10), "application/unknown");

      // Unknown detections are intentionally omitted from `detections` (only positive
      // matches are recorded); unresolved format is instead signaled via `resolvedFormat`.
      expect(result.resolvedFormat).toBe("unknown");
    });
  });

  describe("Extension Detection", () => {
    it("should detect format from extension", () => {
      const result = identifier.identify(new Uint8Array(10), undefined, "pdf");

      expect(result.resolvedFormat).toBe("pdf");
    });

    it("should detect markdown from .md extension", () => {
      const result = identifier.identify(new Uint8Array(10), undefined, "md");

      expect(result.resolvedFormat).toBe("markdown");
    });

    it("should detect latex from .tex extension", () => {
      const result = identifier.identify(new Uint8Array(10), undefined, "tex");

      expect(result.resolvedFormat).toBe("latex");
    });
  });

  describe("Conflict Resolution", () => {
    it("should prefer signature over MIME type and extension", () => {
      const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      const result = identifier.identify(pdfData, "text/plain", "docx");

      expect(result.resolvedFormat).toBe("pdf");
      expect(result.detections.some(d => d.method === "signature")).toBe(true);
    });

    it("should boost confidence when multiple methods agree", () => {
      const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      const result = identifier.identify(pdfData, "application/pdf", "pdf");

      // Signature + MIME + extension should boost confidence
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.detections.length).toBe(3);
    });

    it("should prefer MIME type over extension", () => {
      // When no signature matches, MIME should win over extension
      const data = new Uint8Array([0x00, 0x00, 0x00]);
      const result = identifier.identify(data, "text/markdown", "html");

      expect(result.resolvedFormat).toBe("markdown");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty data", () => {
      const result = identifier.identify(new Uint8Array(0), "text/plain", "txt");

      expect(result.resolvedFormat).toBe("txt"); // Extension should match
    });

    it("should handle short data gracefully", () => {
      const shortData = new Uint8Array([0x25]); // Too short for PDF signature
      const result = identifier.identify(shortData, "application/pdf");

      expect(result.resolvedFormat).toBe("pdf"); // MIME type should work
    });

    it("should handle unknown format scenario", () => {
      const result = identifier.identify(
        new Uint8Array(10),
        "application/unknown",
        "xyz"
      );

      expect(result.resolvedFormat).toBe("unknown");
      expect(result.confidence).toBe(0);
    });

    it("should detect ris format", () => {
      const result = identifier.identify(new Uint8Array(10), undefined, "ris");
      expect(result.resolvedFormat).toBe("ris");
    });

    it("should detect bibtex format", () => {
      const result = identifier.identify(new Uint8Array(10), undefined, "bib");
      expect(result.resolvedFormat).toBe("bibtex");
    });
  });
});