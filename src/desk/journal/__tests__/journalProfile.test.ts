import { describe, it, expect } from "vitest";
import { blueprintFromStructure, citationStyleOption } from "../journalProfile";
import { manuscriptUnits } from "../manuscriptModel";

describe("journal profile → plan", () => {
  it("builds the outline from the journal's own sections, sized to its word limit", () => {
    const bp = blueprintFromStructure("p", ["Abstract", "Introduction", "Materials and Methods", "Results", "Discussion"], 5000);
    expect(bp.sections.map((s) => s.sectionName)).toEqual(["Abstract", "Introduction", "Materials and Methods", "Results", "Discussion"]);
    expect(bp.sections[0].targetWords).toBe(200);
    expect(Math.abs(bp.allocatedTotalWords - 5000)).toBeLessThanOrEqual(100);
    // Each section is one writing unit in the Studio, in the journal's order.
    expect(manuscriptUnits(bp).map((u) => [u.title, u.kind])).toEqual([
      ["Abstract", "abstract"],
      ["Introduction", "introduction"],
      ["Materials and Methods", "methods"],
      ["Results", "results"],
      ["Discussion", "discussion"],
    ]);
  });

  it("maps the style the guidelines name to one the workspace formats, or none", () => {
    expect(citationStyleOption("IEEE numbered style")).toBe("IEEE");
    expect(citationStyleOption("APA 7th edition")).toBe("APA 7");
    expect(citationStyleOption("Chicago notes and bibliography")).toBe("Chicago Notes");
    expect(citationStyleOption("ACS style")).toBeUndefined();
  });
});
