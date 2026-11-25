import { describe, it, expect } from "vitest";
import { frameworkForDiscipline } from "../evidenceFramework";

describe("evidenceFramework", () => {
  it("never uses PICO for non-clinical disciplines", () => {
    expect(frameworkForDiscipline("social_sciences").stageLabel).not.toMatch(/PICO/);
    expect(frameworkForDiscipline("law").id).toBe("humanities_law");
    expect(frameworkForDiscipline("stem").id).toBe("engineering");
    expect(frameworkForDiscipline("health").stageLabel).toMatch(/PICO/);
    expect(frameworkForDiscipline("auto").id).toBe("social");
  });
});
