import { describe, expect, it } from "vitest";
import { buildDefaultAcademicOutline } from "../services/defaultAcademicOutline";
import { consumeOutlineFocus, requestOutlineFocus } from "../services/outlineGate";
import { hasOutline } from "../types";
import { scopeBrief } from "../../../domain/assignment/briefScoping";

describe("default academic outline", () => {
  it("has the five standard sections, fitted exactly to the word target, marked as not AI", () => {
    const s = buildDefaultAcademicOutline(2000);
    expect(hasOutline(s)).toBe(true);
    expect(s.headings.map((h) => h.title)).toEqual([
      "Introduction",
      "Literature and Context",
      "Theoretical and Critical Analysis",
      "Evaluation and Discussion",
      "Conclusion",
    ]);
    expect(s.headings.reduce((n, h) => n + h.targetWordCount, 0)).toBe(2000);
    expect(s.totalAllocated).toBe(2000);
    expect(s.source).toBe("starter");
    expect(s.isConfirmed).toBe(false);
  });
});

describe("outline focus hand-off", () => {
  it("is consumed once per project", () => {
    requestOutlineFocus("p1");
    expect(consumeOutlineFocus("p2")).toBe(false);
    expect(consumeOutlineFocus("p1")).toBe(true);
    expect(consumeOutlineFocus("p1")).toBe(false);
  });
});

describe("discipline detection for international relations", () => {
  it("reads regional-organisation briefs as social sciences, not business", () => {
    const brief =
      "Critically evaluate how SAARC and BIMSTEC address regional security and geopolitical rivalries. Discuss multilateral organizations, foreign policy, diplomacy and sovereignty in South Asia.";
    expect(scopeBrief(brief).discipline).toBe("social_sciences");
  });
});
