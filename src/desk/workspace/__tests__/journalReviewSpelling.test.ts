import { describe, it, expect } from "vitest";
import { REFEREE_PERSONAS, personaDescription } from "../RefereeRebuttalMode";
import { spellingLabel, spellingVariant } from "../../../domain/journal/blueprintFunnel";
import { peerReviewSystemPrompt } from "../../../../server/src/services/prompts/journalPrompts";

const editor = REFEREE_PERSONAS.find((p) => p.role === "Formal Editor")!;

describe("Review follows the project's spelling setting", () => {
  it("reads the stored spelling choice", () => {
    expect(spellingVariant("US English")).toBe("us");
    expect(spellingVariant("British / Oxford English (-ise/-our/-re)")).toBe("british");
    expect(spellingVariant(undefined)).toBe("british");
    expect(spellingLabel("British / Oxford English (-ise/-our/-re)")).toBe("British / Oxford English");
  });

  it("the Formal Editor card names US or British spelling", () => {
    expect(personaDescription(editor, "US English")).toMatch(/US English spelling/);
    expect(personaDescription(editor, "US English")).not.toMatch(/British/);
    expect(personaDescription(editor, "British / Oxford English (-ise/-our/-re)")).toMatch(/British English orthography/);
  });

  it("the review prompt asks the Formal Editor for the same convention", () => {
    expect(peerReviewSystemPrompt("us")).toMatch(/US English spelling/);
    expect(peerReviewSystemPrompt("us")).not.toMatch(/British English/);
    expect(peerReviewSystemPrompt()).toMatch(/British English orthography/);
  });
});
