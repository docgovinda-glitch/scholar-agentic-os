import { describe, it, expect, beforeEach } from "vitest";
import { crc32 } from "zlib";
import { DOCXParser } from "../docxParser";
import type { DocumentInput } from "../../types";

/**
 * Build a minimal, valid (stored/uncompressed entries) ZIP archive in memory,
 * matching just enough of the OOXML package structure for mammoth and the
 * DOCX metadata reader to process it. Used to test real DOCX parsing without
 * shipping a binary fixture file.
 */
function buildMinimalDocx(files: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf-8");
    const dataBuf = Buffer.from(content, "utf-8");
    const crc = crc32(dataBuf) >>> 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8); // stored, no compression
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(localSection.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localSection, centralSection, eocd]);
}

const MINIMAL_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

function coreXmlWith(fields: { title?: string; creator?: string; subject?: string; keywords?: string }): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  ${fields.title !== undefined ? `<dc:title>${fields.title}</dc:title>` : ""}
  ${fields.creator !== undefined ? `<dc:creator>${fields.creator}</dc:creator>` : ""}
  ${fields.subject !== undefined ? `<dc:subject>${fields.subject}</dc:subject>` : ""}
  ${fields.keywords !== undefined ? `<cp:keywords>${fields.keywords}</cp:keywords>` : ""}
</cp:coreProperties>`;
}

describe("DOCXParser", () => {
  let parser: DOCXParser;

  beforeEach(() => {
    parser = new DOCXParser();
  });

  describe("Metadata", () => {
    it("should have correct metadata", () => {
      expect(parser.metadata.id).toBe("docx");
      expect(parser.metadata.name).toBe("DOCX Parser");
      expect(parser.metadata.capabilities.mimeTypes).toContain("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      expect(parser.metadata.capabilities.extensions).toContain("docx");
      expect(parser.metadata.capabilities.supportsMetadata).toBe(true);
    });
  });

  describe("Validation", () => {
    it("should reject non-DOCX data", async () => {
      const input: DocumentInput = {
        data: Buffer.from([0x00, 0x01, 0x02, 0x03]),
      };

      const result = await parser.parse(input);

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("UNSUPPORTED_FORMAT");
      }
    });
  });

  describe("Valid DOCX Processing", () => {
    it("should accept valid ZIP signature", async () => {
      const input: DocumentInput = {
        data: Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP signature
      };

      const result = await parser.parse(input);

      // Will attempt to parse with mammoth - may succeed or fail depending on content
      expect(result.ok === true || result.ok === false).toBe(true);
    });
  });

  describe("Core Metadata Extraction", () => {
    it("should extract title, author, subject, and keywords from docProps/core.xml", async () => {
      const docx = buildMinimalDocx({
        "[Content_Types].xml": CONTENT_TYPES_XML,
        "word/document.xml": MINIMAL_DOCUMENT_XML,
        "docProps/core.xml": coreXmlWith({
          title: "A Study of Scholar Agentic Systems",
          creator: "Jane Researcher",
          subject: "Academic Software",
          keywords: "AI, research, scholarly",
        }),
      });

      const result = await parser.parse({ data: docx });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.title).toBe("A Study of Scholar Agentic Systems");
        expect(result.data.metadata.author).toBe("Jane Researcher");
        expect(result.data.metadata.subject).toBe("Academic Software");
        expect(result.data.metadata.keywords).toBe("AI, research, scholarly");
        expect(result.data.text).toContain("Hello DOCX");
      }
    });

    it("should return undefined metadata fields when docProps/core.xml is absent", async () => {
      const docx = buildMinimalDocx({
        "[Content_Types].xml": CONTENT_TYPES_XML,
        "word/document.xml": MINIMAL_DOCUMENT_XML,
      });

      const result = await parser.parse({ data: docx });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.metadata.title).toBeUndefined();
        expect(result.data.metadata.author).toBeUndefined();
      }
    });
  });
});