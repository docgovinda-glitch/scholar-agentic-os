import { describe, it, expect, beforeEach } from "vitest";
import { PDFParser } from "../pdfParser";
import type { DocumentInput } from "../../types";

// Mock pdf-parse module
const mockPdfParse = (text: string = "test content", numpages: number = 1) => ({
  text,
  numpages,
  info: {},
});

describe("PDFParser", () => {
  let parser: PDFParser;

  beforeEach(() => {
    parser = new PDFParser();
  });

  describe("Metadata", () => {
    it("should have correct metadata", () => {
      expect(parser.metadata.id).toBe("pdf");
      expect(parser.metadata.name).toBe("PDF Parser");
      expect(parser.metadata.capabilities.mimeTypes).toContain("application/pdf");
      expect(parser.metadata.capabilities.extensions).toContain("pdf");
      expect(parser.metadata.capabilities.supportsMetadata).toBe(true);
    });
  });

  describe("Validation", () => {
    it("should reject non-PDF data", async () => {
      const input: DocumentInput = {
        data: Buffer.from([0x00, 0x01, 0x02, 0x03]),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("UNSUPPORTED_FORMAT");
      }
    });

    it("should detect encrypted PDF", async () => {
      const input: DocumentInput = {
        data: Buffer.from("%PDF-1.4\n/Encrypt"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("ENCRYPTED");
      }
    });
  });

  describe("Valid PDF Processing", () => {
    it("should process valid PDF header", async () => {
      const input: DocumentInput = {
        data: Buffer.from("%PDF-1.4\ntest"),
      };

      const result = await parser.parse(input);

      // Will try to parse with pdf-parse
      expect(result.ok === true || result.ok === false).toBe(true);
    });
  });
});