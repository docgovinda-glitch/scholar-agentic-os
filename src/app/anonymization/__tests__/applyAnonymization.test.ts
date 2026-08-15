import { describe, it, expect } from "vitest";
import { applyAnonymization, AnonymizationApplyError } from "../applyAnonymization";
import { emptyDocument } from "../../../domain/document/model";
import { appendBlock } from "../../../domain/document/ops";
import type { RedactionProposal } from "../../../domain/anonymization/types";

function proposal(overrides: Partial<RedactionProposal> = {}): RedactionProposal {
  return {
    blockId: "acknowledgements",
    category: "acknowledgement",
    originalText: "Dr. Jane Smith",
    replacementText: "[name removed for review]",
    reason: "Names a specific person.",
    ...overrides,
  };
}

function doc() {
  let d = emptyDocument("d1", "Paper");
  d = appendBlock(d, "acknowledgements", "paragraph", "We thank Dr. Jane Smith for her support.");
  d = appendBlock(d, "introduction", "paragraph", "Our previous work established the baseline.");
  return d;
}

describe("app/anonymization: applyAnonymization", () => {
  it("replaces the exact substring in the named block, leaving other blocks untouched", () => {
    const result = applyAnonymization(doc(), [proposal()]);
    expect(result.blocks.find((b) => b.id === "acknowledgements")!.text).toBe("We thank [name removed for review] for her support.");
    expect(result.blocks.find((b) => b.id === "introduction")!.text).toBe("Our previous work established the baseline.");
  });

  it("does not mutate the input document", () => {
    const input = doc();
    const originalText = input.blocks[0].text;
    applyAnonymization(input, [proposal()]);
    expect(input.blocks[0].text).toBe(originalText);
  });

  it("applies multiple accepted proposals, including more than one against the same block, in order", () => {
    const result = applyAnonymization(doc(), [
      proposal({ originalText: "Dr. Jane Smith", replacementText: "[name removed]" }),
      proposal({ blockId: "introduction", originalText: "Our previous work", replacementText: "Prior work" }),
    ]);
    expect(result.blocks.find((b) => b.id === "acknowledgements")!.text).toContain("[name removed]");
    expect(result.blocks.find((b) => b.id === "introduction")!.text).toBe("Prior work established the baseline.");
  });

  it("throws AnonymizationApplyError for a block that doesn't exist", () => {
    expect(() => applyAnonymization(doc(), [proposal({ blockId: "no-such-block" })])).toThrow(AnonymizationApplyError);
  });

  it("throws AnonymizationApplyError when the original text is no longer present (document changed since the proposal was made)", () => {
    expect(() => applyAnonymization(doc(), [proposal({ originalText: "text that is not in the block" })])).toThrow(AnonymizationApplyError);
  });

  it("an empty accepted list returns the document unchanged (structurally equal, new reference)", () => {
    const input = doc();
    const result = applyAnonymization(input, []);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });
});
