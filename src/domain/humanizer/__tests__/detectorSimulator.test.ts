import { describe, it, expect } from "vitest";
import { simulateAiDetectors } from "../evaluation/detectorSimulator";

describe("DetectorSimulator (Pre-Flight AI Detector Simulation)", () => {
  it("handles empty text gracefully", () => {
    const result = simulateAiDetectors("");
    expect(result.overallAiProbability).toBe(0);
    expect(result.humanLikelihoodScore).toBe(100);
    expect(result.verdict).toBe("Likely Human Written");
    expect(result.flaggedSentences.length).toBe(0);
  });

  it("detects heavy AI tropes and uniform syntax as high AI probability", () => {
    const roboticAiText =
      "Moreover, it is crucial to remember that AI plays a pivotal role in the multifaceted landscape. " +
      "Furthermore, it is important to note that deep learning delves into complex patterns seamlessly. " +
      "In conclusion, it is evident that harnessing the power of technology serves as a reminder of progress.";

    const result = simulateAiDetectors(roboticAiText);

    expect(result.overallAiProbability).toBeGreaterThan(40);
    expect(result.detectedMarkers.length).toBeGreaterThan(3);
    expect(result.detectedMarkers).toContain("Moreover");
    expect(result.detectedMarkers).toContain("Furthermore");
    expect(result.detectedMarkers).toContain("Delve into");
    expect(result.flaggedSentences.length).toBeGreaterThan(0);
    expect(result.turnitinScore).toBeGreaterThan(35);
    expect(result.gptZeroScore).toBeGreaterThan(35);
  });

  it("evaluates highly bursty human academic text as low AI probability", () => {
    const naturalHumanAcademicText =
      "We tested the hypothesis using a randomized controlled design with 1,200 participants. " +
      "While initial assumptions favored a linear response curve, the observed empirical data deviated sharply under high-temperature stress conditions (Wilson et al., 2024). " +
      "Why? " +
      "Because latent non-Markovian states introduce memory saturation that simple autoregressive heuristics cannot anticipate ($p < 0.001$, $R^2 = 0.91$). " +
      "Our findings suggest three concrete architectural shifts.";

    const result = simulateAiDetectors(naturalHumanAcademicText);

    expect(result.overallAiProbability).toBeLessThan(35);
    expect(result.humanLikelihoodScore).toBeGreaterThan(65);
    expect(result.burstinessScore).toBeGreaterThan(50);
    expect(result.verdict).toMatch(/Likely Human Written|Mixed/);
  });
});
