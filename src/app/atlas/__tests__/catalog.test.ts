import { describe, it, expect } from "vitest";
import { catalog } from "../atlas";

describe("app/atlas: Catalog query API", () => {
  it("gets a known output type by id", () => {
    const spec = catalog.get("OT-07");
    expect(spec).toBeDefined();
    expect(spec!.label).toBe("Master's Thesis");
  });

  it("returns undefined for an unknown id", () => {
    expect(catalog.get("OT-999")).toBeUndefined();
  });

  it("getOrThrow throws with a clear message for an unknown id", () => {
    expect(() => catalog.getOrThrow("OT-999")).toThrow(/No output type/);
  });

  it("lists all entries", () => {
    expect(catalog.list().length).toBeGreaterThanOrEqual(6);
  });

  it("filters by family", () => {
    const longForm = catalog.listByFamily("long_form");
    expect(longForm.every((s) => s.family === "long_form")).toBe(true);
    expect(longForm.length).toBeGreaterThan(0);
  });

  it("searches by label, case-insensitively", () => {
    const results = catalog.search("thesis");
    expect(results.some((s) => s.id === "OT-07")).toBe(true);
  });

  it("searches by alias", () => {
    const results = catalog.search("manuscript");
    expect(results.some((s) => s.id === "OT-10")).toBe(true);
  });

  it("an empty query returns everything (the 'browse' path)", () => {
    expect(catalog.search("").length).toBe(catalog.list().length);
  });

  it("throws at construction if given an invalid catalog", async () => {
    const { Catalog } = await import("../catalog");
    const bad = [
      {
        ...catalog.getOrThrow("OT-01"),
        structure: { ...catalog.getOrThrow("OT-01").structure, sections: [] },
      },
    ];
    expect(() => new Catalog(bad as any)).toThrow(/failed validation/);
  });
});
