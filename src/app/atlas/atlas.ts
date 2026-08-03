/**
 * app/atlas — public entry point.
 *
 * Spec: docs/01-product/13-MODULE-SPECIFICATIONS.md `app/atlas`:
 * "Output type catalog, intake schema rendering logic, default proposal,
 * type versioning, override precedence."
 *
 * Override precedence (docs 14-OUTPUT-TYPE-CATALOG.md §11: "user template →
 * institution profile → discipline variant → catalog default") is NOT yet
 * implemented — only the catalog-default layer exists so far. This module
 * is structured so those layers can be inserted between `catalog` and the
 * proposal functions without changing their call sites.
 */

import { Catalog } from "./catalog";
import OUTPUT_TYPES from "./catalogData";

export { Catalog } from "./catalog";
export type { ValidationIssue } from "./validate";
export { validateOutputType, validateCatalog } from "./validate";
export type {
  OutputTypeSpec,
  IntakeField,
  IntakeTier,
  FieldProposal,
  SectionSpec,
  StructureSpec,
  QualityGateSpec,
} from "./types";
export {
  proposeStructure,
  proposeIntakeValues,
  proposeCitationStyle,
  proposeTotalWordBudget,
  canProceedFromIntake,
  allIntakeFields,
} from "./proposals";
export type { StructureProposal } from "./proposals";

/** The default catalog, validated at construction time (fails fast on a bad entry). */
export const catalog = new Catalog(OUTPUT_TYPES);
