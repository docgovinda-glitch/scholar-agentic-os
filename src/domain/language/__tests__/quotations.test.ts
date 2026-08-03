import { describe, it, expect } from "vitest";
import { findQuotedSpans, overlapsQuotation, excludeQuotedRanges } from "../quotations";

describe("domain/language: quotation protection", () => {
  it("finds a straight-quoted span", () => {
    const spans = findQuotedSpans('She wrote that "the effect was significant" in her conclusion.');
    expect(spans).toHaveLength(1);
  });

  it("finds a curly-quoted span", () => {
    const spans = findQuotedSpans("The author noted “a marked improvement” in outcomes.");
    expect(spans).toHaveLength(1);
  });

  it("detects overlap correctly", () => {
    const text = 'As Chen (2021) writes, "the results were unexpected."';
    const spans = findQuotedSpans(text);
    const quoteStart = text.indexOf('"');
    const quoteEnd = text.lastIndexOf('"') + 1;
    expect(overlapsQuotation(spans, quoteStart + 2, quoteStart + 5)).toBe(true);
    expect(overlapsQuotation(spans, 0, 5)).toBe(false);
  });

  it("excludes candidate ranges that overlap a quotation, keeps ones that do not", () => {
    const text = 'Chen argues "this was crude" but the data disagrees.';
    const quoteStart = text.indexOf('"');
    const quoteEnd = text.lastIndexOf('"') + 1;
    const candidates = [
      { id: "inside", originalStart: quoteStart + 2, originalEnd: quoteStart + 6 },
      { id: "outside", originalStart: text.indexOf("data"), originalEnd: text.indexOf("data") + 4 },
    ];
    const kept = excludeQuotedRanges(text, candidates);
    expect(kept.map((c) => c.id)).toEqual(["outside"]);
  });

  it("has no protected spans in text with no quotation marks", () => {
    expect(findQuotedSpans("No quotes here at all.")).toHaveLength(0);
  });
});
