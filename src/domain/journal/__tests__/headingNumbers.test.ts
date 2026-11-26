import { describe, it, expect } from "vitest";
import { createHeadingNumberer, isUnnumberedHeading, numberHeadings, numberingFor, numberingForStyle } from "../headingNumbers";

describe("numberingFor", () => {
  it("maps Word templates to the numbering journals use", () => {
    expect(numberingFor("ieee")).toBe("ieee");
    expect(numberingFor("apa7")).toBe("none");
    expect(numberingFor("nature")).toBe("none");
    expect(numberingFor("elsevier")).toBe("decimal");
    expect(numberingFor("acm")).toBe("decimal");
    expect(numberingFor(undefined)).toBe("decimal");
  });
});

describe("createHeadingNumberer", () => {
  it("numbers decimally and restarts sub-sections under a new section", () => {
    const n = createHeadingNumberer("decimal");
    expect([n(0, "Intro"), n(0, "Methods"), n(1, "A"), n(1, "B"), n(2, "x"), n(0, "Results"), n(1, "C")]).toEqual(["1. ", "2. ", "2.1. ", "2.2. ", "2.2.1. ", "3. ", "3.1. "]);
  });

  it("uses Roman numerals, letters and numbers for IEEE", () => {
    const n = createHeadingNumberer("ieee");
    expect([n(0, "a"), n(0, "b"), n(1, "c"), n(1, "d"), n(2, "e"), n(0, "f"), n(1, "g")]).toEqual(["I. ", "II. ", "A. ", "B. ", "1) ", "III. ", "A. "]);
    const many = createHeadingNumberer("ieee");
    for (let i = 0; i < 8; i++) many(0, `s${i}`);
    expect(many(0, "ninth")).toBe("IX. ");
  });

  it("prints nothing for the 'none' style, and never numbers back matter", () => {
    const none = createHeadingNumberer("none");
    expect(none(0, "Intro")).toBe("");
    const dec = createHeadingNumberer("decimal");
    expect(dec(0, "Intro")).toBe("1. ");
    expect(dec(0, "References")).toBe("");
    expect(dec(0, "Declarations")).toBe("");
    expect(dec(0, "Figures and tables")).toBe("");
    expect(dec(0, "Methods")).toBe("2. ");
  });

  it("never goes deeper than one below what is numbered", () => {
    const n = createHeadingNumberer("decimal");
    expect(n(3, "Orphan")).toBe("1. ");
  });
});

describe("isUnnumberedHeading", () => {
  it("recognises closing matter", () => {
    for (const t of ["References", "Acknowledgements", "Appendix A", "Data availability", "Figures and tables"]) expect(isUnnumberedHeading(t), t).toBe(true);
    expect(isUnnumberedHeading("Methods")).toBe(false);
  });
});

describe("numberingForStyle", () => {
  it("follows the journal family behind each citation style", () => {
    expect(numberingForStyle("ieee")).toBe("ieee");
    expect(numberingForStyle("harvard")).toBe("decimal");
    for (const s of ["apa", "vancouver", "chicago", "mla"] as const) expect(numberingForStyle(s), s).toBe("none");
  });
});

describe("numberHeadings", () => {
  const md = "## Abstract\n\nSummary.\n\n## Introduction\n\nA.\n\n## Methods\n\nB.\n\n### § Participants\n\nC.\n\n## Results\n\nD.\n\n## References\n\nSmith (2020).";

  it("numbers decimally, skipping the abstract and the references, and removes the § marker", () => {
    expect(numberHeadings(md, "decimal")).toBe(
      "## Abstract\n\nSummary.\n\n## 1. Introduction\n\nA.\n\n## 2. Methods\n\nB.\n\n### 2.1. Participants\n\nC.\n\n## 3. Results\n\nD.\n\n## References\n\nSmith (2020)."
    );
  });

  it("numbers IEEE-style", () => {
    const out = numberHeadings(md, "ieee");
    expect(out).toContain("## I. Introduction");
    expect(out).toContain("## II. Methods");
    expect(out).toContain("### A. Participants");
  });

  it("only removes the marker when no numbers are wanted", () => {
    expect(numberHeadings(md, "none")).toBe(md.replace("§ ", ""));
  });

  it("leaves a manuscript the author numbered themselves alone", () => {
    const own = "## 1. Introduction\n\nA.\n\n## 2 Methods\n\nB.\n\n### § Sampling\n\nC.";
    expect(numberHeadings(own, "decimal")).toBe(own.replace("§ ", ""));
  });

  it("does not number a title-level heading when there are sections under it, and keeps the text between headings", () => {
    const out = numberHeadings("# My Title\n\nIntro line.\n\n\n## Methods\n\nB.", "decimal");
    expect(out).toBe("# My Title\n\nIntro line.\n\n\n## 1. Methods\n\nB.");
  });

  it("is not fooled by headings inside a multi-line block, and does not number twice", () => {
    const text = "## Methods\n\nLine one\n## not a heading block\nline";
    expect(numberHeadings(text, "decimal")).toBe("## 1. Methods\n\nLine one\n## not a heading block\nline");
    const once = numberHeadings(md, "decimal");
    expect(numberHeadings(once, "decimal")).toBe(once);
  });
});
