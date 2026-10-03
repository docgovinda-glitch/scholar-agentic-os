import { describe, it, expect } from "vitest";
import {
  repairHyphenatedAndSoftLineBreaks,
  filterPedagogicalNoise,
  deduplicateQuestions,
  extractSanitizedQuestions,
  sanitizeBrief,
} from "../services/briefSanitizer";

describe("Brief Sanitizer & Slicing Service", () => {
  it("reassembles hyphenated line breaks cleanly", () => {
    const raw = "Company dress\\n- codes and rules";
    const repaired = repairHyphenatedAndSoftLineBreaks(raw);
    expect(repaired).toContain("dress codes");
  });

  it("reassembles soft line breaks for questions ending in 'leave?' or 'codes)?'", () => {
    const raw = "Why would Zappos offer new employees $2,000 to quit after their first week of training and pay people to\\nleave?";
    const repaired = repairHyphenatedAndSoftLineBreaks(raw);
    expect(repaired).toContain("pay people to leave?");

    const raw2 = "Can organizational culture be changed by changing artifacts alone (e.g., redesigning offices, changing dress\\ncodes)? Why or why not?";
    const repaired2 = repairHyphenatedAndSoftLineBreaks(raw2);
    expect(repaired2).toContain("changing dress codes)? Why or why not?");
  });

  it("filters out pedagogical and classroom noise", () => {
    const noisyLines = [
      "Activity Description- In Classroom Discussion",
      "1. Divide yourself in teams of 2 members",
      "Work in pairs with your colleague",
      "Preparation time: 10 minutes",
      "Class discussion time: 15 minutes",
      "-- 5 of 12 --",
      "Tutorial Week 2",
      "Module Leader: Dr. Jane Doe",
      "Why would Zappos offer new employees $2,000 to quit?",
    ];

    const filtered = filterPedagogicalNoise(noisyLines);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toBe("Why would Zappos offer new employees $2,000 to quit?");
  });

  it("deduplicates repeated slide questions using normalized similarity", () => {
    const questions = [
      "Why would Zappos offer new employees $2,000 to quit after their first week of training?",
      "Why would Zappos offer new employees $2,000 to quit after their first week of training? [L051]",
      "As a leader, which level of Schein's model would you start with to change organizational culture, and why?",
    ];

    const deduplicated = deduplicateQuestions(questions);
    expect(deduplicated).toHaveLength(2);
    expect(deduplicated[0]).toContain("Zappos");
    expect(deduplicated[1]).toContain("Schein's model");
  });

  it("extracts the exact 4 canonical questions from tutorial slide content", () => {
    const tutorialSlideText = `
      Tutorial Week 2: Developing Breakthrough Leadership
      Activity Description- In Classroom Discussion
      1. Divide yourself in teams of 2 members
      Preparation time: 10 minutes
      Class discussion time: 15 minutes

      1. Why would Zappos offer new employees $2,000 to quit after their first week of training?
      2. Can organizational culture be changed by changing artifacts alone (e.g., redesigning offices, changing dress
      codes)? Why or why not?
      3. As a leader, which level of Schein's model would you start with to change organizational culture, and why?
      4. How would you assess a company's culture during a job interview using Schein's model?

      -- 4 of 10 --
      Summary Discussion
      Divide yourself in teams of 2 members
      Can organizational culture be changed by changing artifacts alone (e.g., redesigning offices, changing dress codes)? Why or why not?
    `;

    const result = sanitizeBrief(tutorialSlideText);
    expect(result.extractedQuestions).toHaveLength(4);

    expect(result.extractedQuestions[0]).toBe(
      "Why would Zappos offer new employees $2,000 to quit after their first week of training?"
    );
    expect(result.extractedQuestions[1]).toBe(
      "Can organizational culture be changed by changing artifacts alone (e.g., redesigning offices, changing dress codes)? Why or why not?"
    );
    expect(result.extractedQuestions[2]).toBe(
      "As a leader, which level of Schein's model would you start with to change organizational culture, and why?"
    );
    expect(result.extractedQuestions[3]).toBe(
      "How would you assess a company's culture during a job interview using Schein's model?"
    );

    // Verify noise was omitted
    expect(result.omittedPedagogicalNoise.some((n) => n.includes("Divide yourself"))).toBe(true);
    expect(result.omittedPedagogicalNoise.some((n) => n.includes("Preparation time"))).toBe(true);
  });
});
