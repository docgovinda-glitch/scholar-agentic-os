import { describe, expect, it } from "vitest";
import { detectIdentifierType } from "../identifier";

describe("detectIdentifierType", () => {
  it("classifies E.164 mobile numbers as phone", () => {
    expect(detectIdentifierType("+15551234567")).toBe("phone");
    expect(detectIdentifierType("+9779800000000")).toBe("phone");
  });

  it("classifies addresses with an @ and a dotted domain as email", () => {
    expect(detectIdentifierType("ada@example.com")).toBe("email");
  });

  it("classifies plain letters, digits, underscore and dash as username", () => {
    expect(detectIdentifierType("john_doe")).toBe("username");
    expect(detectIdentifierType("ada-99")).toBe("username");
  });

  it("trims surrounding whitespace before classifying", () => {
    expect(detectIdentifierType("  john_doe  ")).toBe("username");
    expect(detectIdentifierType("   ")).toBe("unknown");
  });

  it("rejects values that fit no rule", () => {
    expect(detectIdentifierType("")).toBe("unknown");
    expect(detectIdentifierType("john doe")).toBe("unknown");
    expect(detectIdentifierType("15551234567")).toBe("username");
    expect(detectIdentifierType("+1")).toBe("unknown");
    expect(detectIdentifierType("bad@")).toBe("unknown");
  });
});
