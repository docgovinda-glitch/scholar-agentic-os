import { describe, it, expect } from "vitest";
import { COUNTRIES, DEFAULT_COUNTRY_ISO2, findCountry, normalizeE164, isValidE164, e164Problem } from "../countries";

describe("COUNTRIES", () => {
  it("has no duplicate ISO2 codes", () => {
    const seen = new Set(COUNTRIES.map((c) => c.iso2));
    expect(seen.size).toBe(COUNTRIES.length);
  });

  it("every dial code starts with +", () => {
    for (const c of COUNTRIES) expect(c.dialCode.startsWith("+")).toBe(true);
  });

  it("has a default country that resolves", () => {
    expect(findCountry(DEFAULT_COUNTRY_ISO2)).toBeDefined();
  });
});

describe("normalizeE164", () => {
  it("combines dial code and local digits", () => {
    expect(normalizeE164("+977", "9841234567")).toBe("+9779841234567");
  });

  it("strips non-digit characters from the local number", () => {
    expect(normalizeE164("+1", "(555) 010-0100")).toBe("+15550100100");
  });

  it("strips a leading zero from the local number", () => {
    expect(normalizeE164("+44", "07911123456")).toBe("+447911123456");
  });

  it("returns null when there are no local digits", () => {
    expect(normalizeE164("+977", "")).toBeNull();
    expect(normalizeE164("+977", "   ")).toBeNull();
  });
});

describe("isValidE164", () => {
  it("accepts a well-formed E.164 number", () => {
    expect(isValidE164("+9779841234567")).toBe(true);
  });

  it("rejects missing +, non-digits, and out-of-range lengths", () => {
    expect(isValidE164("9779841234567")).toBe(false);
    expect(isValidE164("+977abc")).toBe(false);
    expect(isValidE164("+0123456")).toBe(false); // leading 0 after + not allowed
    expect(isValidE164("+1")).toBe(false); // too short
  });
});

describe("e164Problem", () => {
  it("requires a number", () => {
    expect(e164Problem("+977", "")).toMatch(/required/i);
  });

  it("flags an invalid combination", () => {
    expect(e164Problem("+977", "1")).toMatch(/valid phone number/i);
  });

  it("accepts a valid combination", () => {
    expect(e164Problem("+977", "9841234567")).toBeNull();
  });
});
