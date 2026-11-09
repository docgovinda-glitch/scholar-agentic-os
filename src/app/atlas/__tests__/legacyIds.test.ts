import { describe, expect, it } from "vitest";
import { normalizeOutputTypeId } from "../legacyIds";

describe("normalizeOutputTypeId", () => {
  it("maps the old proposal and thesis ids to the catalog ids", () => {
    expect(normalizeOutputTypeId("OT-19")).toBe("OT-15");
    expect(normalizeOutputTypeId("OT-09")).toBe("OT-07");
  });
  it("leaves every other id, and non-strings, unchanged", () => {
    expect(normalizeOutputTypeId("OT-10")).toBe("OT-10");
    expect(normalizeOutputTypeId("OT-15")).toBe("OT-15");
    expect(normalizeOutputTypeId(undefined)).toBeUndefined();
  });
});
