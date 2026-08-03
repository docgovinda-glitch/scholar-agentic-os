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

  it("has 16 entries, including the additions beyond the original per-family representative", () => {
    const ids = OUTPUT_TYPES.map((s) => s.id).sort();
    expect(ids).toEqual([
      "OT-01", "OT-02", "OT-03", "OT-04", "OT-06", "OT-07", "OT-08", "OT-09",
      "OT-10", "OT-11", "OT-13", "OT-15", "OT-16", "OT-18", "OT-19", "OT-22",
    ]);
  });

  it("the short_form additions each exercise a structure variant the original 6 entries didn't", () => {
    const variants = new Set(OUTPUT_TYPES.map((s) => s.structure.variant));
    expect(variants.has("argumentative")).toBe(true); // OT-02
    expect(variants.has("thematic")).toBe(true); // OT-13
  });
});
