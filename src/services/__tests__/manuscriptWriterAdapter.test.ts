import { describe, it, expect } from "vitest";
import { DEFAULT_STATE } from "../../types";
import { buildManuscriptWriterInput } from "../manuscriptWriterAdapter";

describe("buildManuscriptWriterInput — Task 1 honest adapter", () => {
  it("maps real PaperProject identity fields onto CanonicalResearchProject.identity", () => {
    const project = { ...DEFAULT_STATE("tester"), title: "Real Title", field: "Philosophy", keywords: "ethics, dharma" };

    const input = buildManuscriptWriterInput(project);

    expect(input.project.identity.title).toBe("Real Title");
    expect(input.project.identity.discipline).toBe("Philosophy");
    expect(input.project.identity.keywords).toEqual(["ethics", "dharma"]);
  });

  it("maps only approved dataSources into knowledge.referenceIds, never pending ones", () => {
    const project = {
      ...DEFAULT_STATE("tester"),
      dataSources: [
        { name: "Approved Source", url: "https://example.org/a", type: "Mixed" as const, relevance: "", reliability: "", limitations: "", status: "approved" as const },
        { name: "Pending Source", url: "https://example.org/p", type: "Mixed" as const, relevance: "", reliability: "", limitations: "", status: "pending" as const },
      ],
    };

    const input = buildManuscriptWriterInput(project);

    expect(input.project.knowledge.referenceIds).toEqual(["https://example.org/a"]);
  });

  it("maps real objectives/researchQuestions/researchGap/methodology onto researchContext, undefined when empty", () => {
    const project = { ...DEFAULT_STATE("tester"), objectives: "Real objectives.", researchQuestions: "Real RQs.", researchGap: "", methodology: "" };

    const input = buildManuscriptWriterInput(project);

    expect(input.researchContext?.objectives).toBe("Real objectives.");
    expect(input.researchContext?.researchQuestions).toBe("Real RQs.");
    expect(input.researchContext?.researchGap).toBeUndefined();
    expect(input.researchContext?.methodology).toBeUndefined();
  });

  it("finds real, already-drafted Results/Discussion section text, never fabricating it", () => {
    const project = {
      ...DEFAULT_STATE("tester"),
      sections: { "Results / Analysis": "N=40, real effect size.", "Discussion": "Real discussion text.", Introduction: "Real intro." },
    };

    const input = buildManuscriptWriterInput(project);

    expect(input.researchContext?.existingResultsText).toBe("N=40, real effect size.");
    expect(input.researchContext?.existingDiscussionText).toBe("Real discussion text.");
  });

  it("leaves existingResultsText/existingDiscussionText undefined when no such section has been drafted", () => {
    const project = { ...DEFAULT_STATE("tester"), sections: { Introduction: "Real intro." } };

    const input = buildManuscriptWriterInput(project);

    expect(input.researchContext?.existingResultsText).toBeUndefined();
    expect(input.researchContext?.existingDiscussionText).toBeUndefined();
  });

  it("never synthesizes literatureKeyFindings — always undefined from this adapter", () => {
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    const input = buildManuscriptWriterInput(project);

    expect(input.researchContext?.literatureKeyFindings).toBeUndefined();
  });

  it("leaves artifacts empty rather than fabricating unresolvable *Id references", () => {
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    const input = buildManuscriptWriterInput(project);

    expect(input.project.artifacts).toEqual({});
  });

  it("passes the project's real aiSettings through untouched", () => {
    const project = { ...DEFAULT_STATE("tester"), aiSettings: { provider: "gemini" as const } };

    const input = buildManuscriptWriterInput(project);

    expect(input.aiSettings).toEqual({ provider: "gemini" });
  });
});
