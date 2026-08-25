import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  analyzeLocalStylometrics,
  verifyWithGptZero,
  verifyWithSapling,
} from "../aiDetectorService";

describe("aiDetectorService", () => {
  it("computes statistical stylometrics for synthetic AI text", () => {
    const syntheticText =
      "Moreover, autonomous agents play a pivotal role in the multifaceted landscape. Furthermore, delving into this technology seamlessly integrates various paradigms. In conclusion, it is evident that these models demonstrate profound capabilities.";

    const result = analyzeLocalStylometrics(syntheticText);

    expect(result.aiProbability).toBeGreaterThan(50);
    expect(result.humanProbability).toBeLessThan(50);
    expect(result.verdict).toBe("Likely AI-Generated");
    expect(result.detectedClichés.length).toBeGreaterThan(3);
    expect(result.burstinessScore).toBeDefined();
    expect(result.wordCount).toBeGreaterThan(20);
  });

  it("computes statistical stylometrics for organic human writing", () => {
    const organicText =
      "We tested the battery life across five varied conditions. While early prototypes drained rapidly under sustained compute loads, introducing a low-power clock divider cut standby draw by nearly forty percent. It worked. The final revision lasted thirty-six continuous hours during outdoor telemetry trials without unexpected voltage drops.";

    const result = analyzeLocalStylometrics(organicText);

    expect(result.aiProbability).toBeLessThan(40);
    expect(result.verdict).toBe("Likely Human");
    expect(result.detectedClichés.length).toBe(0);
    expect(result.burstinessScore).toBeGreaterThan(50);
  });

  it("handles empty string gracefully", () => {
    const result = analyzeLocalStylometrics("");
    expect(result.wordCount).toBe(0);
    expect(result.aiProbability).toBe(0);
    expect(result.humanProbability).toBe(100);
  });

  describe("External API Verifications", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("verifies with GPTZero API successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documents: [
            {
              completely_generated_prob: 0.08,
              sentences: [
                { sentence: "Sentence one.", generated_prob: 0.05 },
                { sentence: "Sentence two.", generated_prob: 0.11 },
              ],
            },
          ],
        }),
      });

      const res = await verifyWithGptZero("Sentence one. Sentence two.", "mock-gptzero-key");
      expect(res.provider).toBe("gptzero");
      expect(res.aiProbability).toBe(8);
      expect(res.humanProbability).toBe(92);
      expect(res.verdict).toBe("Likely Human");
      expect(res.highlightedSentences?.length).toBe(2);
    });

    it("verifies with Sapling API successfully", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          score: 0.85,
        }),
      });

      const res = await verifyWithSapling("Some text", "mock-sapling-key");
      expect(res.provider).toBe("sapling");
      expect(res.aiProbability).toBe(85);
      expect(res.verdict).toBe("Likely AI");
    });
  });
});
