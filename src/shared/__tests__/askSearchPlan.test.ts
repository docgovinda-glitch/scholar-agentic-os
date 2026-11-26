import { describe, expect, it } from "vitest";
import { askSearchPlanPrompt, parseAskSearchPlan } from "../askPrompts";
import { askNeedsSearchPlan } from "../askRouting";

describe("parseAskSearchPlan", () => {
  it("reads a search decision with its query", () => {
    expect(parseAskSearchPlan('{"search": true, "query": " metformin side effects  elderly "}')).toEqual({ search: true, query: "metformin side effects elderly" });
  });
  it("reads a no-search decision and drops any query", () => {
    expect(parseAskSearchPlan({ search: false, query: "ignored" })).toEqual({ search: false, query: "" });
  });
  it("finds the JSON inside surrounding text", () => {
    expect(parseAskSearchPlan('Sure.\n```json\n{"search": false, "query": ""}\n```')).toEqual({ search: false, query: "" });
  });
  it("returns null for anything that is not a clear decision", () => {
    expect(parseAskSearchPlan("maybe")).toBeNull();
    expect(parseAskSearchPlan('{"search": "yes"}')).toBeNull();
    expect(parseAskSearchPlan('{"search": true, "query": ""}')).toBeNull();
    expect(parseAskSearchPlan(null)).toBeNull();
  });
});

describe("askSearchPlanPrompt", () => {
  it("includes only the last three earlier questions", () => {
    const text = askSearchPlanPrompt("What about children?", ["q1", "q2", "q3", "q4"]);
    expect(text).not.toContain("q1");
    expect(text).toContain("- q4");
    expect(text).toContain("Question: What about children?");
  });
});

describe("askNeedsSearchPlan", () => {
  it("asks the model only when the rules cannot tell", () => {
    expect(askNeedsSearchPlan({ query: "How does metformin affect kidney function?" })).toBe(true);
  });
  it("leaves explicit modes, attachments and clear cases to the rules", () => {
    expect(askNeedsSearchPlan({ query: "How does metformin work?", requestedMode: "search" })).toBe(false);
    expect(askNeedsSearchPlan({ query: "How does metformin work?", hasFiles: true })).toBe(false);
    expect(askNeedsSearchPlan({ query: "hello" })).toBe(false);
    expect(askNeedsSearchPlan({ query: "rewrite this paragraph to be shorter" })).toBe(false);
    expect(askNeedsSearchPlan({ query: "latest inflation rate in Nepal" })).toBe(false);
    expect(askNeedsSearchPlan({ query: "deep research on soil erosion" })).toBe(false);
  });
});
