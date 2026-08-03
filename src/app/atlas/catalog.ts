/**
 * The catalog registry — query API over OutputTypeSpec entries.
 *
 * Spec: docs/01-product/14-OUTPUT-TYPE-CATALOG.md §11: "the catalog is
 * data, not code... A new type requires: a real submission example, a
 * documented structure source, and a golden-set test." This module is the
 * engine that data plugs into; src/app/atlas/catalogData.ts is the data.
 */

import type { OutputFamily } from "../../domain/project/types";
import type { OutputTypeSpec } from "./types";
import { validateCatalog } from "./validate";

export class Catalog {
  private readonly byId = new Map<string, OutputTypeSpec>();

  constructor(specs: OutputTypeSpec[]) {
    const issues = validateCatalog(specs);
    if (issues.length > 0) {
      throw new Error(
        `Catalog failed validation:\n${issues.map((i) => `  [${i.outputTypeId}${i.field ? `.${i.field}` : ""}] ${i.message}`).join("\n")}`
      );
    }
    for (const spec of specs) this.byId.set(spec.id, spec);
  }

  get(id: string): OutputTypeSpec | undefined {
    return this.byId.get(id);
  }

  getOrThrow(id: string): OutputTypeSpec {
    const spec = this.get(id);
    if (!spec) throw new Error(`No output type "${id}" in the catalog.`);
    return spec;
  }

  list(): OutputTypeSpec[] {
    return [...this.byId.values()];
  }

  listByFamily(family: OutputFamily): OutputTypeSpec[] {
    return this.list().filter((s) => s.family === family);
  }

  /** Case-insensitive search over label and aliases — the "help me choose" path (docs 12 F-PRJ-1). */
  search(query: string): OutputTypeSpec[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.list();
    return this.list().filter(
      (s) => s.label.toLowerCase().includes(q) || s.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }
}
