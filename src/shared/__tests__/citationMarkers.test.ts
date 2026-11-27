import { describe, expect, it } from "vitest";
import { normalizeCitationMarkers } from "../citationMarkers";

describe("normalizeCitationMarkers", () => {
  it("turns gpt-oss's native citations into [n]", () => {
    expect(normalizeCitationMarkers("Spacing helps【8†untrusted_source_evidence】. Testing too【10†L4-L9】【3】.")).toBe("Spacing helps[8]. Testing too[10][3].");
    expect(normalizeCitationMarkers("Both agree【2, 5†source】.")).toBe("Both agree[2, 5].");
  });

  it("leaves ordinary text and [n] citations alone", () => {
    expect(normalizeCitationMarkers("Already fine [1], and 【not a citation】.")).toBe("Already fine [1], and 【not a citation】.");
  });
});
