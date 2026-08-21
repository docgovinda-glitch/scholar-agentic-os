import { describe, it, expect } from "vitest";
import { buildLiteraturePrompts } from "../../desk/workspace/agentPrompts/literaturePrompts";
import { buildGapPrompts } from "../../desk/workspace/agentPrompts/gapPrompts";
import { buildTitlePrompts } from "../../desk/workspace/agentPrompts/titlePrompts";
import { parseJsonFromLlm } from "../../utils/jsonParser";

describe("Agent Prompts & JSON Parser", () => {
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

  it("builds gap prompts linked to working title and research area", () => {
    const { systemPrompt, userPrompt } = buildGapPrompts({
      workingTitle: "Quantum Algorithms in Finance",
      researchArea: "Computational Finance",
      projectAnswers: {},
    });

    expect(systemPrompt).toContain("expert academic gap analysis agent");
    expect(userPrompt).toContain("Working Title: Quantum Algorithms in Finance");
    expect(userPrompt).toContain("Research Area: Computational Finance");
  });

  it("builds title prompts using project answers context", () => {
    const { systemPrompt, userPrompt } = buildTitlePrompts({
      projectAnswers: { research_area: "Biophysics", methodology: "Cryo-EM" },
    });

    expect(systemPrompt).toContain("expert academic title generator");
    expect(userPrompt).toContain("Biophysics");
    expect(userPrompt).toContain("Cryo-EM");
  });

  it("parses raw JSON, fenced JSON, and outer brackets from LLM responses", () => {
    const directJson = '{"data": [{"id": "1", "title": "Paper 1"}]}';
    expect(parseJsonFromLlm(directJson)?.data[0].id).toBe("1");

    const markdownFence = 'Here is your result:\n```json\n{"data": [{"id": "2"}]}\n```\nHope this helps!';
    expect(parseJsonFromLlm(markdownFence)?.data[0].id).toBe("2");

    const messyText = 'Thinking... Done! {"data": [{"id": "3"}]} Some trailing text';
    expect(parseJsonFromLlm(messyText)?.data[0].id).toBe("3");
  });
});
