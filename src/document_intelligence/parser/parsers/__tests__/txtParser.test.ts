import { describe, it, expect, beforeEach } from "vitest";
import { TXTParser } from "../txtParser";
import type { DocumentInput } from "../../types";

describe("TXTParser", () => {
  let parser: TXTParser;

  beforeEach(() => {
    parser = new TXTParser();
  });

  describe("Metadata", () => {
    it("should have correct metadata", () => {
      expect(parser.metadata.id).toBe("txt");
      expect(parser.metadata.name).toBe("TXT Parser");
      expect(parser.metadata.capabilities.mimeTypes).toContain("text/plain");
      expect(parser.metadata.capabilities.extensions).toContain("txt");
      expect(parser.metadata.capabilities.supportsMetadata).toBe(true);
    });
  });

  describe("Encoding Detection", () => {
    it("should detect UTF-8 encoding", async () => {
      const input: DocumentInput = {
        data: Buffer.from("Hello World"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.text).toBe("Hello World");
        expect(result.data.metadata.encoding).toBe("ascii"); // ASCII is subset of UTF-8
      }
    });

    it("should detect UTF-8 BOM", async () => {
      const input: DocumentInput = {
        data: Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("Hello")]), // UTF-8 BOM + text
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.text).toBe("Hello");
        expect(result.data.metadata.encoding).toBe("utf-8");
      }
    });
  });

  describe("Line Ending Normalization", () => {
    it("should normalize CRLF to LF", async () => {
      const input: DocumentInput = {
        data: Buffer.from("Line 1\r\nLine 2\r\nLine 3"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.text).toBe("Line 1\nLine 2\nLine 3");
      }
    });

    it("should normalize CR to LF", async () => {
      const input: DocumentInput = {
        data: Buffer.from("Line 1\rLine 2\rLine 3"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.text).toBe("Line 1\nLine 2\nLine 3");
      }
    });
  });

  describe("Metadata Extraction", () => {
    it("should extract line count", async () => {
      const input: DocumentInput = {
        data: Buffer.from("Line 1\nLine 2\nLine 3"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.lineCount).toBe(3);
      }
    });

    it("should extract word count", async () => {
      const input: DocumentInput = {
        data: Buffer.from("One two three four five"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.wordCount).toBe(5);
      }
    });
  });

  describe("Page Estimation", () => {
    it("should estimate pages", async () => {
      const longText = "Word ".repeat(1000); // ~5000 characters
      const input: DocumentInput = {
        data: Buffer.from(longText),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.pages.length).toBeGreaterThanOrEqual(1);
        expect(result.data.pages[0].pageNumber).toBe(1);
      }
    });
  });
});