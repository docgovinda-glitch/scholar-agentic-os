import { describe, it, expect } from "vitest";
import { trimToLastSentence } from "../draftPartials";

describe("trimToLastSentence", () => {
  it("drops an unfinished last sentence and keeps paragraphs", () => {
    expect(trimToLastSentence("One idea holds.\n\nAnother follows (Smith, 2020). Then the mod")).toBe("One idea holds.\n\nAnother follows (Smith, 2020).");
  });
  it("keeps a closing quote after the full stop", () => {
    expect(trimToLastSentence('He said "it works." And then')).toBe('He said "it works."');
  });
  it("keeps text with no complete sentence as it is", () => {
    expect(trimToLastSentence("Groups shape decisions  ")).toBe("Groups shape decisions");
    expect(trimToLastSentence("")).toBe("");
  });
});
