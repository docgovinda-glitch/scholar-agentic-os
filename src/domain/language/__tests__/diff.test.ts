import { describe, it, expect, beforeEach } from "vitest";
import { applyChanges, buildDiff, __resetDiffIdsForTests } from "../diff";

describe("domain/language: diff construction", () => {
  beforeEach(() => __resetDiffIdsForTests());

  it("produces no changes for identical text", () => {
    const changes = buildDiff("The results were significant.", "The results were significant.", () => "reason");
    expect(changes).toHaveLength(0);
  });

  it("finds a single-word replacement", () => {
    const changes = buildDiff(
      "the results suggest a relationship",
      "the results demonstrate a relationship",
      () => "strengthens the claim"
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].originalText.trim()).toBe("suggest");
    expect(changes[0].replacementText.trim()).toBe("demonstrate");
  });

  it("assigns the category passed by the caller", () => {
    const changes = buildDiff("suggest", "demonstrate", () => "x", "content");
    expect(changes[0].category).toBe("content");
  });

  it("round-trips: applying all accepted changes reconstructs the replacement text", () => {
    const original = "Analysis proceeded in two stages, first descriptive then inferential.";
    const replacement = "Analysis proceeded in three phases, first descriptive, then correlational, then inferential.";
    const changes = buildDiff(original, replacement, () => "reason");
    const acceptedIds = new Set(changes.map((c) => c.id));
    const result = applyChanges(original, changes, acceptedIds);
    expect(result).toBe(replacement);
  });

  it("rejecting all changes reconstructs the original text exactly", () => {
    const original = "The sample comprised 240 participants.";
    const replacement = "The cohort comprised 240 participants recruited nationally.";
    const changes = buildDiff(original, replacement, () => "reason");
    const result = applyChanges(original, changes, new Set());
    expect(result).toBe(original);
  });

  it("supports partial acceptance — mixing accepted and rejected hunks", () => {
    const original = "The old sample was small and the old method was crude.";
    const replacement = "The new sample was small and the new method was crude.";
    const changes = buildDiff(original, replacement, () => "reason");
    expect(changes.length).toBeGreaterThanOrEqual(2);
    // accept only the first hunk
    const result = applyChanges(original, changes, new Set([changes[0].id]));
    expect(result).toContain("new sample");
    expect(result).toContain("old method");
  });
});
