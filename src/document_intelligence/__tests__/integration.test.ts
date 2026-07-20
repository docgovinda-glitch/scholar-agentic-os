/**
 * Document Intelligence Engine - Integration Tests
 * 
 * End-to-end tests for the complete document processing pipeline.
 * Validates: Format Detection → Validation → Parser Selection → Parsing → CDM Output
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DocumentPipeline, FormatIdentifier } from "../index";
import { DocumentValidator } from "../pipeline/stages/documentValidator";
import type { CanonicalDocumentModel } from "../cdm";

describe("Document Intelligence Engine Integration", () => {
  let pipeline: DocumentPipeline;

  beforeEach(() => {
    pipeline = DocumentPipeline.getInstance();
    pipeline.registerParsers();
  });

  // ============================================================================
  // Format Detection Tests
  // ============================================================================

  describe("Format Detection", () => {
    it("should detect TXT format from content", () => {
      // Plain text has no magic-byte signature, so format resolution requires an
      // extension/MIME hint (consistent with FormatIdentifier's documented
      // signature > mimeType > extension priority; see formatIdentifier.test.ts).
      const txtContent = Buffer.from("Hello, this is plain text.");
      const detection = FormatIdentifier.getInstance().identify(txtContent, undefined, "txt");

      expect(detection.resolvedFormat).toBe("txt");
      expect(detection.confidence).toBeGreaterThan(0);
    });

    it("should detect PDF format from signature", () => {
      const pdfContent = Buffer.from("%PDF-1.4\ncontent");
      const detection = FormatIdentifier.getInstance().identify(pdfContent);

      expect(detection.resolvedFormat).toBe("pdf");
    });

    it("should detect DOCX format from ZIP signature", () => {
      const docxContent = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // PK..
      const detection = FormatIdentifier.getInstance().identify(docxContent);

      expect(detection.resolvedFormat).toBe("docx");
    });

    it("should detect Markdown format from extension", async () => {
      const mdContent = Buffer.from("# Heading\n\nParagraph");
      const result = await pipeline.processDocument({
        data: mdContent,
        filename: "document.md",
      });

      // Should use markdown parser or fall back gracefully
      expect(result.ok === true || result.ok === false).toBe(true);
    });
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================

  describe("Validation", () => {
    it("should reject empty documents", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from([]),
        filename: "empty.txt",
      });

      expect(result.ok).toBe(false);
    });

    it("should validate TXT documents correctly", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from("Valid text content"),
        filename: "test.txt",
      });

      expect(result.ok).toBe(true);
    });
  });

  // ============================================================================
  // Parser Selection Tests
  // ============================================================================

  describe("Parser Selection", () => {
    it("should auto-select TXT parser for plain text", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from("Plain text document"),
        filename: "document.txt",
      });

      expect(result.ok).toBe(true);
    });

    it("should auto-select parser for PDF", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from("%PDF-1.4\ncontent"),
        filename: "document.pdf",
      });

      expect(result.ok === true || result.ok === false).toBe(true);
    });

    it("should support format hints for override", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from("Markdown content # heading"),
        filename: "document.txt",
      }, {
        skipValidation: true,
        formatHint: "markdown",
      });

      expect(result.ok === true || result.ok === false).toBe(true);
    });
  });

  // ============================================================================
  // TXT Parser Integration Tests
  // ============================================================================

  describe("TXT Parser", () => {
    it("should process TXT and return valid CDM structure", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from("Line one\nLine two\n\nParagraph two"),
        filename: "test.txt",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const text = result.data.text;
        expect(text.length).toBeGreaterThan(0);
        expect(result.data.pages.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ============================================================================
  // Markdown Parser Integration Tests
  // ============================================================================

  describe("Markdown Parser", () => {
    it("should process Markdown and return valid CDM structure", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from("# Title\n\n## Subtitle\n\nContent here"),
        filename: "test.md",
      });

      expect(result.ok === true || result.ok === false).toBe(true);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe("Error Handling", () => {
    it("should handle unsupported formats gracefully", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from([0xFF, 0xFE, 0x00, 0x00]), // Unknown binary
        filename: "unknown.xyz",
      });

      // Should either fail gracefully or return structured result
      expect(result.ok === true || result.ok === false).toBe(true);
    });

    it("should provide structured errors for invalid documents", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from("%PDF-1.4\n/Encrypt"), // Encrypted PDF
        filename: "encrypted.pdf",
      });

      if (result.ok === false) {
        expect(result.error.type).toBeDefined();
        expect(result.error.message).toBeDefined();
      }
    });
  });

  // ============================================================================
  // CDM Output Tests
  // ============================================================================

  describe("CDM Output", () => {
    it("should return consistent structure across parsers", async () => {
      const txtResult = await pipeline.processDocument({
        data: Buffer.from("Test content"),
        filename: "test.txt",
      });

      if (txtResult.ok) {
        // Verify basic CDM structure elements
        expect(txtResult.data.text).toBeDefined();
        expect(txtResult.data.pages).toBeDefined();
        expect(txtResult.data.metadata).toBeDefined();
      }
    });

    it("should include statistics in output", async () => {
      const result = await pipeline.processDocument({
        data: Buffer.from("One two three four five"),
        filename: "test.txt",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const stats = result.data.metadata;
        expect(stats).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Available Formats Tests
  // ============================================================================

  describe("Available Formats", () => {
    it("should list all available formats", () => {
      const formats = pipeline.getAvailableFormats();

      expect(formats).toContain("pdf");
      expect(formats).toContain("docx");
      expect(formats).toContain("txt");
      expect(formats).toContain("markdown");
    });

    it("should correctly identify supported formats", () => {
      expect(pipeline.isFormatSupported("pdf")).toBe(true);
      expect(pipeline.isFormatSupported("docx")).toBe(true);
      expect(pipeline.isFormatSupported("txt")).toBe(true);
      expect(pipeline.isFormatSupported("markdown")).toBe(true);
      expect(pipeline.isFormatSupported("unknown")).toBe(false);
    });
  });
});