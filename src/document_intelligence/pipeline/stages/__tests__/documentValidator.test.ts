import { describe, it, expect, beforeEach } from "vitest";
import { DocumentValidator, ValidationStatus } from "../documentValidator";
import type { DocumentFormat } from "../formatIdentifier";

describe("DocumentValidator", () => {
  let validator: DocumentValidator;

  beforeEach(() => {
    validator = DocumentValidator.getInstance({
      maxSizeBytes: 1024 * 1024, // 1MB for tests
      allowedFormats: ["pdf", "docx", "txt", "markdown", "html", "rtf", "unknown"],
    });
  });

  describe("File Existence", () => {
    it("should mark empty document as invalid", async () => {
      const result = await validator.validate(new Uint8Array(0), "txt");

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("Document is empty or missing");
    });

    it("should mark valid document with content", async () => {
      const data = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]); // "hello"
      const result = await validator.validate(data, "txt");

      expect(result.status).toBe("valid");
    });
  });

  describe("File Size Validation", () => {
    it("should reject files exceeding size limit", async () => {
      const largeData = new Uint8Array(2 * 1024 * 1024); // 2MB
      const result = await validator.validate(largeData, "pdf");

      expect(result.status).toBe("invalid");
      expect(result.errors.some(e => e.includes("exceeds limit"))).toBe(true);
    });

    it("should accept files within size limit", async () => {
      const smallData = new TextEncoder().encode("a".repeat(100));
      const result = await validator.validate(smallData, "txt");

      expect(result.status).toBe("valid");
    });
  });

  describe("Format Validation", () => {
    it("should reject unknown format", async () => {
      // @ts-ignore - testing unknown format
      const result = await validator.validate(new Uint8Array(100), "unknown");

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("Unknown or unsupported document format");
    });

    it("should reject disallowed format", async () => {
      const data = new Uint8Array(100);
      // @ts-ignore - testing disallowed format
      const result = await validator.validate(data, "bibtex");

      expect(result.status).toBe("invalid");
      expect(result.errors.some(e => e.includes("not in allowed formats"))).toBe(true);
    });

    it("should accept allowed format", async () => {
      const data = new TextEncoder().encode("a".repeat(100));
      const result = await validator.validate(data, "txt");

      expect(result.status).toBe("valid");
    });
  });

  describe("PDF Validation", () => {
    it("should detect valid PDF", async () => {
      const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      const result = await validator.validate(pdfData, "pdf");

      expect(result.status).toBe("valid");
    });

    it("should detect corrupted PDF (wrong header)", async () => {
      const badPdf = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      const result = await validator.validate(badPdf, "pdf");

      expect(result.status).toBe("warning");
      expect(result.warnings).toContain("Document may be corrupted or truncated");
    });

    it("should detect encrypted PDF", async () => {
      const encryptedPdf = new TextEncoder().encode("%PDF-1.4\n/Encrypt");
      const result = await validator.validate(encryptedPdf, "pdf");

      expect(result.status).toBe("invalid");
      expect(result.errors).toContain("Document appears to be password-protected or encrypted");
    });
  });

  describe("MIME Consistency", () => {
    it("should warn on MIME/format mismatch", async () => {
      const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const result = await validator.validate(data, "pdf", "document.txt", "text/plain");

      expect(result.warnings.some(w => w.includes("MIME type"))).toBe(true);
    });

    it("should pass on consistent MIME type", async () => {
      const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const result = await validator.validate(data, "pdf", "document.pdf", "application/pdf");

      expect(result.status).toBe("valid");
    });
  });

  describe("Fingerprint Generation", () => {
    it("should generate consistent fingerprint", async () => {
      const data = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
      const result1 = await validator.validate(data, "txt");
      const result2 = await validator.validate(data, "txt");

      expect(result1.fingerprint).toBe(result2.fingerprint);
      expect(result1.fingerprint.length).toBe(64); // SHA-256 hex length
    });

    it("should generate different fingerprints for different content", async () => {
      const data1 = new TextEncoder().encode("hello");
      const data2 = new TextEncoder().encode("world");
      const result1 = await validator.validate(data1, "txt");
      const result2 = await validator.validate(data2, "txt");

      expect(result1.fingerprint).not.toBe(result2.fingerprint);
    });
  });

  describe("Metadata", () => {
    it("should include validation metadata", async () => {
      const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      const result = await validator.validate(data, "pdf", "test.pdf", "application/pdf");

      expect(result.metadata.fileSize).toBe(4);
      expect(result.metadata.detectedFormat).toBe("pdf");
      expect(result.metadata.mimeType).toBe("application/pdf");
      expect(result.metadata.filename).toBe("test.pdf");
      expect(result.metadata.sizeLimit).toBe(1024 * 1024);
      expect(result.metadata.isEncrypted).toBe(false);
      expect(result.metadata.consistencyCheck).toBe(true);
    });
  });
});