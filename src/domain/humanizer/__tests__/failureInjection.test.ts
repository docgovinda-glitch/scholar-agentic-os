import { describe, it, expect, vi } from "vitest";
import { runHumanizerPipeline } from "../orchestration/humanizerPipeline";
import {
  savePersistentTerminology,
  loadPersistentTerminology,
  createTerminologyEntry,
} from "../memory/terminologyMemoryService";

describe("Phase 10: Failure-Injection & Isolated Fallback Hardening", () => {
  const SOURCE = "The cow provides dairy nutrition (Wilson et al., 2022). It supports rural agriculture.";

  describe("1. Provider Failure Modes", () => {
    it("safely handles provider network timeout and preserves original text", async () => {
      const failingCompleter = vi.fn().mockRejectedValue(new Error("Network timeout after 30000ms"));

      const result = await runHumanizerPipeline(SOURCE, {
        mode: "balanced",
        completer: failingCompleter,
        maxRetries: 1,
      });

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.finalText).toBe(SOURCE);
    });

    it("safely handles HTTP 429 rate limits without corrupting document state", async () => {
      const rateLimitedCompleter = vi
        .fn()
        .mockRejectedValue(new Error("429 RESOURCE_EXHAUSTED: Rate limit reached"));

      const result = await runHumanizerPipeline(SOURCE, {
        mode: "balanced",
        completer: rateLimitedCompleter,
        maxRetries: 1,
      });

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.finalText).toBe(SOURCE);
    });

    it("handles malformed non-JSON provider output via prose extractor or safe retry", async () => {
      const malformedCompleter = vi.fn().mockResolvedValue(
        "Here is the humanized draft without any JSON wrapping: Cows provide essential dairy nourishment (Wilson et al., 2022)."
      );

      const result = await runHumanizerPipeline(SOURCE, {
        mode: "conservative",
        completer: malformedCompleter,
        maxRetries: 1,
      });

      // Should either successfully extract prose with citation or safely fallback to original
      expect(result.finalText).toContain("(Wilson et al., 2022)");
    });

    it("detects mutated or corrupted protected token and rejects unsafe candidate", async () => {
      const corruptingCompleter = vi.fn().mockResolvedValue(
        JSON.stringify({
          rewrittenText: "Cows provide nourishment ⟦PROTECTED_CITATION_APA_MUTATED_HASH⟧.",
          improvements: [],
        })
      );

      const result = await runHumanizerPipeline(SOURCE, {
        mode: "balanced",
        completer: corruptingCompleter,
        maxRetries: 1,
      });

      // Corruption must be rejected and original text safely preserved
      expect(result.fallbackUsed).toBe(true);
      expect(result.finalText).toBe(SOURCE);
      expect(result.finalText).not.toContain("MUTATED_HASH");
    });
  });

  describe("2. Persistence Failure Resilience", () => {
    it("handles localStorage unavailability gracefully without throwing", () => {
      const entry = createTerminologyEntry({
        term: "Rajadharma",
        scope: "PROJECT",
      });

      // Should not throw even when localStorage is unavailable or throws
      expect(() => savePersistentTerminology(entry, "proj-123")).not.toThrow();
      expect(() => loadPersistentTerminology("PROJECT", "proj-123")).not.toThrow();
    });
  });
});
