import { describe, it, expect } from "vitest";
import { isExcludedBy, selectionFrom, setChoice, type PreviewSource } from "../sourceSelection";
import { claimBefore, findSupportingPassage } from "../passageMatch";

const list: PreviewSource[] = [
  { title: "Social Theory of International Politics", doi: "10.1017/a1" },
  { title: "Offensive Realism Revisited", doi: "10.1017/b2" },
];

describe("sourceSelection", () => {
  it("toggles and clears choices, and splits pinned from excluded", () => {
    let l = setChoice(list, 0, "pinned");
    l = setChoice(l, 1, "excluded");
    expect(selectionFrom(l).pinned.map((s) => s.doi)).toEqual(["10.1017/a1"]);
    expect(selectionFrom(l).excluded.map((s) => s.doi)).toEqual(["10.1017/b2"]);
    expect(setChoice(l, 0, "pinned")[0].choice).toBeUndefined();
    expect(setChoice(l, 0, "excluded")[0].choice).toBe("excluded");
  });
  it("recognises an excluded work by DOI even when the URL differs", () => {
    expect(isExcludedBy({ title: "x", doi: "https://doi.org/10.1017/B2" }, [{ title: "Other title", doi: "10.1017/b2" }])).toBe(true);
    expect(isExcludedBy({ title: "y", doi: "10.1017/c3" }, [{ title: "z", doi: "10.1017/b2" }])).toBe(false);
  });
});

describe("passageMatch", () => {
  const abstract =
    "We study alliance formation. States balance against threats rather than against raw power, and perceived intent shapes alignment. Data cover 1945 to 2000.";
  it("returns the sentence that supports the claim", () => {
    const r = findSupportingPassage("States balance against perceived threats rather than power.", abstract);
    expect(r?.passage).toMatch(/balance against threats/);
    expect(r?.matched).toEqual(expect.arrayContaining(["balance", "threats"]));
  });
  it("returns null when nothing in the text supports the claim", () => {
    expect(findSupportingPassage("Monetary policy lowers inflation expectations.", abstract)).toBeNull();
  });
  it("finds the claim sentence before a marker", () => {
    const t = "First sentence here. States balance against threats [1] and more.";
    expect(claimBefore(t, t.indexOf("[1]"))).toBe("States balance against threats");
  });
});
