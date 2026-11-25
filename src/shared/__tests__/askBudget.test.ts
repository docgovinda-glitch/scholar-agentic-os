import { describe, it, expect } from "vitest";
import { ASK_QUICK_MAX_SOURCES, budgetSourcesForPrompt, excerpt } from "../askBudget";
import { platformFactsFor, buildAskSearchPrompt, buildAskGeneralPrompt, PLATFORM_FACTS } from "../askPrompts";

describe("Ask token budget", () => {
  it("keeps at most ASK_QUICK_MAX_SOURCES sources, best first, with short excerpts", () => {
    const long = "This finding holds across cohorts. ".repeat(60);
    const sources = Array.from({ length: 20 }, (_, i) => ({ title: `S${i}`, snippet: long }));
    const out = budgetSourcesForPrompt(sources);
    expect(out).toHaveLength(ASK_QUICK_MAX_SOURCES);
    expect(out[0].title).toBe("S0");
    expect(out.every((s) => (s.snippet || "").length <= 600)).toBe(true);
    expect(out[0].snippet?.endsWith(".")).toBe(true);
  });

  it("leaves short snippets alone and empty ones empty", () => {
    expect(excerpt("Short abstract.")).toBe("Short abstract.");
    expect(excerpt(undefined)).toBe("");
  });

  it("keeps the platform fact sheet out of the system prompts", () => {
    expect(buildAskSearchPrompt({ style: "apa", length: "standard" })).not.toContain(PLATFORM_FACTS);
    expect(buildAskGeneralPrompt({ base: "x", style: "apa", length: "standard" })).not.toContain(PLATFORM_FACTS);
  });

  it("adds the fact sheet only for questions about Scholar Core", () => {
    expect(platformFactsFor("How do I connect my API key in Scholar Core?")).toBe(PLATFORM_FACTS);
    expect(platformFactsFor("What is Knowledge Vault?")).toBe(PLATFORM_FACTS);
    expect(platformFactsFor("Does social media increase polarisation?")).toBe("");
  });
});
