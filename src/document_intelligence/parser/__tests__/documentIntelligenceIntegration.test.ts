import { describe, it, expect, beforeEach } from "vitest";
import {
  parseDocument,
  parserRegistry,
  registerDefaultParsers,
  cleanHtmlToText,
  normalizeUnicodeNFC,
} from "../../index.ts";

describe("Document Intelligence Engine - Integration", () => {
  beforeEach(() => {
    registerDefaultParsers(parserRegistry);
  });

  describe("Lossless NFC Unicode Normalization", () => {
    it("preserves IAST Sanskrit transliteration diacritics losslessly", () => {
      // Decomposed vs precomposed characters
      const rawIAST = "S\u0061\u0304\u1e43sk\u1e5bta Mah\u0101bh\u0101rata \u015a\u1e63\u1e47";
      const normalized = normalizeUnicodeNFC(rawIAST);

      expect(normalized).toBe("Sāṃskṛta Mahābhārata Śṣṇ");
      expect(normalized.normalize("NFC")).toBe(normalized);
    });

    it("normalizes text and paragraphs during document parsing", async () => {
      const iastSample = "Chapter 1: Patañjali Yogasūtra — Samādhi Pāda (ā, ī, ū, ṛ, ś, ṣ, ṇ)";
      const input = {
        data: Buffer.from(iastSample, "utf-8"),
        filename: "test_iast.txt",
        mimeType: "text/plain",
      };

      const result = await parseDocument(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.text).toContain("Patañjali Yogasūtra");
        expect(result.data.text).toContain("ā, ī, ū, ṛ, ś, ṣ, ṇ");
      }
    });
  });

  describe("Multi-Format Parser Registry", () => {
    it("parses plain text documents via registered TXTParser", async () => {
      const input = {
        data: Buffer.from("Research methodology and empirical evaluation.\n\nSection 1.", "utf-8"),
        filename: "methodology.txt",
        mimeType: "text/plain",
      };

      const result = await parseDocument(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.text).toContain("Research methodology");
      }
    });

    it("parses markdown documents with outline and front-matter support", async () => {
      const mdContent = `# Research Proposal\n\n## Abstract\n\nEmpirical investigation into neural retrieval.`;
      const input = {
        data: Buffer.from(mdContent, "utf-8"),
        filename: "proposal.md",
        mimeType: "text/markdown",
      };

      const result = await parseDocument(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.text).toContain("Research Proposal");
        expect(result.data.text).toContain("Abstract");
      }
    });

    it("falls back gracefully to readable text on unsupported format", async () => {
      const customContent = "Custom delimited experimental log: 2026-10-23 passed";
      const input = {
        data: Buffer.from(customContent, "utf-8"),
        filename: "experiment.customext",
        mimeType: "application/octet-stream",
      };

      const result = await parseDocument(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.text).toContain("Custom delimited experimental log");
      }
    });
  });

  describe("HTML & URL Cleaning", () => {
    it("extracts clean title and readable text from raw web articles", () => {
      const rawHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Nature: Quantum Coherence Study</title></head>
          <body>
            <script>console.log("drop me");</script>
            <style>body { color: red; }</style>
            <h1>Quantum Coherence</h1>
            <p>Empirical evidence demonstrates high-fidelity qubits.</p>
          </body>
        </html>
      `;

      const cleaned = cleanHtmlToText(rawHtml);
      expect(cleaned.title).toBe("Nature: Quantum Coherence Study");
      expect(cleaned.text).toContain("Quantum Coherence");
      expect(cleaned.text).toContain("Empirical evidence demonstrates high-fidelity qubits");
      expect(cleaned.text).not.toContain("console.log");
      expect(cleaned.text).not.toContain("body { color: red; }");
    });
  });
});
