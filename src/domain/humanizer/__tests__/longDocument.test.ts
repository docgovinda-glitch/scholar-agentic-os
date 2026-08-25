import { describe, it, expect, vi } from "vitest";
import { createHumanizerDocument } from "../document/humanizerDocument";
import { createDocumentChunks } from "../chunking/longDocumentChunker";
import { runLongDocumentPipeline } from "../orchestration/longDocumentPipeline";

describe("Phase 8: Hierarchical Long-Document Chunking & Resumable Pipeline", () => {
  const MULTI_SECTION_DOC = `# Chapter 1: Introduction
Cows are domesticated animals across South Asia (Wilson et al., 2022). They provide dairy nutrition.

Agriculture in rural regions depends on bovine manure. Empirical studies show $p < 0.001$ in trial yields [4].

# Chapter 2: Sustainable Farming
Forage nutrition improves yield efficiency. Organic farming reduces chemical dependence.

Biogas generation offers renewable energy in agrarian villages. Environmental benefits are substantial.`;

  describe("1. Hierarchical Long-Document Chunker", () => {
    it("partitions multi-section document into boundary-safe chunks with context", () => {
      const doc = createHumanizerDocument(MULTI_SECTION_DOC);
      const chunks = createDocumentChunks(doc, { maxBlocksPerChunk: 2 });

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].blockIds.length).toBeLessThanOrEqual(2);
      expect(chunks[0].status).toBe("PENDING");

      // Verify succeeding context is populated for chunk 0
      expect(chunks[0].contextSucceedingBlockIds.length).toBeGreaterThan(0);
    });
  });

  describe("2. Production Long-Document Pipeline Execution", () => {
    it("processes all document chunks and produces validated result with review units", async () => {
      const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
        const sourceText = sourceMatch ? sourceMatch[1] : userPrompt;

        return JSON.stringify({
          rewrittenText: `Scholarly revision: ${sourceText}`.trim(),
          improvements: ["Refined syntax"],
        });
      });

      const result = await runLongDocumentPipeline(MULTI_SECTION_DOC, {
        mode: "balanced",
        completer: mockCompleter,
        chunkingPolicy: { maxBlocksPerChunk: 3 },
      });

      expect(result.success).toBe(true);
      expect(result.chunks.length).toBeGreaterThanOrEqual(2);
      expect(result.progress.completedChunks).toBe(result.chunks.length);
      expect(result.finalValidationPassed).toBe(true);
      expect(result.reviewUnits.length).toBeGreaterThan(0);
    });

    it("isolates chunk failure and preserves original text for failed chunk while keeping safe chunks", async () => {
      let callCount = 0;
      const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt }: any) => {
        callCount++;
        const sourceMatch = userPrompt.match(/### SOURCE TEXT TO REWRITE\n"""\n([\s\S]*?)\n"""/);
        const sourceText = sourceMatch ? sourceMatch[1] : userPrompt;

        // Chunk 2 deliberately fails epistemic checks on all attempts
        if (callCount >= 2 && callCount <= 4) {
          return JSON.stringify({
            rewrittenText: "Evidence proves that compound X causes absolute cure.",
            improvements: [],
          });
        }

        return JSON.stringify({
          rewrittenText: `Valid academic prose: ${sourceText}`.trim(),
          improvements: ["Fluid prose"],
        });
      });

      const result = await runLongDocumentPipeline(MULTI_SECTION_DOC, {
        mode: "balanced",
        completer: mockCompleter,
        chunkingPolicy: { maxBlocksPerChunk: 2 },
        maxRetries: 1,
      });

      expect(result.fallbackChunksCount).toBeGreaterThan(0);
      const failedChunk = result.chunks.find((c) => c.status === "FAILED");
      expect(failedChunk).toBeDefined();
      expect(failedChunk?.fallbackUsed).toBe(true);
    });

    it("stops processing when cancellation signal is triggered", async () => {
      const abortController = new AbortController();
      let callCount = 0;

      const mockCompleter = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          abortController.abort(); // Cancel after chunk 1
        }
        return JSON.stringify({
          rewrittenText: "Rewritten text.",
          improvements: [],
        });
      });

      const result = await runLongDocumentPipeline(MULTI_SECTION_DOC, {
        mode: "balanced",
        completer: mockCompleter,
        chunkingPolicy: { maxBlocksPerChunk: 1 },
        abortSignal: abortController.signal,
      });

      expect(result.progress.isCancelled).toBe(true);
      const cancelledChunk = result.chunks.find((c) => c.status === "CANCELLED");
      expect(cancelledChunk).toBeDefined();
    });
  });
});
