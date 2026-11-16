import { describe, it, expect } from "vitest";
import { stripLineTags, classifyScopeBoundaries } from "../services/scopeClassifier";

describe("Scope Classifier Service", () => {
  it("strips line tags such as [L023] and [L012-L015] cleanly", () => {
    expect(stripLineTags("[L023] Why would Zappos offer $2,000?")).toBe("Why would Zappos offer $2,000?");
    expect(stripLineTags("[L050-L055] Some directive text")).toBe("Some directive text");
    expect(stripLineTags('"leave? [L013]"')).toBe("leave?");
  });

  it("scope comes from the brief only: its questions, and only the exclusions it states", () => {
    const briefText = "Tutorial Week 2. Answer the questions below. Do not describe the company's history. [L004] Avoid using Wikipedia as a source.";
    const questions = ["[L010] Why would a company pay new employees to quit?", "Can culture be changed by changing artifacts alone?"];
    const boundaries = classifyScopeBoundaries(briefText, questions);
    expect(boundaries.summaryBanner).toBe("Found 2 questions in your brief.");
    expect(boundaries.included).toEqual(["Why would a company pay new employees to quit?", "Can culture be changed by changing artifacts alone?"]);
    expect(boundaries.excluded).toEqual(["Do not describe the company's history.", "Avoid using Wikipedia as a source."]);
  });

  it("adds nothing when the brief is silent (no invented rules, no invented count)", () => {
    const boundaries = classifyScopeBoundaries("Discuss monetary policy.", []);
    expect(boundaries).toEqual({ summaryBanner: "No questions were found in the brief.", included: [], excluded: [] });
  });
});
