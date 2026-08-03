import { describe, it, expect } from "vitest";
import OUTPUT_TYPES from "../catalogData";
import { validateCatalog } from "../validate";

describe("app/atlas: catalog data validity", () => {
  it("the whole catalog passes validation with zero issues", () => {
    const issues = validateCatalog(OUTPUT_TYPES);
    expect(issues).toEqual([]);
  });

  it("has a representative entry for every workflow variant", () => {
    const variants = new Set(OUTPUT_TYPES.map((s) => s.workflowVariant));
    expect(variants).toEqual(
      new Set(["short_form", "long_form_chaptered", "venue_targeted", "proposal", "applied", "visual"])
    );
  });

  it("has a representative entry for every compliance profile except (deliberately) professional", () => {
    const profiles = new Set(OUTPUT_TYPES.map((s) => s.complianceProfile));
    expect(profiles).toEqual(new Set(["coursework", "institutional", "venue", "funder"]));
  });

  it("every entry has a unique id following the OT-NN convention", () => {
    const ids = OUTPUT_TYPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^OT-\d{2}$/);
  });
});
