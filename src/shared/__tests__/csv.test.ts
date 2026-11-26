import { describe, it, expect } from "vitest";
import { csvCell } from "../csv";

describe("csvCell", () => {
  it("quotes text and doubles inner quotes", () => {
    expect(csvCell('He said "hi", twice')).toBe('"He said ""hi"", twice"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(2024)).toBe('"2024"');
  });

  it("neutralises text a spreadsheet would run as a formula", () => {
    for (const hostile of ["=HYPERLINK(\"http://x\",\"a\")", "+cmd|' /C calc'!A0", "-2+3+cmd", "@SUM(1+1)", "\t=1+1", "\r=1+1"]) {
      expect(csvCell(hostile).startsWith(`"'`), hostile).toBe(true);
    }
  });

  it("leaves ordinary text and plain numbers alone", () => {
    expect(csvCell("Methods, section 2")).toBe('"Methods, section 2"');
    expect(csvCell("-5")).toBe('"-5"');
    expect(csvCell("+3.5")).toBe('"+3.5"');
    expect(csvCell("p = .05")).toBe('"p = .05"');
  });

  it("can flatten line breaks", () => {
    expect(csvCell("a\r\nb\nc", { singleLine: true })).toBe('"a b c"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
});
