import { describe, it, expect, beforeEach } from "vitest";
import { MarkdownParser } from "../markdownParser";
import type { DocumentInput } from "../../types";

describe("MarkdownParser", () => {
  let parser: MarkdownParser;

  beforeEach(() => {
    parser = new MarkdownParser();
  });

  describe("Metadata", () => {
    it("should have correct metadata", () => {
      expect(parser.metadata.id).toBe("markdown");
      expect(parser.metadata.name).toBe("Markdown Parser");
      expect(parser.metadata.capabilities.mimeTypes).toContain("text/markdown");
      expect(parser.metadata.capabilities.extensions).toContain("md");
      expect(parser.metadata.capabilities.supportsMetadata).toBe(true);
    });
  });

  describe("Front Matter", () => {
    it("should parse YAML front matter into metadata", async () => {
      const input: DocumentInput = {
        data: Buffer.from(
          "---\ntitle: My Paper\nauthor: Jane Doe\ndate: 2026-01-01\n---\n\n# Body Heading\n\nContent."
        ),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.title).toBe("My Paper");
        expect(result.data.metadata.author).toBe("Jane Doe");
        expect(result.data.metadata.date).toBe("2026-01-01");
        expect(result.data.metadata.headingCount).toBe(1);
        // Front matter block itself should not appear in the extracted text.
        expect(result.data.text).not.toContain("title: My Paper");
      }
    });

    it("should handle quoted front matter values", async () => {
      const input: DocumentInput = {
        data: Buffer.from('---\ntitle: "Quoted Title"\n---\n\nBody'),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.title).toBe("Quoted Title");
      }
    });

    it("should leave documents without front matter unaffected", async () => {
      const input: DocumentInput = {
        data: Buffer.from("# No Front Matter\n\nJust content."),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.title).toBeUndefined();
        expect(result.data.text).toContain("No Front Matter");
      }
    });
  });

  describe("Heading Parsing", () => {
    it("should parse ATX headings", async () => {
      const input: DocumentInput = {
        data: Buffer.from("# Heading 1\n## Heading 2\n### Heading 3"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.headingCount).toBe(3);
      }
    });
  });

  describe("List Parsing", () => {
    it("should parse unordered lists", async () => {
      const input: DocumentInput = {
        data: Buffer.from("- Item 1\n- Item 2\n- Item 3"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.listCount).toBeGreaterThanOrEqual(1);
      }
    });

    it("should parse ordered lists", async () => {
      const input: DocumentInput = {
        data: Buffer.from("1. First\n2. Second\n3. Third"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.listCount).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("Blockquote Parsing", () => {
    it("should parse blockquotes", async () => {
      const input: DocumentInput = {
        data: Buffer.from("> This is a quote\n> Multiple lines"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
    });
  });

  describe("Code Block Parsing", () => {
    it("should parse fenced code blocks", async () => {
      const input: DocumentInput = {
        data: Buffer.from("```\ncode here\n```"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.codeBlockCount).toBe(1);
      }
    });
  });

  describe("Reference Extraction", () => {
    it("should extract links", async () => {
      const input: DocumentInput = {
        data: Buffer.from("[Link text](https://example.com)"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.linkCount).toBe(1);
      }
    });

    it("should extract images", async () => {
      const input: DocumentInput = {
        data: Buffer.from("![Alt text](image.png)"),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.imageCount).toBe(1);
      }
    });
  });

  describe("Page Estimation", () => {
    it("should estimate pages", async () => {
      const longMd = "Content\n\n".repeat(100); // Many paragraphs
      const input: DocumentInput = {
        data: Buffer.from(longMd),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.pages!.length).toBeGreaterThanOrEqual(1);
        expect(result.data.pages![0].pageNumber).toBe(1);
      }
    });
  });
});