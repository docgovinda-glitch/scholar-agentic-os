import { describe, expect, it } from "vitest";
import { decideAskMode, isTimeSensitiveQuery } from "../askRouting";

describe("decideAskMode", () => {
  it("honours an explicit mode", () => {
    expect(decideAskMode({ query: "hello", requestedMode: "deep-research" })).toBe("deep-research");
    expect(decideAskMode({ query: "latest inflation rate", requestedMode: "normal" })).toBe("chat");
  });

  it("grounds substantive questions on any subject by default", () => {
    expect(decideAskMode({ query: "Why did the Roman Republic fall?" })).toBe("search");
    expect(decideAskMode({ query: "How do mRNA vaccines trigger an immune response" })).toBe("search");
    expect(decideAskMode({ query: "Compare Keynesian and monetarist views on inflation" })).toBe("search");
  });

  it("answers directly when no search is needed", () => {
    expect(decideAskMode({ query: "thanks!" })).toBe("chat");
    expect(decideAskMode({ query: "Translate this paragraph into French: bonjour" })).toBe("chat");
    expect(decideAskMode({ query: "write a python function that reverses a string" })).toBe("chat");
    expect(decideAskMode({ query: "12 * (3 + 4)" })).toBe("chat");
  });

  it("does not match words inside other words", () => {
    expect(decideAskMode({ query: "I know" })).toBe("chat");
  });

  it("answers from attached files unless asked to check elsewhere, and routes deep research phrases", () => {
    expect(decideAskMode({ query: "Summarise the main argument", hasFiles: true })).toBe("chat");
    expect(decideAskMode({ query: "Fact check this document", hasFiles: true })).toBe("search");
    expect(decideAskMode({ query: "Do a systematic literature review on sleep and memory" })).toBe("deep-research");
  });

  it("recognises time-sensitive questions with the current year", () => {
    expect(isTimeSensitiveQuery("what happened in 2026", new Date("2026-06-01"))).toBe(true);
    expect(isTimeSensitiveQuery("what happened in 1998", new Date("2026-06-01"))).toBe(false);
  });
});
