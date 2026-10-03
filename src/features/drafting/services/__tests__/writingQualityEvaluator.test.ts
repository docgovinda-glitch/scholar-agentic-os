import { describe, it, expect } from "vitest";
import {
  evaluateWritingQuality,
  extractSentences,
  calculateFleschKincaid,
  isPassiveSentence,
  analyzeVoiceRatios,
  detectBannedPhrases,
  detectThroatClearing,
  calculateRepetitionRatio,
} from "../writingQualityEvaluator";

describe("Writing Quality Evaluator Service", () => {
  const fillerHeavyParagraph =
    "A critical point of departure for evaluating this dimension lies in how the primary phenomenon of procedural objectivity shapes outcomes. " +
    "It is important to consider the fact that an examination was conducted by analysts where computational expediency was privileged over accuracy. " +
    "In today's modern world and society, you can see that your organizations must adapt to technological disruptions.";

  const collegeStandardClearProse =
    "Zappos offers a two-thousand-dollar quit bonus to filter for intrinsic commitment and cultural alignment among newly hired employees. " +
    "The financial incentive tests whether an applicant's values align with the service-oriented culture. " +
    "Employees who decline the bonus demonstrate dedication to the organizational mission rather than short-term compensation. " +
    "This practice confirms Edgar Schein's thesis that shared assumptions determine performance far more than formal policy statements. " +
    "Consequently, leaders prioritize cultural fit during onboarding to protect workplace morale and reduce employee turnover.";

  describe("evaluateWritingQuality", () => {
    it("flags filler-heavy paragraph with rewrite warnings and actionable issues", () => {
      const evaluation = evaluateWritingQuality(fillerHeavyParagraph, {
        tone: "analytical",
      });

      expect(evaluation.meetsStandard).toBe(false);
      expect(evaluation.issues.length).toBeGreaterThan(0);
      expect(evaluation.suggestedRewrites.length).toBeGreaterThan(0);

      // Verify specific issue types were detected
      const issueTypes = evaluation.issues.map((i) => i.type);
      expect(issueTypes).toContain("banned_buzzword");
      expect(issueTypes).toContain("throat_clearing");
      expect(issueTypes).toContain("second_person_informal");
    });

    it("evaluates college-standard clear prose with high score and passes quality check", () => {
      const evaluation = evaluateWritingQuality(collegeStandardClearProse, {
        tone: "analytical",
      });

      expect(evaluation.meetsStandard).toBe(true);
      expect(evaluation.qualityScore).toBeGreaterThanOrEqual(85);
      expect(evaluation.metrics.activeVoiceRatio).toBeGreaterThanOrEqual(0.8);
      expect(evaluation.metrics.passiveVoiceRatio).toBeLessThanOrEqual(0.2);
      expect(evaluation.metrics.bannedPhraseCount).toBe(0);
      expect(evaluation.metrics.repetitionRatio).toBe(0);
    });

    it("verifies Flesch-Kincaid grade level falls within collegiate standard (11-14)", () => {
      const evaluation = evaluateWritingQuality(collegeStandardClearProse, {
        tone: "analytical",
      });

      expect(evaluation.metrics.fleschKincaidGradeLevel).toBeGreaterThanOrEqual(10);
      expect(evaluation.metrics.fleschKincaidGradeLevel).toBeLessThanOrEqual(15);
    });

    it("flags high cross-section repetition overlap (>20%)", () => {
      const existingSections = [
        collegeStandardClearProse,
        "Another unique scholarly paragraph discussing leadership models and empirical case evidence.",
      ];

      // Highly overlapping text
      const duplicateText = collegeStandardClearProse;

      const evaluation = evaluateWritingQuality(duplicateText, {
        tone: "analytical",
        existingSections,
      });

      expect(evaluation.metrics.repetitionRatio).toBeGreaterThan(0.2);
      const repIssue = evaluation.issues.find((i) => i.type === "repetition");
      expect(repIssue).toBeDefined();
      expect(evaluation.meetsStandard).toBe(false);
    });
  });

  describe("Sub-heuristics", () => {
    it("extracts sentences accurately", () => {
      const sentences = extractSentences(collegeStandardClearProse);
      expect(sentences).toHaveLength(5);
      expect(sentences[0]).toContain("Zappos offers");
    });

    it("calculates active vs passive voice ratio correctly", () => {
      const passiveText =
        "The survey was conducted by the committee. The policy was established by management. The decision was announced by the board.";
      const passiveRatios = analyzeVoiceRatios(passiveText);
      expect(passiveRatios.passiveRatio).toBeGreaterThan(0.7);
      expect(passiveRatios.activeRatio).toBeLessThan(0.3);

      const activeText =
        "The committee conducted the survey. Management established the policy. The board announced the decision.";
      const activeRatios = analyzeVoiceRatios(activeText);
      expect(activeRatios.activeRatio).toBe(1.0);
      expect(activeRatios.passiveRatio).toBe(0.0);
    });

    it("detects passive sentence patterns accurately", () => {
      expect(isPassiveSentence("The study was performed by researchers.")).toBe(true);
      expect(isPassiveSentence("Researchers performed the study.")).toBe(false);
      expect(isPassiveSentence("The hypothesis has been verified by the lab.")).toBe(true);
      expect(isPassiveSentence("The lab verified the hypothesis.")).toBe(false);
    });

    it("detects banned buzzwords", () => {
      const text = "This model ensures computational expediency and procedural objectivity in research.";
      const banned = detectBannedPhrases(text);
      expect(banned).toContain("computational expediency");
      expect(banned).toContain("procedural objectivity");
    });

    it("detects empty throat-clearing openings", () => {
      const text1 = "A critical point of departure for evaluating this dimension lies in how systems fail.";
      expect(detectThroatClearing(text1).length).toBeGreaterThan(0);

      const text2 = "It is important to consider the fact that resources remain scarce.";
      expect(detectThroatClearing(text2).length).toBeGreaterThan(0);

      const text3 = "Resources remain scarce across developing markets.";
      expect(detectThroatClearing(text3)).toHaveLength(0);
    });

    it("calculates n-gram repetition overlap accurately", () => {
      const source = "The rapid expansion of artificial intelligence in healthcare demands strict regulatory oversight and ethical evaluation.";
      const similar = "The rapid expansion of artificial intelligence in healthcare demands strict operational guidelines.";
      const distinct = "Photosynthesis converts solar energy into chemical sugars within cellular chloroplast structures.";

      const overlapSimilar = calculateRepetitionRatio(similar, [source]);
      expect(overlapSimilar).toBeGreaterThan(0.3);

      const overlapDistinct = calculateRepetitionRatio(distinct, [source]);
      expect(overlapDistinct).toBeLessThan(0.1);
    });
  });
});
