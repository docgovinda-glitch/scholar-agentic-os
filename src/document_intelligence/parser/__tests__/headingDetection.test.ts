import { describe, it, expect } from "vitest";
import { detectHeadings } from "../headingDetection";

describe("detectHeadings — Stage 7 sample-document structure learning", () => {
  it("detects standard academic section names verbatim, in document order", () => {
    const text = `Abstract

This paper examines dharmic governance frameworks in detail across several long paragraphs of prose that goes on for a while.

Introduction

Corporate social responsibility has evolved considerably over recent decades, with numerous scholars debating its scope.

Methodology

This study employs a theoretical-conceptual analytical approach drawing on textual hermeneutics.

Conclusion

This study concludes with several implications for future research directions and policy considerations.`;

    expect(detectHeadings(text)).toEqual(["Abstract", "Introduction", "Methodology", "Conclusion"]);
  });

  it("strips leading numbering from detected headings", () => {
    const text = `1. Introduction

Some real introductory prose spanning a full paragraph of content here.

2.1 Research Design

Some real methodology prose spanning a full paragraph of content here.`;

    expect(detectHeadings(text)).toEqual(["Introduction", "Research Design"]);
  });

  it("detects an ALL CAPS standalone line as a heading even if not a known section name", () => {
    const text = `CUSTOM JOURNAL SECTION NAME

Some real prose content spanning a full paragraph goes here for context.`;

    expect(detectHeadings(text)).toEqual(["CUSTOM JOURNAL SECTION NAME"]);
  });

  it("detects a short standalone Title Case line surrounded by blank lines as a plausible custom heading", () => {
    const text = `Theoretical Grounding and Dharmic Ethics

Some real prose content spanning a full paragraph goes here for context and continues on.`;

    expect(detectHeadings(text)).toEqual(["Theoretical Grounding and Dharmic Ethics"]);
  });

  it("does not detect an ordinary sentence as a heading (ends in punctuation)", () => {
    const text = `This is a real sentence of body prose that ends with a period.

Another real sentence of body prose that also ends with punctuation!`;

    expect(detectHeadings(text)).toEqual([]);
  });

  it("does not detect a long line (over 100 chars) as a heading, even without trailing punctuation", () => {
    const longLine = "A" + "x".repeat(105);
    const text = `${longLine}\n\nSome real prose content here.`;

    expect(detectHeadings(text)).toEqual([]);
  });

  it("deduplicates a repeated heading, keeping only its first real occurrence", () => {
    const text = `Introduction

Some real prose spanning a full paragraph of content here for context.

Introduction

This should not be added again since it's a duplicate heading text.`;

    expect(detectHeadings(text)).toEqual(["Introduction"]);
  });

  it("returns an empty array for empty or whitespace-only text, never a fabricated placeholder", () => {
    expect(detectHeadings("")).toEqual([]);
    expect(detectHeadings("   \n\n  ")).toEqual([]);
  });

  it("does not detect a short line embedded directly within a paragraph (not preceded/followed by a blank line) as a heading", () => {
    const text = `This is the first line of a paragraph.
Short line.
This is the last line of the same paragraph, all part of one block of text.`;

    expect(detectHeadings(text)).toEqual([]);
  });
});
