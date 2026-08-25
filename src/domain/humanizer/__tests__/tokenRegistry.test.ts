import { describe, it, expect } from "vitest";
import {
  TokenRegistry,
  formatProtectedToken,
  generateElementHash,
} from "../protection/tokenRegistry";
import { ProtectedElement } from "../types";

describe("Phase 2: TokenRegistry & Cryptographic Placeholders", () => {
  const sampleElement1: ProtectedElement = {
    token: formatProtectedToken("citation_apa", generateElementHash("citation_apa", "(Wilson et al., 2022)", "1")),
    type: "citation_apa",
    originalValue: "(Wilson et al., 2022)",
    sourceLocation: "p_001:s_001",
    blockId: "p_001",
    sentenceId: "s_001",
    hash: "abc1234",
    occurrenceCount: 1,
    neighboringContext: {
      before: "animals in the world ",
      after: ". It has been closely",
    },
  };

  const sampleElement2: ProtectedElement = {
    token: formatProtectedToken("statistical_expression", generateElementHash("statistical_expression", "p < 0.001", "2")),
    type: "statistical_expression",
    originalValue: "p < 0.001",
    sourceLocation: "p_002:s_003",
    blockId: "p_002",
    sentenceId: "s_003",
    hash: "def5678",
    occurrenceCount: 1,
    neighboringContext: {
      before: "forage nutrition with ",
      after: " and R^2 = 0.88",
    },
  };

  describe("Registration and Querying", () => {
    it("registers and retrieves elements by token, block ID, and sentence ID", () => {
      const registry = new TokenRegistry();
      registry.register(sampleElement1);
      registry.register(sampleElement2);

      expect(registry.count()).toBe(2);
      expect(registry.has(sampleElement1.token)).toBe(true);
      expect(registry.get(sampleElement1.token)?.originalValue).toBe("(Wilson et al., 2022)");

      expect(registry.getByBlock("p_001")).toHaveLength(1);
      expect(registry.getByBlock("p_001")[0].token).toBe(sampleElement1.token);

      expect(registry.getBySentence("s_003")).toHaveLength(1);
      expect(registry.getBySentence("s_003")[0].token).toBe(sampleElement2.token);
    });
  });

  describe("Occurrence Validation", () => {
    it("validates when all registered tokens appear exactly once", () => {
      const registry = new TokenRegistry([sampleElement1, sampleElement2]);
      const validText = `Intro text ${sampleElement1.token} more text ${sampleElement2.token} final text.`;

      const result = registry.validateOccurrences(validText);
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.duplicated).toHaveLength(0);
      expect(result.unexpected).toHaveLength(0);
    });

    it("detects missing tokens", () => {
      const registry = new TokenRegistry([sampleElement1, sampleElement2]);
      const missingText = `Intro text ${sampleElement1.token} without second token.`;

      const result = registry.validateOccurrences(missingText);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain(sampleElement2.token);
    });

    it("detects duplicated tokens", () => {
      const registry = new TokenRegistry([sampleElement1, sampleElement2]);
      const duplicatedText = `${sampleElement1.token} and ${sampleElement1.token} and ${sampleElement2.token}`;

      const result = registry.validateOccurrences(duplicatedText);
      expect(result.valid).toBe(false);
      expect(result.duplicated).toContain(sampleElement1.token);
    });

    it("detects unexpected / unregistered tokens", () => {
      const registry = new TokenRegistry([sampleElement1]);
      const unexpectedToken = "⟦PROTECTED_CITATION_APA_99999999⟧";
      const rogueText = `${sampleElement1.token} and ${unexpectedToken}`;

      const result = registry.validateOccurrences(rogueText);
      expect(result.valid).toBe(false);
      expect(result.unexpected).toContain(unexpectedToken);
    });

    it("detects malformed unclosed token brackets", () => {
      const registry = new TokenRegistry([sampleElement1]);
      const malformedText = `⟦PROTECTED_CITATION_APA_abc123 and regular text.`;

      const result = registry.validateOccurrences(malformedText);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Malformed"))).toBe(true);
    });
  });

  describe("Deterministic Restoration", () => {
    it("restores original values byte-for-byte without alteration", () => {
      const registry = new TokenRegistry([sampleElement1, sampleElement2]);
      const shieldedText = `Evidence from ${sampleElement1.token} shows significant effect (${sampleElement2.token}).`;
      const expectedRestored = `Evidence from (Wilson et al., 2022) shows significant effect (p < 0.001).`;

      const restored = registry.restore(shieldedText);
      expect(restored).toBe(expectedRestored);

      const validation = registry.validateRestoration(expectedRestored, restored);
      expect(validation.valid).toBe(true);
      expect(validation.matchesExactly).toBe(true);
    });
  });

  describe("Serialization", () => {
    it("serializes and deserializes TokenRegistry accurately", () => {
      const registry = new TokenRegistry([sampleElement1, sampleElement2]);
      const json = registry.toJSON();
      const restoredRegistry = TokenRegistry.fromJSON(json);

      expect(restoredRegistry.count()).toBe(2);
      expect(restoredRegistry.has(sampleElement1.token)).toBe(true);
      expect(restoredRegistry.get(sampleElement2.token)?.originalValue).toBe("p < 0.001");
    });
  });
});
