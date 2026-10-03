import { describe, it, expect } from "vitest";
import { stripLineTags, classifyScopeBoundaries } from "../services/scopeClassifier";

describe("Scope Classifier Service", () => {
  it("strips line tags such as [L023] and [L012-L015] cleanly", () => {
    expect(stripLineTags("[L023] Why would Zappos offer $2,000?")).toBe("Why would Zappos offer $2,000?");
    expect(stripLineTags("[L050-L055] Some directive text")).toBe("Some directive text");
    expect(stripLineTags('"leave? [L013]"')).toBe("leave?");
  });

  it("classifies research scope for Zappos and Schein into plain English boundaries", () => {
    const briefText = "Developing Breakthrough Leadership Tutorial Week 2 Zappos culture Schein model";
    const questions = [
      "Why would Zappos offer new employees $2,000 to quit after their first week of training?",
      "Can organizational culture be changed by changing artifacts alone?",
      "As a leader, which level of Schein's model would you start with to change organizational culture?",
      "How would you assess a company's culture during a job interview using Schein's model?",
    ];

    const boundaries = classifyScopeBoundaries(briefText, questions);

    expect(boundaries.summaryBanner).toBe(
      "Identified 4 core analytical questions covering Zappos culture and Schein's Organizational Culture Model."
    );

    // Green Card: What to Focus On & Include
    expect(boundaries.included).toEqual([
      "Explain why Zappos pays people to quit (filtering for cultural fit and commitment vs. short-term monetary interest).",
      "Deconstruct Schein's 3 levels: Artifacts (visible symbols), Espoused Values (stated norms), and Underlying Assumptions (deeply held beliefs).",
      "Evaluate whether changing physical artifacts alone changes behaviors or just creates surface compliance.",
      "Outline how candidates can evaluate employer culture in job interviews using Schein's framework.",
    ]);

    // Orange Card: What to Avoid / Out of Scope
    expect(boundaries.excluded).toEqual([
      "Do not write about classroom logistics, team formation rules, or discussion time limits.",
      "Avoid shallow company history that does not analyze organizational culture.",
      "Do not confuse superficial perks (office snacks, casual dress) with deep cultural values.",
    ]);

    // Ensure no [L0xx] tags exist in any boundary
    boundaries.included.forEach((item) => {
      expect(item).not.toMatch(/\[L\d+\]/);
    });
    boundaries.excluded.forEach((item) => {
      expect(item).not.toMatch(/\[L\d+\]/);
    });
  });
});
