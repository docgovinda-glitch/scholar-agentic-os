/**
 * Which Atlas output types a real user can discover/create right now.
 *
 * This is a product-surface restriction, not an engine-capability removal —
 * all 24 catalog entries in src/app/atlas/catalogData.ts stay fully
 * implemented, valid, and reachable by id (GET /api/atlas/output-types/:id
 * is deliberately left unfiltered so an existing project of any type keeps
 * resolving its own spec correctly). GET /api/atlas/output-types (the
 * "choose a type" list) still returns all 24, each annotated with
 * `available` — the picker shows every type, with the other 23 visibly
 * disabled behind MAINTENANCE_MESSAGE, rather than hiding them outright.
 * New-project creation is where this is actually enforced (POST
 * /api/projects 403s for a disabled type), so the generic Atlas/Conductor/
 * Rubric engine this restriction sits in front of stays exercisable against
 * every type — which is exactly what project.test.ts and
 * project.authz.test.ts do, via __setEnabledOutputTypesForTests("all") in
 * their own beforeEach, since their real subject is that generic engine,
 * not the specific types they happen to use as fixtures.
 */

let enabled: Set<string> | "all" = new Set(["OT-10"]);

/** One shared message for every disabled type, not a per-type explanation — there isn't a different reason for each of the 23, so there shouldn't be a different sentence for each either. */
export const MAINTENANCE_MESSAGE =
  "This document type is under maintenance. Scholar Core currently supports Journal Article only.";

export function isOutputTypeEnabled(id: string): boolean {
  return enabled === "all" || enabled.has(id);
}

/** Test-only escape hatch — see module comment for why the generic-engine test suite needs this. */
export function __setEnabledOutputTypesForTests(ids: string[] | "all"): void {
  enabled = ids === "all" ? "all" : new Set(ids);
}
