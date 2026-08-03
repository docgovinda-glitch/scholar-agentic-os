import { describe, it, expect, beforeEach } from "vitest";
import {
  tryParseStructuredResponse,
  structuredChangesToDiff,
  heuristicReason,
  fallbackDiff,
  __resetStructuredIdsForTests,
} from "../structuredDiff";

describe("app/studio: structured response parsing", () => {
  beforeEach(() => __resetStructuredIdsForTests());

  it("parses a well-formed structured JSON response", () => {
    const raw = JSON.stringify({
      revised: "The cohort comprised 240 participants.",
      changes: [{ original: "sample", replacement: "cohort", reason: "More precise term." }],
    });
    const parsed = tryParseStructuredResponse(raw);
    expect(parsed).toBeDefined();
    expect(parsed!.changes).toHaveLength(1);
  });

  it("tolerates a markdown code fence around the JSON", () => {
    const raw = "```json\n" + JSON.stringify({ revised: "x", changes: [] }) + "\n```";
    const parsed = tryParseStructuredResponse(raw);
    expect(parsed).toBeDefined();
    expect(parsed!.revised).toBe("x");
  });

  it("returns undefined for non-JSON text", () => {
    expect(tryParseStructuredResponse("Sure, here is the revised text: ...")).toBeUndefined();
  });

  it("returns undefined when the shape doesn't match (missing changes array)", () => {
    expect(tryParseStructuredResponse(JSON.stringify({ revised: "x" }))).toBeUndefined();
  });

  it("filters out malformed entries in the changes array without failing the whole parse", () => {
    const raw = JSON.stringify({
      revised: "x",
      changes: [{ original: "a", replacement: "b", reason: "ok" }, { bogus: true }],
    });
    const parsed = tryParseStructuredResponse(raw);
    expect(parsed!.changes).toHaveLength(1);
  });
});

describe("app/studio: structuredChangesToDiff", () => {
  beforeEach(() => __resetStructuredIdsForTests());

  it("locates each original snippet and builds a hunk with the model's own reason", () => {
    const original = "The sample comprised 240 participants recruited from three sites.";
    const response = {
      revised: "The cohort comprised 240 participants recruited from three sites.",
      changes: [{ original: "sample", replacement: "cohort", reason: "Avoids repeating 'sample' later." }],
    };
    const hunks = structuredChangesToDiff(original, response);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].reason).toBe("Avoids repeating 'sample' later.");
    expect(hunks[0].originalStart).toBe(original.indexOf("sample"));
  });

  it("drops a change whose original snippet cannot be located, without throwing", () => {
    const original = "The sample comprised 240 participants.";
    const response = {
      revised: "x",
      changes: [{ original: "this text is not present", replacement: "y", reason: "z" }],
    };
    expect(() => structuredChangesToDiff(original, response)).not.toThrow();
    expect(structuredChangesToDiff(original, response)).toHaveLength(0);
  });

  it("does not rematch the same span for duplicate original snippets — advances the search cursor", () => {
    const original = "the data the data";
    const response = {
      revised: "x",
      changes: [
        { original: "the data", replacement: "the results", reason: "first" },
        { original: "the data", replacement: "the outcomes", reason: "second" },
      ],
    };
    const hunks = structuredChangesToDiff(original, response);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].originalStart).toBe(0);
    expect(hunks[1].originalStart).toBeGreaterThan(hunks[0].originalEnd - 1);
  });
});

describe("app/studio: heuristic fallback", () => {
  it("labels punctuation-only changes distinctly", () => {
    expect(heuristicReason("clarity", ",", ";")).toBe("Punctuation adjusted.");
  });

  it("labels transition insertions distinctly", () => {
    expect(heuristicReason("flow", "", "however, ")).toBe("Transition added for flow.");
  });

  it("falls back to a level-specific generic reason for larger structural changes", () => {
    const reason = heuristicReason(
      "rewrite",
      "The study which was conducted by the team found results that were interesting",
      "The team's study found interesting results"
    );
    expect(reason).toBe("Rewritten for concision and force.");
  });

  it("fallbackDiff produces hunks covering the whole passage when structured parsing is unavailable", () => {
    const hunks = fallbackDiff("clarity", "the old text here", "the new text here");
    expect(hunks.length).toBeGreaterThan(0);
    for (const h of hunks) expect(h.reason.length).toBeGreaterThan(0);
  });
});
