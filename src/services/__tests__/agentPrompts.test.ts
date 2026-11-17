import { describe, it, expect } from "vitest";
import { buildLiteraturePrompts } from "../../desk/workspace/agentPrompts/literaturePrompts";

describe("Literature agent prompts", () => {
  it("builds literature prompts with canonical exclusions", () => {
    const { systemPrompt, userPrompt } = buildLiteraturePrompts({
      workingTitle: "Neural Foundations of Cognition",
      researchArea: "Neuroscience",
      projectAnswers: { current_stage: "definition" },
      isBroadened: true,
      excludeDois: ["10.1000/182"],
      excludeTitles: ["Existing Paper"],
    });

    expect(systemPrompt).toContain("BROADEN the literature search");
    expect(systemPrompt).toContain("10.1000/182");
    expect(systemPrompt).toContain("Existing Paper");
    expect(userPrompt).toContain("Working Title: Neural Foundations of Cognition");
  });
});
