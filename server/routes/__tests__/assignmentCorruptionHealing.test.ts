import { describe, it, expect } from "vitest";
import {
  isCorruptedOutlineHeadings,
  healCorruptedProjectStructure,
  deriveHeuristicTitle,
} from "../project/assignment";
import { isTutorialOrShortQABrief, isClassroomLogisticsLine } from "../../../src/utils/briefExtractor";
import { safeParseAnswerField } from "../../../src/shared/projectStateSchema";

describe("Assignment State Integrity & Corruption Healing", () => {
  it("detects machine learning headings leaked on an OB/leadership topic", () => {
    const leakedHeadings = [
      { id: "h1", title: "Mathematical Formulations and Loss Optimization Landscapes" },
      { id: "h2", title: "Empirical Risk Minimization and Gradient Descent" },
    ];
    const obTopic = "MN609 Leadership and Management Development Schein's Culture Model Zappos";
    expect(isCorruptedOutlineHeadings(leakedHeadings, obTopic)).toBe(true);
  });

  it("does not flag mathematical formulations on an actual machine learning topic", () => {
    const mlHeadings = [
      { id: "h1", title: "Mathematical Formulations and Loss Optimization Landscapes" },
    ];
    const mlTopic = "CS7015 Machine Learning Deep Learning Optimization Landscapes";
    expect(isCorruptedOutlineHeadings(mlHeadings, mlTopic)).toBe(false);
  });

  it("detects classroom logistics lines in headings", () => {
    const classroomHeadings = [
      { id: "h1", title: "Divide Yourself in Teams of 2 Members" },
      { id: "h2", title: "Activity: 20 mins class discussion" },
    ];
    expect(isCorruptedOutlineHeadings(classroomHeadings, "Any Topic")).toBe(true);
  });

  it("heals a corrupted project structure in project answers", () => {
    const corruptedProject = {
      projectId: "test-proj-corruption",
      answers: {
        assignment_question: "Discuss Schein's organizational culture model using Zappos case study.",
        assignment_brief_text: "MN609 Leadership and Management Development\nZappos $2,000 offer to quit\nApply Schein's 3 levels",
        assignment_structure: JSON.stringify({
          headings: [
            { id: "h1", title: "Mathematical Formulations and Loss Optimization Landscapes" },
            { id: "h2", title: "Divide Yourself in Teams of 2 Members" },
          ],
        }),
        assignment_internal_sections: JSON.stringify([{ id: "s1", title: "Loss Optimization" }]),
      },
    };

    const healed = healCorruptedProjectStructure(corruptedProject);
    expect(healed).toBe(true);

    const healedStructure = safeParseAnswerField<{ headings: any[] }>(corruptedProject.answers.assignment_structure, { headings: [] });
    expect(healedStructure.headings.length).toBeGreaterThan(0);
    // Verified no ML headings remain
    const allTitles = healedStructure.headings.map((h: any) => h.title.toLowerCase());
    expect(allTitles.some((t: string) => t.includes("loss optimization"))).toBe(false);
    expect(allTitles.some((t: string) => t.includes("divide yourself"))).toBe(false);
    // Verified stale internal sections were purged
    expect(corruptedProject.answers.assignment_internal_sections).toBeUndefined();
  });

  it("deriveHeuristicTitle never selects classroom logistics lines as the project title", () => {
    const briefWithClassroomNoise = `Tutorial Task (in groups)
Divide Yourself in Teams of 2 Members
Activity: 20 mins
MN609: Leadership and Management Development
Discuss Schein's 3 levels of culture at Zappos.`;

    const title = deriveHeuristicTitle(briefWithClassroomNoise);
    expect(title).not.toMatch(/divide yourself/i);
    expect(title).not.toMatch(/teams of/i);
    expect(title).toMatch(/MN609\s+Leadership/i);
  });

  it("identifies short tutorial briefs and bounds default word count", () => {
    const tutorialBrief = `Tutorial Task (in groups)
MN609 Leadership and Management Development
Question 1: What are artifacts vs basic assumptions?
Question 2: At what level of culture did the intervention take place?
Question 3: How would you evaluate the culture during an interview?`;

    expect(isTutorialOrShortQABrief(tutorialBrief)).toBe(true);
    expect(isClassroomLogisticsLine("Divide Yourself in Teams of 2 Members")).toBe(true);
  });
});
