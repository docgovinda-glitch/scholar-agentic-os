import { describe, it, expect } from "vitest";
import { DEFAULT_STATE } from "../../types";
import { getSectionsWithContent, getModelsUsedForDrafting, buildDefaultDisclosureText, buildDefaultDisclosure } from "../aiDisclosureService";

describe("getSectionsWithContent", () => {
  it("returns only section names with non-empty trimmed content", () => {
    const project = { ...DEFAULT_STATE("tester"), sections: { Introduction: "Real text.", Empty: "", Whitespace: "   " } };
    expect(getSectionsWithContent(project)).toEqual(["Introduction"]);
  });

  it("returns an empty array when there are no drafted sections", () => {
    const project = { ...DEFAULT_STATE("tester"), sections: {} };
    expect(getSectionsWithContent(project)).toEqual([]);
  });
});

describe("getModelsUsedForDrafting", () => {
  it("dedupes and includes only drafting-related taskTypes, excluding unrelated ones", () => {
    const project = {
      ...DEFAULT_STATE("tester"),
      usageLogs: [
        { timestamp: "t1", provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1, estimatedCost: 0, taskType: "drafting" },
        { timestamp: "t2", provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1, estimatedCost: 0, taskType: "drafting" },
        { timestamp: "t3", provider: "openai", model: "gpt-4o", inputWords: 1, outputWords: 1, estimatedCost: 0, taskType: "humanize" },
        { timestamp: "t4", provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1, estimatedCost: 0, taskType: "journal-discovery" },
      ],
    };

    const result = getModelsUsedForDrafting(project);
    expect(result).toEqual(["gemini (gemini-pro)", "openai (gpt-4o)"]);
  });

  it("returns an empty array when there are no usage logs at all", () => {
    const project = { ...DEFAULT_STATE("tester") };
    expect(getModelsUsedForDrafting(project)).toEqual([]);
  });
});

describe("buildDefaultDisclosureText", () => {
  it("includes the real section names and model names, and the accountability language", () => {
    const text = buildDefaultDisclosureText(["Introduction", "Methodology"], ["gemini (gemini-pro)"]);
    expect(text).toContain("Introduction, Methodology");
    expect(text).toContain("gemini (gemini-pro)");
    expect(text).toContain("reviewed and edited the content");
    expect(text).toContain("take full responsibility");
    expect(text).toContain("No AI tool is credited as an author");
  });

  it("falls back to generic placeholders when there are no sections or models yet", () => {
    const text = buildDefaultDisclosureText([], []);
    expect(text).toContain("an AI writing assistant");
    expect(text).toContain("the sections listed above");
  });

  it("never claims detection-evasion or references bypassing anything (Stage 9 honesty requirement)", () => {
    const text = buildDefaultDisclosureText(["Introduction"], ["gemini (gemini-pro)"]);
    expect(text.toLowerCase()).not.toContain("detector");
    expect(text.toLowerCase()).not.toContain("bypass");
  });
});

describe("buildDefaultDisclosure", () => {
  it("composes sectionsIncluded, modelsUsed, and disclosureText from real project data", () => {
    const project = {
      ...DEFAULT_STATE("tester"),
      sections: { Introduction: "Real text." },
      usageLogs: [{ timestamp: "t1", provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1, estimatedCost: 0, taskType: "drafting" }],
    };

    const result = buildDefaultDisclosure(project);
    expect(result.sectionsIncluded).toEqual(["Introduction"]);
    expect(result.modelsUsed).toEqual(["gemini (gemini-pro)"]);
    expect(result.disclosureText).toContain("Introduction");
    expect(result.disclosureText).toContain("gemini (gemini-pro)");
  });
});
