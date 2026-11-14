import { describe, it, expect } from "vitest";
import { auditAndEnforceCollegiateStyle } from "../courseworkOrchestrator";

describe("Coursework collegiate prose audit", () => {
  describe("Collegiate Style & Fluff Elimination (academicWritingPrompts.ts)", () => {
    it("detects and strips banned throat-clearing openings", () => {
      const text = "A critical point of departure for evaluating this dimension lies in how organizational culture functions as a strategic asset.";
      const audit = auditAndEnforceCollegiateStyle(text);

      expect(audit.violations.some((v) => v.includes("throat-clearing"))).toBe(true);
      expect(audit.sanitizedText).not.toContain("A critical point of departure for evaluating this dimension lies in how");
      expect(audit.sanitizedText).toContain("organizational culture functions");
    });

    it("flags banned pseudo-academic buzzwords", () => {
      const text = "The company relied on computational expediency and procedural objectivity to filter applicants.";
      const audit = auditAndEnforceCollegiateStyle(text);

      expect(audit.violations.some((v) => v.includes("procedural objectivity"))).toBe(true);
      expect(audit.violations.some((v) => v.includes("computational expediency"))).toBe(true);
    });

    it("replaces nominalizations with active verbs", () => {
      const text = "The researcher conducts an analysis of the empirical findings.";
      const audit = auditAndEnforceCollegiateStyle(text);

      expect(audit.sanitizedText).toContain("analyzes the empirical findings");
    });

    it("evaluates active voice ratio", () => {
      const activeText = "Leaders establish cultural values. Managers reinforce daily habits. Teams align their operations. Evidence confirms positive retention.";
      const audit = auditAndEnforceCollegiateStyle(activeText);

      expect(audit.activeVoiceRatio).toBeGreaterThanOrEqual(0.8);
      expect(audit.isCompliant).toBe(true);
    });
  });

});
