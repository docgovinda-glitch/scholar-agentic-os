/**
 * Document Intelligence Engine - Markdown Parser
 * 
 * Production-quality Markdown parser.
 * Parses structure while preserving content.
 */

import type { Parser, ParserMetadata, DocumentInput, ParserOperationResult, ParserResult } from "../types";

// ============================================================================
// Markdown Types
// ============================================================================

/**
 * Markdown block types.
 */
export type MarkdownBlockType = "heading" | "paragraph" | "list" | "blockquote" | "code" | "table" | "thematic_break" | "unknown";

/**
 * Markdown block representation.
 */
export interface MarkdownBlock {
  type: MarkdownBlockType;
  level?: number; // For headings (1-6), lists (nesting)
  text: string;
  raw: string;
}

/**
 * Markdown link/image metadata.
 */
export interface MarkdownLink {
  text: string;
  url: string;
  type: "link" | "image";
}

/**
 * Generated document outline.
 */
export interface MarkdownOutline {
  heading: string;
  level: number;
  position: number;
}

// ============================================================================
// Markdown Parser
// ============================================================================

/**
 * Markdown document parser implementation.
 */
export class MarkdownParser implements Parser {
  metadata: ParserMetadata = {
    id: "markdown",
    name: "Markdown Parser",
    description: "Extracts and structures Markdown documents",
    version: "1.0.0",
    capabilities: {
      mimeTypes: ["text/markdown", "text/x-markdown"],
      extensions: ["md", "markdown"],
      supportsMetadata: true,
      supportsStructure: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB
    },
  };

  async parse(input: DocumentInput): Promise<ParserOperationResult> {
    const { data } = input;

    try {
      // Decode text
      const rawText = this.decodeText(data);

      // Extract YAML front matter (--- ... ---) if present, before block parsing
      const { frontMatter, body: text } = this.extractFrontMatter(rawText);

      // Parse blocks
      const blocks = this.parseBlocks(text);

      // Generate outline
      const outline = this.generateOutline(blocks);

      // Extract links/images
      const references = this.extractReferences(text);

      // Extract page-level text
      const pageText = this.extractText(text);
      const pages = this.estimatePages(pageText);

      // Extract metadata
      const metadata = this.extractMetadata(blocks, references, frontMatter);

      const parserResult: ParserResult = {
        text: pageText,
        metadata,
        pages,
        warnings: [],
      };

      return {
        ok: true,
        data: parserResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        ok: false,
        error: {
          type: "PARSE_ERROR",
          message: `Failed to parse Markdown: ${errorMessage}`,
          cause: error,
        },
      };
    }
  }

  /**
   * Decode text data.
   */
  private decodeText(data: Uint8Array | Buffer): string {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    try {
      return buffer.toString("utf-8");
    } catch {
      return buffer.toString("latin1");
    }
  }

  /**
   * Extract YAML front matter from the start of a Markdown document.
   * Front matter is a block delimited by `---` on its own line at the very
   * start of the file, containing simple `key: value` pairs (one per line).
   * Returns the parsed key/value map and the document body with the front
   * matter block removed. If no front matter is present, returns an empty
   * map and the original text unchanged.
   */
  private extractFrontMatter(text: string): { frontMatter: Record<string, string>; body: string } {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
      return { frontMatter: {}, body: text };
    }

    const frontMatter: Record<string, string> = {};
    const lines = match[1].split(/\r?\n/);
    for (const line of lines) {
      const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!kv) continue;
      const value = kv[2].trim().replace(/^["'](.*)["']$/, "$1");
      frontMatter[kv[1]] = value;
    }

    return { frontMatter, body: text.slice(match[0].length) };
  }

  /**
   * Parse text into markdown blocks.
   */
  private parseBlocks(text: string): MarkdownBlock[] {
    const blocks: MarkdownBlock[] = [];
    const lines = text.split(/\r?\n/);
    let currentBlock: MarkdownBlock | null = null;
    let inCodeFence = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Code fence - track open/close state so content between the fences
      // (including blank lines and lines that look like headings/lists) is
      // captured as a single code block rather than misparsed line-by-line.
      if (trimmed.startsWith("\`\`\`")) {
        if (!inCodeFence) {
          if (currentBlock) blocks.push(currentBlock);
          currentBlock = { type: "code", text: "", raw: line };
          inCodeFence = true;
        } else {
          if (currentBlock) blocks.push(currentBlock);
          currentBlock = null;
          inCodeFence = false;
        }
        continue;
      }

      if (inCodeFence) {
        if (currentBlock) {
          currentBlock.raw += (currentBlock.raw ? "\n" : "") + line;
          currentBlock.text = currentBlock.raw;
        }
        continue;
      }

      // Empty line - finalize current block
      if (trimmed.length === 0) {
        if (currentBlock && currentBlock.type !== "paragraph") {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        continue;
      }

      // Heading
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          type: "heading",
          level: headingMatch[1].length,
          text: headingMatch[2],
          raw: line,
        };
        blocks.push(currentBlock);
        currentBlock = null;
        continue;
      }

      // Blockquote
      if (trimmed.startsWith(">")) {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          type: "blockquote",
          text: trimmed.replace(/^>\s?/, ""),
          raw: line,
        };
        blocks.push(currentBlock);
        currentBlock = null;
        continue;
      }

      // List items
      if (/^[\*\+-]|\d+\./.test(trimmed)) {
        if (currentBlock && currentBlock.type === "list") {
          currentBlock.raw += "\n" + line;
          continue;
        }
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          type: "list",
          text: trimmed.replace(/^([\*\+-]|\d+\.)\s+/, ""),
          raw: line,
        };
        continue;
      }

      // Table detection (simple heuristic)
      if (trimmed.includes("|") && (trimmed.includes("---") || trimmed.includes("==="))) {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          type: "table",
          text: trimmed,
          raw: line,
        };
        blocks.push(currentBlock);
        currentBlock = null;
        continue;
      }

      // Paragraph
      if (!currentBlock) {
        currentBlock = {
          type: "paragraph",
          text: "",
          raw: "",
        };
      }
      currentBlock.raw += (currentBlock.raw ? "\n" : "") + line;
      currentBlock.text = currentBlock.raw;
    }

    if (currentBlock) {
      blocks.push(currentBlock);
    }

    return blocks;
  }

  /**
   * Generate document outline from headings.
   */
  private generateOutline(blocks: MarkdownBlock[]): MarkdownOutline[] {
    return blocks
      .filter((b) => b.type === "heading")
      .map((block, index) => ({
        heading: block.text,
        level: block.level || 1,
        position: index,
      }));
  }

  /**
   * Extract links and images from text.
   */
  private extractReferences(text: string): MarkdownLink[] {
    const references: MarkdownLink[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
    const imageRegex = /!\[([^\]]*)\]\(([^\)]+)\)/g;

    let match;
    while ((match = linkRegex.exec(text)) !== null) {
      references.push({ text: match[1], url: match[2], type: "link" });
    }

    while ((match = imageRegex.exec(text)) !== null) {
      references.push({ text: match[1] || "", url: match[2], type: "image" });
    }

    return references;
  }

  /**
   * Extract plain text (without markdown syntax).
   */
  private extractText(text: string): string {
    // Remove code block markers
    let result = text.replace(/\`\`\`[\s\S]*?\`\`\`/g, "");

    // Remove inline code
    result = result.replace(/\`[^\`]+\`/g, "");

    // Remove emphasis/strong markers
    result = result.replace(/[*_]{1,3}/g, "");

    // Remove links but keep text (keep images as alternative text)
    result = result.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
    result = result.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "$1");

    return result;
  }

  /**
   * Estimate pages based on content length.
   */
  private estimatePages(text: string): Array<{ text: string; pageNumber: number }> {
    const charsPerPage = 3000;
    const pages: Array<{ text: string; pageNumber: number }> = [];

    const paragraphs = text.split(/\n\n+/);
    let currentPageText = "";
    let pageCount = 1;

    for (const para of paragraphs) {
      if ((currentPageText.length + para.length) > charsPerPage && currentPageText.length > 0) {
        pages.push({ text: currentPageText.trim(), pageNumber: pageCount++ });
        currentPageText = para;
      } else {
        currentPageText += (currentPageText ? "\n\n" : "") + para;
      }
    }

    if (currentPageText.trim()) {
      pages.push({ text: currentPageText.trim(), pageNumber: pageCount });
    }

    if (pages.length === 0 && text) {
      pages.push({ text, pageNumber: 1 });
    }

    return pages;
  }

  /**
   * Extract metadata.
   */
  private extractMetadata(
    blocks: MarkdownBlock[],
    references: MarkdownLink[],
    frontMatter: Record<string, string> = {}
  ): Record<string, unknown> {
    const headings = blocks.filter((b) => b.type === "heading");
    const lists = blocks.filter((b) => b.type === "list");
    const codeBlocks = blocks.filter((b) => b.type === "code");

    return {
      title: frontMatter.title,
      author: frontMatter.author,
      date: frontMatter.date,
      tags: frontMatter.tags,
      blockCount: blocks.length,
      headingCount: headings.length,
      listCount: lists.length,
      codeBlockCount: codeBlocks.length,
      linkCount: references.filter((r) => r.type === "link").length,
      imageCount: references.filter((r) => r.type === "image").length,
      frontMatter,
      _references: references,
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export const createMarkdownParser = (): Parser => new MarkdownParser();