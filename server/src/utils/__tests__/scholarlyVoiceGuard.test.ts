import { describe, it, expect } from "vitest";
import {
  BANNED_CLICHE_TOKENS,
  buildScholarlyVoiceSystemPrompt,
  detectBannedTokens,
  normalizeUnicodeNFC,
  convertToBritishEnglish,
  sanitizeScholarlyText,
  evaluateBurstiness,
} from "../scholarlyVoiceGuard";

describe("Scholarly Voice & Orthographic Guardrails", () => {
  describe("Lexical Fingerprint Suppression (detectBannedTokens)", () => {
    it("detects forbidden cliché tokens in text", () => {
      const text = "We must delve into this rich tapestry, which is a testament to the pivotal results.";
      const { hasBannedTokens, matches } = detectBannedTokens(text);

      expect(hasBannedTokens).toBe(true);
      expect(matches).toContain("delve");
      expect(matches).toContain("tapestry");
      expect(matches).toContain("testament");
      expect(matches).toContain("pivotal");
    });

    it("returns false for authentic scholarly text without clichés", () => {
      const clean = "The empirical variance demonstrates statistical divergence under high-entropy conditions.";
      const { hasBannedTokens, matches } = detectBannedTokens(clean);

      expect(hasBannedTokens).toBe(false);
      expect(matches).toEqual([]);
    });

    it("handles empty or whitespace text gracefully", () => {
      expect(detectBannedTokens("").hasBannedTokens).toBe(false);
      expect(detectBannedTokens("   ").hasBannedTokens).toBe(false);
    });
  });

  describe("Unicode & IAST Diacritic Fidelity (normalizeUnicodeNFC)", () => {
    it("normalizes decomposed Unicode into canonical composed NFC", () => {
      // Decomposed 'a' + combining macron '\u0304' -> Composed 'ā' ('\u0101')
      const decomposed = "a\u0304sana";
      const normalized = normalizeUnicodeNFC(decomposed);

      expect(normalized).toBe("āsana");
      expect(normalized.length).toBe(5);
    });

    it("preserves multi-diacritic IAST philosophical transliteration faithfully", () => {
      const iast = "Patañjali states in the Yogasūtra: ṛṣi, śruti, ṣaḍdarśana, prajñā, nirvāṇa.";
      const preserved = normalizeUnicodeNFC(iast);

      expect(preserved).toContain("Patañjali");
      expect(preserved).toContain("Yogasūtra");
      expect(preserved).toContain("ṛṣi");
      expect(preserved).toContain("śruti");
      expect(preserved).toContain("ṣaḍdarśana");
      expect(preserved).toContain("prajñā");
      expect(preserved).toContain("nirvāṇa");
    });
  });

  describe("Orthographic Dialect Conversion (convertToBritishEnglish)", () => {
    it("converts American English spellings to British English standards by default", () => {
      const american = "We analyze the behavior and color of the center using advanced modeling.";
      const british = convertToBritishEnglish(american);

      expect(british).toBe("We analyse the behaviour and colour of the centre using advanced modelling.");
    });

    it("preserves capitalization when converting tokens", () => {
      const american = "Analyze the Behavior carefully.";
      const british = convertToBritishEnglish(american);

      expect(british).toBe("Analyse the Behaviour carefully.");
    });

    it("protects URLs and DOI links from accidental string corruption during conversion", () => {
      const withUrl = "Please analyze https://example.com/color-center and DOI 10.1000/182-behavior.";
      const british = convertToBritishEnglish(withUrl);

      expect(british).toContain("https://example.com/color-center");
      expect(british).toContain("10.1000/182-behavior");
      expect(british).toMatch(/^Please analyse/);
    });
  });

  describe("Sanitization & Burstiness (sanitizeScholarlyText & evaluateBurstiness)", () => {
    it("replaces known cliché idioms with concise academic phrasing", () => {
      const input = "It is worth noting that this study is a testament to rigorous analysis.";
      const sanitized = sanitizeScholarlyText(input, { dialect: "en-GB", stripCliches: true });

      expect(sanitized).toContain("notably,");
      expect(sanitized).toContain("evidence of");
      expect(sanitized).not.toContain("it is worth noting");
      expect(sanitized).not.toContain("testament");
    });

    it("computes sentence length variance and identifies bursty academic prose", () => {
      const burstyText =
        "The model failed. Under asymmetric network topologies, latency degraded precipitously due to cascading quorum contention across remote consensus nodes. Recovery required two seconds.";
      const { averageLength, variance, burstinessScore, isSufficientlyBurst } = evaluateBurstiness(burstyText);

      expect(averageLength).toBeGreaterThan(0);
      expect(variance).toBeGreaterThan(10);
      expect(burstinessScore).toBeGreaterThan(0.3);
      expect(isSufficientlyBurst).toBe(true);
    });
  });

  describe("System Prompt Generation (buildScholarlyVoiceSystemPrompt)", () => {
    it("generates prompt with British dialect and locked technical nomenclature", () => {
      const prompt = buildScholarlyVoiceSystemPrompt({
        dialect: "en-GB",
        discipline: "Quantum Computational Neuroscience",
        lockedTerms: ["QubitDecoherenceRate", "SchrödingerOperator"],
      });

      expect(prompt).toContain("DISCOURSE-LEVEL SCHOLARLY VOICE & ORTHOGRAPHIC MANDATE WITHIN QUANTUM COMPUTATIONAL NEUROSCIENCE");
      expect(prompt).toContain("British English");
      expect(prompt).toContain("QubitDecoherenceRate");
      expect(prompt).toContain("SchrödingerOperator");
      expect(prompt).toContain("LEXICAL FINGERPRINT SUPPRESSION");
      expect(prompt).toContain("[Unverified Claim — Vault Citation Required]");
    });
  });
});
